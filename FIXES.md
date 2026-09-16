# تقرير المراجعة والإصلاحات — نسخة محسّنة

هذا الملف يشرح كل تعديل تم في هذه النسخة، وشو لازم تعمله إنت يدوياً.

---

## 🔄 تحديث: Cloudflare Pages بدل Vercel + Supabase Storage بدل قرص Render

- `vercel.json` انحذف. بدالها `functions/api/[[path]].js` (Cloudflare Pages Function)
  يعمل proxy لـ `/api/*` نحو الباك إند على Render، و `public/_redirects` للـ SPA fallback،
  و `public/_headers` لكاش ملفات `/assets/*`. اضبط متغير `BACKEND_URL` من إعدادات
  Cloudflare Pages (راجع `DEPLOYMENT.md`).
- الصور صارت تترفع مباشرة لـ Supabase Storage بدل `backend/uploads/` — راجع القسم
  "الصور على Render مؤقتة" بالأسفل، صار منفّذ فعلياً بدل ما يكون توصية. لازم تضيف
  `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` و `SUPABASE_STORAGE_BUCKET` بـ
  `backend/.env` وتنشئ الـ bucket (Public) من لوحة Supabase.
- **ملاحظة مهمة:** أي صورة قديمة بالداتابيس مخزّنة كمسار نسبي `/uploads/xxx.jpg`
  (من النسخة القديمة) رح تنكسر، لأن السيرفر ما عاد يخدم `/uploads` من القرص المحلي.
  إذا عندك بيانات حقيقية بالإنتاج، ارفعها يدوياً لـ Supabase Storage وحدّث الروابط
  بقاعدة البيانات قبل النشر.

---

## 🔴 خطوات مطلوبة منك (بدونها الموقع ما بيشتغل صح)

### 1. اضبط `BACKEND_URL` على Cloudflare Pages
من إعدادات مشروع Cloudflare Pages → Environment variables، أضف
`BACKEND_URL = https://your-backend.onrender.com` (بدون `/api`).

هذا هو المتغير يلي بيقرأه `functions/api/[[path]].js` ليعمل proxy لكل طلبات
`/api/...` من الموقع نحو الباك إند بدل ما ترجع صفحة HTML.

### 2. متغيرات البيئة

**على Cloudflare Pages** (Settings → Environment Variables):
```
VITE_API_URL = /api
VITE_MOYASAR_PUBLISHABLE_KEY = pk_live_xxx
BACKEND_URL = https://your-backend.onrender.com
```
> `VITE_API_URL=/api` يخلي الفرونت يستخدم نفس الدومين، والـ Pages Function
> هي يلي بتعمل الـ proxy الفعلي. لو ضبطت `VITE_API_URL` برابط الباك إند مباشرة
> بدل ما تستخدم الـ proxy، تأكد CORS مضبوط (`FRONTEND_URL` بالباك إند).

**على Render** (Environment):
```
DATABASE_URL, JWT_SECRET, FRONTEND_URL, MOYASAR_API_KEY, MOYASAR_WEBHOOK_SECRET,
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET
```
الملفات `.env.example` و `backend/.env.example` فيها الشرح الكامل لكل متغير.

### 3. توحيد قاعدة البيانات
في Supabase → SQL Editor:
1. شغّل `database/RESET.sql` (بيحذف كل الجداول القديمة والخاطئة).
2. بعدها الصق محتوى `database/schema.sql` كامل وشغّله.

بيرجع معك حساب أدمن: `dr.sara@example.com` / `Admin@123`.

**إذا ما زبط تسجيل الدخول** (يعني الهاش الجاهز مش مطابق)، ولّد هاش جديد:
```bash
cd backend && npm install
node scripts/hash-password.js "كلمة-المرور-الجديدة" dr.sara@example.com
```
وشغّل جملة الـ SQL يلي بيطبعها. **غيّر `Admin@123` فوراً بعد أول دخول** — كلمة معروفة ومنشورة.

---

## 🐞 أخطاء إضافية اكتشفتها (غير يلي كنت عارفها)

### 1. أخطر خطأ: الفرونت كله بينادي `/api` مباشرة
`AuthContext.jsx` وكل صفحات `admin/sections/*` وصفحات `ContactPage` و `BookingPage`
كانت مكتوبة `const API = '/api'` — هذا بيشتغل محلياً بس بفضل الـ proxy في Vite،
وعلى Vercel بيروح للدومين نفسه → **404 أو صفحة HTML**، فتسجيل الدخول والرسائل والحجوزات
كلها تفشل في الإنتاج.

> وهون نقطة مهمة: لو ضفت `vercel.json` بـ rewrite واحد فقط (`/(.*) → /index.html`)
> زي ما اقترح التقرير السابق، **بتصير المشكلة أسوأ**: طلبات `/api/...` بترجع محتوى
> `index.html`، والكود بيحاول يعمل `JSON.parse` لـ HTML ويعطي خطأ غامض.
> لهذا `vercel.json` هون فيه استثناء `/api` و `/uploads` **قبل** الـ catch-all.

**الحل:** ملف واحد مركزي `src/lib/apiClient.js` فيه `API_BASE` و `mediaUrl()` و `apiFetch()`،
وكل الملفات صارت تستورد منه.

### 2. روابط الصور مكتوبة `http://localhost:5000` داخل الكود
في `ProductsPage`, `AdminProducts`, `AdminBlog` — يعني كل صور المنتجات والمدونة
**مكسورة على الموقع المنشور**. وفي `AdminProducts` و `CartPage` و `CoursesPage` كان
مستخدم `import.meta.env.VITE_BASE_URL` وهو متغير غير معرّف أصلاً → الرابط بيصير
`undefined/uploads/xxx.jpg`.
**الحل:** دالة `mediaUrl()` موحّدة + صورة بديلة مدمجة بدل `via.placeholder.com`.

### 3. السلة بتتجاهل سعر الخصم
`CartContext.getTotal()` كان يقرأ `item.discount_price`، والعمود في قاعدة البيانات
اسمه `sale_price`. النتيجة: العميل يشوف السعر الكامل في السلة، والباك إند يحسب
سعر الخصم → **مجموع مختلف بين الشاشة والطلب**. تم التصحيح في `CartContext` و `CartPage`
و `CheckoutPage`.

### 4. الدفع ما بيتأكد أبداً
`OrderSuccessPage` كان يقرأ `payment_id` من الرابط **وما يستخدمه**. يعني الطلب بيضل
`payment_status = 'pending'` حتى لو العميل دفع، إلا إذا الـ webhook مضبوط.
تم إضافة استدعاء `/payments/verify/:id` قبل عرض الطلب.

### 5. `backend/package.json` فيه `bcrypt` و `bcryptjs` مع بعض
الكود يستخدم `bcryptjs` فقط. و`bcrypt` مكتبة native كثير مرات بيفشل بناؤها على Render
وبتوقع النشر. تم حذفها + حذف `express-validator` (غير مستخدمة) + ترقية `multer`
من 1.x (مهجورة وفيها ثغرات) لـ 2.x.

### 6. `package.json`: أمر البناء بينادي ملف غير موجود
`"build": "node tools/generate-llms.js || true && vite build"` — مجلد `tools/` غير موجود
بالمشروع. صار `"build": "vite build"`. كمان حذفت `"proxy"` (إعداد خاص بـ Create React App،
بلا أي أثر في Vite وبيوهم إنه شغال).

### 7. `api.js`: دوال بتنادي مسارات غير موجودة
- `createShipment()` بتنادي `/shipping/create/:id` — **ما في هيك مسار** في `server.js`. حُذفت.
- `calculateShipping(address, items)` بتبعت بيانات غلط؛ الباك إند ينتظر `shipping_method_id`. تم التصحيح.
- `getDashboardStats()` كانت تنادي مسار مكرر؛ صارت تنادي `/admin/stats`.
- إعادة التوجيه عند انتهاء التوكن كانت لـ `/admin/login` (مسار غير موجود) → صارت `/login`.

### 8. `index.html` بالإنجليزي والموقع عربي
`lang="en"` بدون `dir="rtl"`، وأيقونة `/vite.svg` غير موجودة (404 بكل زيارة).
تم التصحيح + إضافة `public/favicon.svg` ووصف SEO.

### 9. `@import` بعد `@tailwind` في `index.css`
مؤكد وصحيح — تم نقله للسطر الأول.

---

## 🔒 تحسينات الأمان في `backend/server.js`

| التعديل | السبب |
|---|---|
| Rate limiting على `/api/admin/login` (10 محاولات / 15 دقيقة) | منع تجربة كلمات المرور بلا حدود. مبني داخلياً بدون مكتبات خارجية حتى ما يزيد مخاطر النشر. |
| Rate limiting على `/api/contact` و `/api/bookings` (20/ساعة) | منع سبام النماذج العامة. |
| حذف `details: error.message` من كل الردود | كان يكشف أسماء الأعمدة ورسائل Postgres لأي زائر. صار يتسجّل في الـ logs فقط. |
| رؤوس أمان (`X-Frame-Options`, `nosniff`, `Referrer-Policy`) | حماية أساسية بدون مكتبات. |
| `trust proxy` | ضروري على Render حتى يشتغل تحديد المحاولات حسب IP الحقيقي. |
| CORS بدالة | كان يرفض كل شي لو `FRONTEND_URL` مش مضبوط، وكان يرفض كمان الطلبات بدون Origin (الـ webhooks والـ health checks). |
| حد حجم الطلب `1mb` | منع إغراق السيرفر بأجسام طلبات ضخمة. |
| تحقق من أن `:id` رقم صحيح | `/api/products/abc` كان يعطي 500 بدل 400. |
| `first_name` / `last_name` بقيمة افتراضية | العمودين `NOT NULL`؛ طلب أو حجز بدون اسم عائلة كان يفشل بالكامل. |

---

## ⚡ تحسينات الأداء

- **Code splitting**: كل الصفحات (بما فيها لوحة التحكم) صارت `React.lazy()` — الزائر العادي
  ما عاد يحمّل كود لوحة التحكم. الملف الرئيسي كان 549kB.
- **`manualChunks`** في `vite.config.js`: React و framer-motion و lucide بملفات منفصلة
  → المتصفح بيخزنها مؤقتاً ولا يعيد تحميلها مع كل نشر.
- **Cache headers** لملفات `/assets/*` في `vercel.json`.
- **فهارس إضافية** في `schema.sql` (`order_items.order_id`, `orders.created_at`, `contact_messages.is_read`).
- `npx update-browserslist-db@latest` — شغّلها مرة وحدة محلياً وارفع التغيير.

---

## ✅ تم: الصور صارت على Supabase Storage بدل قرص Render

كانت `multer` تحفظ الصور بـ `backend/uploads/`، وقرص Render **بينمسح مع كل إعادة نشر**.
هذا صار منفّذ فعلياً: `multer.memoryStorage` بدل `diskStorage`، والـ buffer بينرفع
عبر `@supabase/supabase-js` لـ bucket عام (`SUPABASE_STORAGE_BUCKET`)، والرابط الكامل
هو يلي بينخزن بـ `products.images` / `blog_posts.image_url` — دالة `mediaUrl()`
بالفرونت أصلاً كانت متجهزة لهيك روابط كاملة بدون أي تعديل إضافي.

لازم تنشئ الـ bucket من لوحة Supabase → Storage → New bucket (Public) قبل أول رفع.

---

## ملفات اتحذفت / انضافت

**انحذف:**
- `supabase_tables.sql` — سكيما قديمة **غير متوافقة إطلاقاً** مع `server.js`
  (تستخدم `UUID` و `title_ar` بدل `SERIAL` و `name_ar`، وما فيها جدول `admins`).
  هي السبب الجذري لمشكلة تسجيل الدخول.
- `dr.sara2.lnk` — اختصار Windows ما إله مكان في مستودع.
- `backend/package-lock.json` — أعِد توليده بـ `npm install` بعد تغيير الاعتماديات.

**انضاف:**
- `.gitignore` (ما كان موجود أصلاً — كنت معرّض ترفع `.env` على GitHub)
- `.env.example`, `backend/.env.example`
- `functions/api/[[path]].js`, `public/_redirects`, `public/_headers` (Cloudflare Pages)
- `src/lib/apiClient.js`, `public/favicon.svg`
- `database/RESET.sql`, `backend/scripts/hash-password.js`

---

## 🔑 آخر شي — دوّر كل المفاتيح

إذا `JWT_SECRET` أو `DATABASE_URL` أو مفاتيح Moyasar انكتبوا بأي محادثة أو انرفعوا
على GitHub ولو مرة، اعتبرهم مكشوفين وغيّرهم كلهم من لوحات Supabase و Moyasar و Render.
تغيير `JWT_SECRET` بيسجّل خروج كل الجلسات الحالية — وهذا المطلوب.
