// server.js - Backend API Server (Hardened for Production)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
 
const app = express();
const PORT = process.env.PORT || 5000;
 
// ===================================
// Required secrets — fail fast instead of silently falling back
// ===================================
const REQUIRED_ENV = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
 
// ===================================
// Supabase Storage (product/blog images) — replaces local disk uploads,
// اللي كان بينمسح مع كل إعادة نشر على Render (قرص مؤقت).
// لازم تنشئ bucket عام (public) بهالاسم من لوحة Supabase.
// ===================================
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});
 
/**
 * يرفع ملف واحد (من multer memoryStorage) إلى Supabase Storage
 * ويرجع الرابط العام الكامل (https://xxxx.supabase.co/storage/v1/object/public/...).
 */
async function uploadToSupabase(file, folder = 'misc') {
    const safeExt = path.extname(file.originalname).toLowerCase();
    const key = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
    return data.publicUrl;
}
 
/** يرفع مجموعة ملفات بالتوازي، يرجع مصفوفة روابط بنفس الترتيب. */
async function uploadManyToSupabase(files = [], folder = 'misc') {
    return Promise.all(files.map((f) => uploadToSupabase(f, folder)));
}
 
// ===================================
// Database Connection (SSL for Render / Supabase / managed Postgres)
// ===================================
let poolConfig;
if (process.env.DATABASE_URL) {
    // Strip sslmode from the URL itself — recent pg-connection-string
    // versions treat sslmode=require/prefer/verify-ca as verify-full,
    // which rejects Render's self-signed cert regardless of the
    // explicit `ssl` option below. Let the `ssl` object be the only
    // source of truth.
    let cleanUrl;
    try {
        const u = new URL(process.env.DATABASE_URL);
        u.searchParams.delete('sslmode');
        cleanUrl = u.toString();
    } catch {
        cleanUrl = process.env.DATABASE_URL;
    }
    poolConfig = {
        connectionString: cleanUrl,
        ssl: { rejectUnauthorized: false },
    };
} else {
    poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'drsara_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };
}
 
const pool = new Pool(poolConfig);
 
pool.on('error', (err) => {
    // Errors on idle clients must not crash the whole process
    console.error('❌ Unexpected database error on idle client:', err.message);
});
 
let dbReady = false;
 
async function startServer() {
    try {
        const client = await pool.connect();
        console.log('✅ Database connected successfully');
        client.release();
        dbReady = true;
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
        // Fail the deploy loudly instead of serving traffic against a dead pool
        process.exit(1);
    }
 
    app.listen(PORT, () => {
        console.log(`🚀 Dr. Sara Backend running on port ${PORT}`);
    });
}
 
// ===================================
// Middleware
// ===================================
// Render/Cloudflare يضعان proxy أمام التطبيق — ضروري ليعمل req.ip بشكل صحيح
app.set('trust proxy', 1);
 
const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
 
if (allowedOrigins.length === 0) {
    console.warn('⚠️  FRONTEND_URL is not set — all origins will be allowed (development mode only).');
}
 
app.use(cors({
    origin: (origin, cb) => {
        // طلبات بدون Origin (curl, health checks, webhooks) مسموحة
        if (!origin) return cb(null, true);
        if (allowedOrigins.length === 0) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));
 
// رؤوس أمان أساسية بدون مكتبات إضافية
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '0');
    next();
});
 
// Capture raw body alongside JSON parsing so the Moyasar webhook can verify
// the HMAC signature (signature is computed over the exact raw bytes).
app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
 
// Readiness gate — reject requests until the DB pool is confirmed live
app.use((req, res, next) => {
    if (!dbReady && req.path !== '/health') {
        return res.status(503).json({ error: 'Service starting up, try again shortly' });
    }
    next();
});
 
app.get('/health', (req, res) => res.json({ status: 'ok', db: dbReady, timestamp: new Date() }));
 
// File Upload — check both mimetype and extension (mimetype alone is client-controlled)
// memoryStorage: الملف بيضل بالـ RAM كـ buffer لحد ما نرفعه لـ Supabase Storage،
// ما بينكتب على قرص السيرفر (قرص Render مؤقت وبينمسح مع كل إعادة نشر).
const ALLOWED_IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;
const ALLOWED_IMAGE_MIME = /^image\/(jpeg|png|gif|webp)$/;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_IMAGE_MIME.test(file.mimetype) && ALLOWED_IMAGE_EXT.test(file.originalname)) {
            return cb(null, true);
        }
        cb(new Error('Images only (jpeg, png, gif, webp)'));
    },
});
 
// ===================================
// Helpers
// ===================================
// تحقق أن الـ id رقم صحيح موجب — يمنع أخطاء 500 من Postgres على /products/abc
function safeId(val) {
    const n = Number.parseInt(val, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
}
 
// Rate limiter بسيط في الذاكرة (بدون مكتبات خارجية)
const rateBuckets = new Map();
function rateLimit({ windowMs, max, keyPrefix = '' }) {
    return (req, res, next) => {
        const key = `${keyPrefix}:${req.ip}`;
        const now = Date.now();
        const entry = rateBuckets.get(key);
        if (!entry || now > entry.resetAt) {
            rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }
        entry.count += 1;
        if (entry.count > max) {
            const retry = Math.ceil((entry.resetAt - now) / 1000);
            res.setHeader('Retry-After', retry);
            return res.status(429).json({ error: `محاولات كثيرة. حاول بعد ${retry} ثانية.` });
        }
        next();
    };
}
// تنظيف دوري للذاكرة
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateBuckets) if (now > v.resetAt) rateBuckets.delete(k);
}, 10 * 60 * 1000).unref();
 
function safeInt(val, def, lo = 1, hi = 1000) {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n) || Number.isNaN(n)) return def;
    return Math.min(Math.max(n, lo), hi);
}
 
// ===================================
// Auth Middleware
// ===================================
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.admin = decoded;
        next();
    });
};
 
const requireRole = (...roles) => (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
};
 
// ===================================
// AUTH ROUTES
// ===================================
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.LOGIN_RATE_LIMIT, 10) || 10,
    keyPrefix: 'login',
});
 
const publicWriteLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, keyPrefix: 'public' });
 
app.post('/api/admin/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
 
        const result = await pool.query('SELECT * FROM admins WHERE email=$1 AND is_active=true', [email]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
 
        const admin = result.rows[0];
        if (!await bcrypt.compare(password, admin.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
 
        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role, full_name: admin.full_name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ token, admin: { id: admin.id, email: admin.email, full_name: admin.full_name, role: admin.role } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.get('/api/admin/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, email, full_name, role FROM admins WHERE id=$1', [req.admin.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Admin not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
 
// ===================================
// CATEGORIES ROUTES
// ===================================
app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories WHERE is_active=true ORDER BY display_order, name_ar');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.post('/api/admin/categories', authenticateToken, async (req, res) => {
    try {
        const { name_ar, name_en, description } = req.body;
        const slug = (name_en || name_ar).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') + '-' + Date.now();
        const result = await pool.query(
            'INSERT INTO categories (name_ar, name_en, slug, description) VALUES ($1,$2,$3,$4) RETURNING *',
            [name_ar, name_en || null, slug, description || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.put('/api/admin/categories/:id', authenticateToken, async (req, res) => {
    try {
        const { name_ar, name_en, description, is_active } = req.body;
        const result = await pool.query(
            'UPDATE categories SET name_ar=$1, name_en=$2, description=$3, is_active=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
            [name_ar, name_en || null, description || null, is_active !== false, req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.delete('/api/admin/categories/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE categories SET is_active=false WHERE id=$1', [req.params.id]);
        res.json({ message: 'Category deactivated' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
 
// ===================================
// PRODUCTS ROUTES
// ===================================
app.get('/api/products', async (req, res) => {
    try {
        const { category, status, search, featured } = req.query;
        const page = safeInt(req.query.page, 1);
        const limit = safeInt(req.query.limit, 20, 1, 100);
        const offset = (page - 1) * limit;
        let conditions = ['1=1'];
        const params = [];
        let pc = 1;
 
        if (category) { conditions.push(`p.category_id=$${pc++}`); params.push(category); }
        if (status) { conditions.push(`p.status=$${pc++}`); params.push(status); }
        if (featured === 'true') conditions.push('p.is_featured=true');
        if (search) { conditions.push(`(p.name_ar ILIKE $${pc} OR p.short_description ILIKE $${pc})`); params.push(`%${search}%`); pc++; }
 
        const where = 'WHERE ' + conditions.join(' AND ');
        const result = await pool.query(
            `SELECT p.*, c.name_ar as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id ${where} ORDER BY p.is_featured DESC, p.created_at DESC LIMIT $${pc} OFFSET $${pc + 1}`,
            [...params, limit, offset]
        );
        const countResult = await pool.query(`SELECT COUNT(*) FROM products p ${where}`, params);
 
        res.json({ products: result.rows, total: parseInt(countResult.rows[0].count), page, totalPages: Math.ceil(countResult.rows[0].count / limit) });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.get('/api/products/:id', async (req, res) => {
    try {
        const id = safeId(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid product id' });
        const result = await pool.query(
            'SELECT p.*, c.name_ar as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.id=$1',
            [id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.post('/api/admin/products', authenticateToken, upload.array('images', 5), async (req, res) => {
    try {
        const { category_id, name_ar, name_en, price, sale_price, short_description, description, stock_quantity, sku, track_inventory, is_featured, is_digital, status } = req.body;
        if (!name_ar || !price) return res.status(400).json({ error: 'Name and price are required' });
 
        const images = req.files?.length ? await uploadManyToSupabase(req.files, 'products') : [];
        const finalSku = sku || 'SKU-' + Date.now();
 
        const result = await pool.query(
            `INSERT INTO products (category_id,name_ar,name_en,price,sale_price,short_description,description,stock_quantity,sku,track_inventory,is_featured,is_digital,status,images)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
            [
                category_id || null, name_ar, name_en || null,
                parseFloat(price), sale_price ? parseFloat(sale_price) : null,
                short_description || null, description || null,
                parseInt(stock_quantity) || 0, finalSku,
                track_inventory !== 'false',
                is_featured === 'true' || is_featured === true,
                is_digital === 'true' || is_digital === true,
                status || 'published', JSON.stringify(images)
            ]
        );
        await pool.query('INSERT INTO activity_logs (admin_id,action,entity_type,entity_id,description) VALUES ($1,$2,$3,$4,$5)', [req.admin.id, 'created', 'product', result.rows[0].id, `Created: ${name_ar}`]).catch(() => {});
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.put('/api/admin/products/:id', authenticateToken, upload.array('images', 5), async (req, res) => {
    try {
        const { category_id, name_ar, name_en, price, sale_price, short_description, description, stock_quantity, sku, track_inventory, is_featured, is_digital, status, existing_images } = req.body;
        let images = [];
        try { images = existing_images ? JSON.parse(existing_images) : []; } catch { images = []; }
        if (req.files?.length) images = [...images, ...(await uploadManyToSupabase(req.files, 'products'))];
 
        const result = await pool.query(
            `UPDATE products SET category_id=$1,name_ar=$2,name_en=$3,price=$4,sale_price=$5,short_description=$6,description=$7,stock_quantity=$8,sku=$9,track_inventory=$10,is_featured=$11,is_digital=$12,status=$13,images=$14,updated_at=NOW() WHERE id=$15 RETURNING *`,
            [category_id || null, name_ar, name_en || null, parseFloat(price), sale_price ? parseFloat(sale_price) : null, short_description || null, description || null, parseInt(stock_quantity) || 0, sku, track_inventory !== 'false', is_featured === 'true' || is_featured === true, is_digital === 'true' || is_digital === true, status || 'published', JSON.stringify(images), req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.delete('/api/admin/products/:id', authenticateToken, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
        const product = await pool.query('SELECT name_ar FROM products WHERE id=$1', [req.params.id]);
        if (!product.rows.length) return res.status(404).json({ error: 'Product not found' });
        await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
 
// ===================================
// ORDERS ROUTES
// ===================================
app.get('/api/admin/orders', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query;
        const page = safeInt(req.query.page, 1);
        const limit = safeInt(req.query.limit, 20, 1, 100);
        const offset = (page - 1) * limit;
        let conditions = ['1=1'];
        const params = [];
        let pc = 1;
        if (status) { conditions.push(`status=$${pc++}`); params.push(status); }
        const where = 'WHERE ' + conditions.join(' AND ');
        const result = await pool.query(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${pc} OFFSET $${pc + 1}`, [...params, limit, offset]);
        const count = await pool.query(`SELECT COUNT(*) FROM orders ${where}`, params);
        res.json({ orders: result.rows, total: parseInt(count.rows[0].count), page, totalPages: Math.ceil(count.rows[0].count / limit) });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.get('/api/admin/orders/:id', authenticateToken, async (req, res) => {
    try {
        const order = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
        if (!order.rows.length) return res.status(404).json({ error: 'Order not found' });
        const items = await pool.query('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);
        res.json({ ...order.rows[0], items: items.rows });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.patch('/api/admin/orders/:id/status', authenticateToken, async (req, res) => {
    try {
        const { status, tracking_number } = req.body;
        let set = 'status=$1, updated_at=NOW()';
        const params = [status];
        if (status === 'shipped' && tracking_number) { set += ', tracking_number=$2, shipped_at=NOW()'; params.push(tracking_number); }
        else if (status === 'delivered') set += ', delivered_at=NOW()';
        params.push(req.params.id);
        const result = await pool.query(`UPDATE orders SET ${set} WHERE id=$${params.length} RETURNING *`, params);
        if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
 
// Order creation — stock is decremented atomically per-item so two
// concurrent checkouts can never both succeed on the last unit.
app.post('/api/orders', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { customer, items, shipping, payment_method, coupon_code } = req.body;
        if (!customer?.email || !items?.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Customer info and items required' });
        }
 
        const products = await client.query('SELECT * FROM products WHERE id = ANY($1)', [items.map(i => i.product_id)]);
        const productMap = {};
        products.rows.forEach(p => productMap[p.id] = p);
 
        let subtotal = 0;
        for (const item of items) {
            const product = productMap[item.product_id];
            if (!product) throw new Error(`Product not found: ${item.product_id}`);
            if (!item.quantity || item.quantity <= 0) throw new Error(`Invalid quantity for product: ${item.product_id}`);
            subtotal += (product.sale_price || product.price) * item.quantity;
        }
 
        const shippingMethod = shipping?.method_id ? await client.query('SELECT * FROM shipping_methods WHERE id=$1', [shipping.method_id]) : { rows: [] };
        const sm = shippingMethod.rows[0];
        let shippingCost = sm?.price || 0;
        if (sm?.free_shipping_threshold && subtotal >= sm.free_shipping_threshold) shippingCost = 0;
 
        let discount = 0;
        let coupon = null;
        if (coupon_code) {
            const couponResult = await client.query(`SELECT * FROM coupons WHERE UPPER(code)=UPPER($1) AND is_active=true AND (expires_at IS NULL OR expires_at > NOW()) AND (usage_limit IS NULL OR times_used < usage_limit) FOR UPDATE`, [coupon_code]);
            coupon = couponResult.rows[0];
            if (coupon && subtotal >= (coupon.minimum_order_amount || 0)) {
                discount = coupon.discount_type === 'percentage' ? subtotal * coupon.discount_value / 100 : coupon.discount_value;
                await client.query('UPDATE coupons SET times_used=times_used+1 WHERE id=$1', [coupon.id]);
            } else {
                coupon = null;
            }
        }
 
        const tax = (subtotal - discount) * 0.15;
        const total = subtotal + shippingCost - discount + tax;
        const orderNumber = 'ORD-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
 
        let customerId;
        const existing = await client.query('SELECT id FROM customers WHERE email=$1', [customer.email]);
        if (existing.rows.length) {
            customerId = existing.rows[0].id;
        } else {
            // first_name / last_name في الجدول NOT NULL — نمنع انهيار الطلب لو ناقصين
            const nc = await client.query(
                'INSERT INTO customers (email,phone,first_name,last_name) VALUES ($1,$2,$3,$4) RETURNING id',
                [customer.email, customer.phone || null, customer.first_name || '-', customer.last_name || '-']
            );
            customerId = nc.rows[0].id;
        }
 
        const order = await client.query(
            `INSERT INTO orders (order_number,customer_id,customer_email,customer_phone,customer_name,shipping_address,subtotal,shipping_cost,tax,discount,total,coupon_code,status,payment_method,shipping_method,payment_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,'pending') RETURNING *`,
            [orderNumber, customerId, customer.email, customer.phone, `${customer.first_name} ${customer.last_name}`, JSON.stringify(shipping?.address || {}), subtotal, shippingCost, tax, discount, total, coupon_code || null, payment_method, sm?.name_ar || 'standard']
        );
 
        for (const item of items) {
            const p = productMap[item.product_id];
            const price = p.sale_price || p.price;
 
            // Atomic, race-safe stock decrement: only succeeds if enough stock remains.
            if (p.track_inventory) {
                const stockUpdate = await client.query(
                    'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id=$2 AND stock_quantity >= $1 RETURNING stock_quantity',
                    [item.quantity, item.product_id]
                );
                if (!stockUpdate.rows.length) {
                    throw new Error(`الكمية غير متوفرة: ${p.name_ar}`);
                }
            }
 
            await client.query(
                `INSERT INTO order_items (order_id,product_id,product_name,product_sku,product_image,price,quantity,subtotal) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [order.rows[0].id, item.product_id, p.name_ar, p.sku, p.images?.[0] || null, price, item.quantity, price * item.quantity]
            );
        }
 
        await client.query('COMMIT');
        res.status(201).json({ order_id: order.rows[0].id, order_number: orderNumber, total, subtotal, shipping_cost: shippingCost, tax, discount, status: 'pending' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create order error:', error);
        res.status(400).json({ error: error.message || 'فشل إنشاء الطلب' });
    } finally {
        client.release();
    }
});
 
app.get('/api/orders/public/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT id,order_number,total,payment_status,status,shipping_method,created_at FROM orders WHERE id=$1', [req.params.id]);
        if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });
        res.json(result.rows[0]);
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
app.post('/api/coupons/validate', async (req, res) => {
    try {
        const { code, amount } = req.body;
        const result = await pool.query(`SELECT * FROM coupons WHERE UPPER(code)=UPPER($1) AND is_active=true AND (expires_at IS NULL OR expires_at > NOW()) AND (usage_limit IS NULL OR times_used < usage_limit)`, [code]);
        if (!result.rows.length) return res.json({ valid: false, error: 'الكوبون غير صالح' });
        const coupon = result.rows[0];
        if (amount < (coupon.minimum_order_amount || 0)) return res.json({ valid: false, error: `الحد الأدنى ${coupon.minimum_order_amount} ر.س` });
        const discount = coupon.discount_type === 'percentage' ? amount * coupon.discount_value / 100 : coupon.discount_value;
        res.json({ valid: true, discount: Math.min(discount, amount), code: coupon.code });
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
// ===================================
// SHIPPING ROUTES
// ===================================
app.get('/api/shipping/methods', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM shipping_methods WHERE is_active=true ORDER BY display_order');
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
app.post('/api/shipping/calculate', async (req, res) => {
    try {
        const { shipping_method_id } = req.body;
        const method = await pool.query('SELECT * FROM shipping_methods WHERE id=$1 AND is_active=true', [shipping_method_id]);
        if (!method.rows.length) return res.status(404).json({ error: 'طريقة الشحن غير موجودة' });
        const m = method.rows[0];
        res.json({ method: m.name_ar, cost: m.price, estimated_days: `${m.estimated_days_min}-${m.estimated_days_max} أيام عمل`, free_shipping_threshold: m.free_shipping_threshold, currency: 'SAR' });
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
app.get('/api/shipping/track/:tracking_number', async (req, res) => {
    try {
        const order = await pool.query('SELECT order_number,shipping_company,tracking_number,status,shipped_at FROM orders WHERE tracking_number=$1', [req.params.tracking_number]);
        if (!order.rows.length) return res.status(404).json({ error: 'رقم التتبع غير موجود' });
        res.json(order.rows[0]);
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
// ===================================
// BOOKINGS ROUTES
// ===================================
app.post('/api/bookings', publicWriteLimiter, async (req, res) => {
    try {
        const { first_name, last_name, email, phone, session_type, date, time_slot, consultation_topic, notes } = req.body;
        if (!first_name || !email || !session_type || !date || !time_slot) return res.status(400).json({ error: 'Required fields missing' });
 
        const bookingRef = 'BK-' + Date.now();
        let customerId;
        const existing = await pool.query('SELECT id FROM customers WHERE email=$1', [email]);
        if (existing.rows.length) { customerId = existing.rows[0].id; }
        else {
            const nc = await pool.query(
                'INSERT INTO customers (email,phone,first_name,last_name) VALUES ($1,$2,$3,$4) RETURNING id',
                [email, phone || null, first_name || '-', last_name || '-']
            );
            customerId = nc.rows[0].id;
        }
 
        await pool.query(`INSERT INTO bookings (booking_ref,customer_id,customer_name,customer_email,customer_phone,session_type,booking_date,time_slot,consultation_topic,notes,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`,
            [bookingRef, customerId, `${first_name} ${last_name}`, email, phone, session_type, date, time_slot, consultation_topic || null, notes || null]);
        res.status(201).json({ booking_ref: bookingRef, status: 'pending' });
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({ error: 'فشل حفظ الحجز' });
    }
});
 
app.get('/api/admin/bookings', authenticateToken, async (req, res) => {
    try {
        const { status } = req.query;
        const page = safeInt(req.query.page, 1);
        const limit = safeInt(req.query.limit, 20, 1, 100);
        const offset = (page - 1) * limit;
        let conditions = ['1=1'];
        const params = [];
        let pc = 1;
        if (status) { conditions.push(`status=$${pc++}`); params.push(status); }
        const where = 'WHERE ' + conditions.join(' AND ');
        const result = await pool.query(`SELECT * FROM bookings ${where} ORDER BY created_at DESC LIMIT $${pc} OFFSET $${pc + 1}`, [...params, limit, offset]);
        const count = await pool.query(`SELECT COUNT(*) FROM bookings ${where}`, params);
        res.json({ bookings: result.rows, total: parseInt(count.rows[0].count) });
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
app.patch('/api/admin/bookings/:id/status', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('UPDATE bookings SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [req.body.status, req.params.id]);
        if (!result.rows.length) return res.status(404).json({ error: 'Booking not found' });
        res.json(result.rows[0]);
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
// ===================================
// CONTACT MESSAGES
// ===================================
app.post('/api/contact', publicWriteLimiter, async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        if (!name || !email || !subject || !message) return res.status(400).json({ error: 'Required fields missing' });
        await pool.query('INSERT INTO contact_messages (name,email,phone,subject,message) VALUES ($1,$2,$3,$4,$5)', [name, email, phone || null, subject, message]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
app.get('/api/admin/messages', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100');
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
app.patch('/api/admin/messages/:id/read', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE contact_messages SET is_read=true WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
// ===================================
// BLOG ROUTES
// ===================================
app.get('/api/blog', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM blog_posts WHERE status='published' ORDER BY created_at DESC LIMIT 50");
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
app.post('/api/admin/blog', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { title_ar, excerpt_ar, content_ar, category, status } = req.body;
        if (!title_ar) return res.status(400).json({ error: 'Title required' });
        const slug = title_ar.replace(/\s+/g, '-').replace(/[^\w\u0621-\u064A-]/g, '') + '-' + Date.now();
        const image = req.file ? await uploadToSupabase(req.file, 'blog') : null;
        const result = await pool.query(
            `INSERT INTO blog_posts (title_ar,excerpt_ar,content_ar,slug,category,status,image_url,author_id,published_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [title_ar, excerpt_ar || null, content_ar || null, slug, category || null, status || 'draft', image, req.admin.id, status === 'published' ? new Date() : null]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
app.put('/api/admin/blog/:id', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { title_ar, excerpt_ar, content_ar, category, status } = req.body;
        const image = req.file ? await uploadToSupabase(req.file, 'blog') : req.body.existing_image;
        const result = await pool.query(
            `UPDATE blog_posts SET
        title_ar=$1, excerpt_ar=$2, content_ar=$3, category=$4, status=$5::varchar, image_url=$6, updated_at=NOW(),
        published_at = CASE WHEN $5::varchar='published' AND published_at IS NULL THEN NOW() ELSE published_at END
        WHERE id=$7 RETURNING *`,
            [title_ar, excerpt_ar, content_ar, category, status, image, req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Post not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.delete('/api/admin/blog/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM blog_posts WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
// ===================================
// DASHBOARD STATS
// ===================================
app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    try {
        const [revenue, orders, products, customers, bookings, messages, lowStock, recentOrders, recentBookings] = await Promise.all([
            pool.query("SELECT COALESCE(SUM(total),0) as total FROM orders WHERE payment_status='paid'"),
            pool.query("SELECT COUNT(*) as total, COUNT(CASE WHEN status='pending' THEN 1 END) as pending FROM orders"),
            pool.query("SELECT COUNT(*) as total FROM products WHERE status='published'"),
            pool.query("SELECT COUNT(*) as total FROM customers"),
            pool.query("SELECT COUNT(*) as total, COUNT(CASE WHEN status='pending' THEN 1 END) as pending FROM bookings"),
            pool.query("SELECT COUNT(*) as total FROM contact_messages WHERE is_read=false"),
            pool.query("SELECT COUNT(*) as total FROM products WHERE stock_quantity <= low_stock_threshold AND track_inventory=true"),
            pool.query("SELECT id,order_number,customer_name,total,status,created_at FROM orders ORDER BY created_at DESC LIMIT 5"),
            pool.query("SELECT id,booking_ref,customer_name,session_type,booking_date,time_slot,status FROM bookings ORDER BY created_at DESC LIMIT 5"),
        ]);
        res.json({
            revenue: parseFloat(revenue.rows[0].total),
            orders: { total: parseInt(orders.rows[0].total), pending: parseInt(orders.rows[0].pending) },
            products: parseInt(products.rows[0].total),
            customers: parseInt(customers.rows[0].total),
            bookings: { total: parseInt(bookings.rows[0].total), pending: parseInt(bookings.rows[0].pending) },
            unread_messages: parseInt(messages.rows[0].total),
            low_stock: parseInt(lowStock.rows[0].total),
            recent_orders: recentOrders.rows,
            recent_bookings: recentBookings.rows,
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
 
// alias متوافق مع النسخ القديمة من الفرونت إند — نفس بيانات /api/admin/stats
app.get('/api/admin/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const [revenue, monthRevenue, ordersCount, pendingOrders, productsCount, lowStock, customersCount] = await Promise.all([
            pool.query("SELECT COALESCE(SUM(total),0) as v FROM orders WHERE payment_status='paid'"),
            pool.query("SELECT COALESCE(SUM(total),0) as v FROM orders WHERE payment_status='paid' AND created_at >= NOW()-INTERVAL '30 days'"),
            pool.query('SELECT COUNT(*) as v FROM orders'),
            pool.query("SELECT COUNT(*) as v FROM orders WHERE status='pending'"),
            pool.query('SELECT COUNT(*) as v FROM products'),
            pool.query('SELECT COUNT(*) as v FROM products WHERE stock_quantity <= low_stock_threshold AND track_inventory=true'),
            pool.query('SELECT COUNT(*) as v FROM customers'),
        ]);
        res.json({
            total_revenue: parseFloat(revenue.rows[0].v),
            month_revenue: parseFloat(monthRevenue.rows[0].v),
            total_orders: parseInt(ordersCount.rows[0].v),
            pending_orders: parseInt(pendingOrders.rows[0].v),
            total_products: parseInt(productsCount.rows[0].v),
            low_stock_count: parseInt(lowStock.rows[0].v),
            total_customers: parseInt(customersCount.rows[0].v),
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
 
app.get('/api/admin/customers', authenticateToken, async (req, res) => {
    try {
        const page = safeInt(req.query.page, 1);
        const limit = safeInt(req.query.limit, 20, 1, 100);
        const offset = (page - 1) * limit;
        const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
        const count = await pool.query('SELECT COUNT(*) FROM customers');
        res.json({ customers: result.rows, total: parseInt(count.rows[0].count) });
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});
 
// ===================================
// PAYMENT ROUTES (Moyasar)
// ===================================
function moyasarConfigured() {
    return process.env.MOYASAR_API_KEY && !process.env.MOYASAR_API_KEY.includes('YOUR_KEY');
}
 
app.post('/api/payments/create', async (req, res) => {
    try {
        if (!moyasarConfigured()) {
            return res.status(503).json({ error: 'Payment gateway not configured. Contact admin.' });
        }
        const { amount, currency = 'SAR', description, callback_url, metadata } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
 
        const response = await axios.post(
            'https://api.moyasar.com/v1/payments',
            {
                amount: Math.round(amount * 100),
                currency,
                description,
                callback_url: callback_url || `${process.env.FRONTEND_URL}/order-success`,
                source: { type: 'creditcard' },
                metadata,
            },
            { auth: { username: process.env.MOYASAR_API_KEY, password: '' } }
        );
        res.json({ payment_id: response.data.id, payment_url: response.data.source?.transaction_url, status: response.data.status });
    } catch (error) {
        console.error('Payment create error:', error.response?.data || error.message);
        res.status(500).json({ error: 'فشل إنشاء جلسة الدفع' });
    }
});
 
app.get('/api/payments/verify/:payment_id', async (req, res) => {
    try {
        if (!moyasarConfigured()) return res.status(503).json({ error: 'Payment gateway not configured' });
 
        const response = await axios.get(
            `https://api.moyasar.com/v1/payments/${req.params.payment_id}`,
            { auth: { username: process.env.MOYASAR_API_KEY, password: '' } }
        );
        const payment = response.data;
        if (payment.status === 'paid' && payment.metadata?.order_id) {
            await pool.query(
                `UPDATE orders SET payment_status='paid', payment_transaction_id=$1, paid_at=NOW(), status='processing', updated_at=NOW() WHERE id=$2 AND payment_status != 'paid'`,
                [req.params.payment_id, payment.metadata.order_id]
            );
        }
        res.json({ status: payment.status, amount: payment.amount / 100, currency: payment.currency, order_id: payment.metadata?.order_id });
    } catch (error) {
        console.error('Payment verify error:', error.response?.data || error.message);
        res.status(500).json({ error: 'فشل التحقق من الدفع' });
    }
});
 
// Webhook — signature is REQUIRED. Without MOYASAR_WEBHOOK_SECRET set,
// anyone could POST a forged "payment.paid" event and mark any order paid.
app.post('/api/payments/webhook', async (req, res) => {
    try {
        const webhookSecret = process.env.MOYASAR_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error('❌ MOYASAR_WEBHOOK_SECRET not set — rejecting webhook');
            return res.status(500).json({ error: 'Webhook not configured' });
        }
 
        const signature = req.headers['x-moyasar-signature'] || req.headers['x-webhook-signature'];
        if (!signature || !req.rawBody) {
            return res.status(401).json({ error: 'Missing signature' });
        }
 
        const expected = crypto.createHmac('sha256', webhookSecret).update(req.rawBody).digest('hex');
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
 
        const { type, data } = req.body;
        if (type === 'payment.paid' && data?.metadata?.order_id) {
            await pool.query(
                `UPDATE orders SET payment_status='paid', payment_transaction_id=$1, paid_at=NOW(), status='processing', updated_at=NOW() WHERE id=$2 AND payment_status != 'paid'`,
                [data.id, data.metadata.order_id]
            );
        }
        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook failed' });
    }
});
 
// ===================================
// Error Handlers
// ===================================
app.use((err, req, res, next) => {
    console.error('Error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 5MB.' });
    res.status(500).json({ error: 'Internal server error' });
});
 
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
 
// ===================================
// Start
// ===================================
startServer();
