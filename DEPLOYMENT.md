# 🚀 دليل التسليم والنشر — موقع د. سارة

---

## ⚡ الطريقة الأسرع للتشغيل محلياً (للتسليم المبدئي)

### المتطلبات
- Node.js 18+ → [nodejs.org](https://nodejs.org)
- PostgreSQL → [postgresql.org/download](https://www.postgresql.org/download/)

### خطوة بخطوة

```bash
# 1. استنسخ المشروع وادخل عليه
cd Dr.sara-s-Website-master

# 2. شغّل سكريبت الإعداد التلقائي
bash setup.sh

# أو يدوياً:
# إنشاء قاعدة البيانات
psql -U postgres -c "CREATE DATABASE drsara_db;"
psql -U postgres -d drsara_db -f database/schema.sql

# تثبيت Dependencies
cd backend && npm install && cd ..
npm install

# 3. شغّل Backend (Terminal 1)
cd backend
npm start
# يجب أن ترى: ✅ Database connected | ✅ Running on http://localhost:5000

# 4. شغّل Frontend (Terminal 2)
npm run dev
# يجب أن ترى: Local: http://localhost:3000
```

### 🔑 بيانات الأدمن
| | |
|---|---|
| **الرابط** | http://localhost:3000/login |
| **Email** | dr.sara@example.com |
| **Password** | Admin@123 |

---

## ☁️ النشر المجاني على الإنترنت (Supabase + Render + Cloudflare Pages)

### الجزء 1: قاعدة البيانات على Supabase (مجاني)

1. روح [supabase.com](https://supabase.com) → Sign Up
2. اعمل Project جديد
3. من القائمة اليسرى → **SQL Editor**
4. انسخ كل محتوى ملف `database/schema.sql` والصقه واضغط **Run**
5. من **Settings → Database** انسخ هذه البيانات:
   - Host, Port, Database name, User, Password

### الجزء 2: Backend على Render (مجاني)

1. روح [render.com](https://render.com) → Sign Up
2. **New → Web Service**
3. اربطه بـ GitHub repo (ارفع المشروع أولاً)
4. الإعدادات:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. من **Environment Variables** أضف:
   ```
   DB_HOST=<من Supabase>
   DB_PORT=5432
   DB_NAME=<من Supabase>
   DB_USER=postgres
   DB_PASSWORD=<كلمة المرور>
   DB_SSL=true
   JWT_SECRET=dr-sara-super-secret-2024-change-this
   NODE_ENV=production
   FRONTEND_URL=https://your-site.pages.dev
   PORT=5000
   SUPABASE_URL=<من Supabase → Settings → API>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key، وليس anon key>
   SUPABASE_STORAGE_BUCKET=uploads
   ```
   وأنشئ الـ bucket نفسه من Supabase → **Storage** → New bucket → اسمه `uploads` واجعله **Public**.
6. انسخ الرابط اللي يعطيك إياه Render (مثل: `https://drsara-backend.onrender.com`)

### الجزء 3: Frontend على Cloudflare Pages (مجاني)

1. روح [pages.cloudflare.com](https://pages.cloudflare.com) → Sign Up
2. **Create a project** → **Connect to Git** → اختر الـ repository
3. الإعدادات:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. **Environment variables** أضف:
   ```
   VITE_API_URL=/api
   VITE_MOYASAR_PUBLISHABLE_KEY=pk_live_xxx
   BACKEND_URL=https://drsara-backend.onrender.com
   ```
   > `VITE_API_URL=/api` يخلي الفرونت يستخدم نفس الدومين، و`functions/api/[[path]].js`
   > (Pages Function) هو يلي بيعمل proxy فعلي لـ `BACKEND_URL` — لازم الاثنين مضبوطين.
5. **Save and Deploy** → انسخ الرابط النهائي (`https://your-site.pages.dev`)

### الجزء 4: تحديث FRONTEND_URL في Render
- ارجع لـ Render → Environment Variables
- حدّث `FRONTEND_URL` بالرابط اللي أعطاك إياه Cloudflare Pages

---

## 🐛 المشاكل الشائعة وحلولها

### ❌ "Database connection error"
```
الحل: تأكد PostgreSQL شغال
sudo service postgresql start   # Linux
# أو افتح pgAdmin وتأكد الـ service شغال

تأكد backend/.env صح:
DB_HOST=localhost
DB_PASSWORD=<كلمة مرورك>
```

### ❌ "Cannot GET /api/products"
```
الحل: تأكد البيكند شغال على port 5000
cd backend && npm start
```

### ❌ صفحة Login تعطي خطأ
```
الحل: تأكد الجداول تم إنشاؤها
psql -U postgres -d drsara_db -c "SELECT * FROM admins;"
إذا فاضية: شغّل schema.sql مرة ثانية
```

### ❌ الصور ما تظهر بعد الرفع
```
الحل: تأكد إن:
1. عملت bucket اسمه uploads (أو الاسم يلي حاططه بـ SUPABASE_STORAGE_BUCKET) من Supabase → Storage
2. الـ bucket مضبوط Public
3. SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY صح في backend/.env
```

### ❌ "port already in use"
```bash
# اقتل البروسيس على port 5000
lsof -ti:5000 | xargs kill -9   # Mac/Linux
netstat -ano | findstr :5000    # Windows ثم أوقف العملية
```

---

## 📋 ملخص المشاكل اللي تم إصلاحها

| المشكلة | الملف | الإصلاح |
|---------|-------|---------|
| Port خطأ في api.js | `.env` | `VITE_API_URL=/api` (يستخدم vite proxy) |
| `bcrypt` مش `bcryptjs` | `backend/package.json` | يستخدم `bcryptjs` الصح |
| slug مش له default في categories | `schema.sql` | أضفنا slug تلقائي |
| لا يوجد `ON CONFLICT` في inserts | `schema.sql` | أضفنا لكل INSERT |
| activity_logs يفشل ويوقف العملية | `server.js` | `.catch(() => {})` |
| SSL مش configured لـ cloud DB | `server.js` | `DB_SSL=true` option |
| لا يوجد uploads folder check | `server.js` | `fs.mkdirSync` تلقائي |
| Transaction في create order | `server.js` | BEGIN/COMMIT/ROLLBACK |
| missing `GET /api/admin/me` | `server.js` | أضفناه |

---

## 🔐 قبل النشر النهائي (Production Checklist)

- [ ] غيّر `JWT_SECRET` لشيء عشوائي طويل
- [ ] غيّر باسورد الأدمن `Admin@123`
- [ ] أضف مفتاح Moyasar للدفع
- [ ] فعّل HTTPS
- [ ] ضع domain حقيقي في `FRONTEND_URL`
- [ ] راجع `cors` origin يكون domain محدد مش `*`

---

## 💡 ملاحظة للتسليم المبدئي

الموقع يعمل بشكل كامل **بدون** Moyasar (الدفع). الدكتورة تقدر:
- تدخل لوحة التحكم وتضيف المنتجات ✅
- تشوف الحجوزات ✅
- ترد على الرسائل ✅
- تنشر مقالات ✅

الدفع يضاف لاحقاً بعد التسجيل في [moyasar.com](https://moyasar.com)
