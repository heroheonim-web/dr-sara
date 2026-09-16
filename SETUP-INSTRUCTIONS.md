# موقع د. سارة - دليل الإعداد الكامل

## 🎉 التحديثات الجديدة

تم تحديث المشروع ليصبح **مستقلاً بالكامل** مع:
- ✅ Backend مخصص (Node.js + Express)
- ✅ قاعدة بيانات PostgreSQL
- ✅ Admin Dashboard (قريباً)
- ✅ بوابة دفع مباشرة (Moyasar)
- ✅ API شحن مباشر (سمسا، أرامكس)

---

## 📋 المتطلبات

قبل البدء، تأكد من تثبيت:
- [Node.js](https://nodejs.org/) (v18 أو أحدث)
- [PostgreSQL](https://www.postgresql.org/) (v14 أو أحدث)
- [Git](https://git-scm.com/)

---

## 🚀 خطوات الإعداد

### 1. إعداد قاعدة البيانات

#### على Mac:
```bash
# تثبيت PostgreSQL
brew install postgresql@14
brew services start postgresql@14

# إنشاء قاعدة البيانات
createdb drsara_db

# استيراد Schema
psql -d drsara_db -f database/schema.sql
```

#### على Linux:
```bash
# تثبيت PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# إنشاء قاعدة البيانات
sudo -u postgres createdb drsara_db

# استيراد Schema
sudo -u postgres psql -d drsara_db -f database/schema.sql
```

#### على Windows:
1. حمل PostgreSQL من [الموقع الرسمي](https://www.postgresql.org/download/windows/)
2. ثبته واتبع التعليمات
3. افتح pgAdmin
4. أنشئ database اسمه `drsara_db`
5. افتح Query Tool وشغل محتوى `database/schema.sql`

### 2. إنشاء Admin User

```bash
# ادخل PostgreSQL
psql -d drsara_db
```

```sql
-- في PostgreSQL console:
INSERT INTO admins (email, password_hash, full_name, role) 
VALUES (
    'dr.sara@example.com',
    '$2b$10$NPJPKA16HjmuhWSanXyjZ.kpr4GYAYZ4HuOCfa6FnaGK2CxVJokfi',
    'د. سارة',
    'super_admin'
);

-- كلمة المرور المؤقتة: Admin@123
-- يرجى تغييرها بعد أول تسجيل دخول

\q
```

### 3. إعداد Backend

```bash
# الانتقال لمجلد Backend
cd backend

# تعديل ملف .env
# افتح backend/.env وعدل كلمة مرور PostgreSQL:
# DB_PASSWORD=كلمة_المرور_الخاصة_بك

# تثبيت Dependencies
npm install

# تشغيل Backend
npm run dev
```

✅ يجب أن ترى: `✅ Server running on port 5000`

### 4. إعداد Frontend

في terminal جديد:

```bash
# العودة للمجلد الرئيسي
cd ..

# تثبيت Dependencies
npm install

# تشغيل Frontend
npm run dev
```

✅ يجب أن ترى: `Local: http://localhost:3000/`

---

## 🧪 الاختبار

### 1. اختبار Backend
```bash
curl http://localhost:5000/api/products
```
يجب أن يرجع: `{"products":[],"total":0,"page":1,"totalPages":0}`

### 2. اختبار Frontend
افتح المتصفح: http://localhost:3000
اذهب للمتجر (Products)
يجب أن ترى: "لا توجد منتجات متاحة حالياً"

### 3. إضافة منتج تجريبي

```bash
psql -d drsara_db
```

```sql
INSERT INTO products (
    category_id, 
    name_ar, 
    name_en,
    slug, 
    price,
    sale_price,
    short_description, 
    description,
    stock_quantity, 
    status,
    images
) VALUES (
    1,
    'كتاب التربية الإيجابية',
    'Positive Parenting Book',
    'positive-parenting-book',
    99.00,
    79.00,
    'دليل شامل للتربية الإيجابية',
    'كتاب شامل يتناول أساليب التربية الإيجابية الحديثة مع أمثلة عملية ونصائح مجربة للآباء والأمهات',
    50,
    'published',
    '[]'::jsonb
);

\q
```

أعد تحميل صفحة المتجر - يجب أن ترى المنتج! 🎉

---

## 📁 هيكل المشروع

```
Dr.sara-s-Website/
├── backend/                # Backend API (Node.js + Express)
│   ├── server.js          # Main server file
│   ├── package.json       # Backend dependencies
│   ├── .env              # Backend configuration (DON'T COMMIT!)
│   └── uploads/          # Uploaded images
│
├── database/             # Database files
│   └── schema.sql        # Database schema
│
├── src/
│   ├── pages/
│   │   └── ProductsPage.jsx  # متجر المنتجات (محدث)
│   └── services/
│       └── api.js        # API Service (NEW)
│
├── .env                  # Frontend configuration
└── package.json          # Frontend dependencies
```

---

## 🐛 حل المشاكل

### Backend لا يعمل

```bash
# تأكد من PostgreSQL
# Mac:
brew services list | grep postgresql

# Linux:
sudo systemctl status postgresql

# اختبار الاتصال
psql -d drsara_db -c "SELECT 1"
```

### Frontend لا يتصل بـ Backend

```bash
# تأكد من Backend يعمل
curl http://localhost:5000/api/products

# تأكد من .env
cat .env
# يجب أن يحتوي على:
# VITE_API_URL=http://localhost:5000/api
```

### خطأ CORS

أضف في `backend/server.js` بعد `const app = express();`:
```javascript
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
```

### الصور لا تظهر

الصور بتترفع مباشرة لـ Supabase Storage (bucket عام). لإضافة صورة يدوياً للتجربة:
1. ارفع صورة من Supabase → Storage → bucket `uploads` (أو الاسم يلي بـ `SUPABASE_STORAGE_BUCKET`)
2. انسخ رابطها العام (Public URL)
3. حدث المنتج:
```sql
UPDATE products
SET images = '["https://xxxx.supabase.co/storage/v1/object/public/uploads/products/test.jpg"]'::jsonb
WHERE id = 1;
```

---

## 📝 ملاحظات مهمة

### معلومات الدخول الافتراضية

**Admin:**
- البريد: `dr.sara@example.com`
- كلمة المرور: `Admin@123`
- ⚠️ **يرجى تغيير كلمة المرور فوراً**

### الأمان

- ❌ لا ترفع ملف `.env` على Git
- ❌ لا تشارك معلومات قاعدة البيانات
- ✅ غير كلمات المرور الافتراضية
- ✅ غير `JWT_SECRET` في الإنتاج

---

## 🎯 الخطوات التالية

1. [ ] إضافة المنتجات الفعلية
2. [ ] إعداد بوابة الدفع (Moyasar)
3. [ ] إعداد الشحن (سمسا، أرامكس)
4. [ ] بناء Admin Dashboard
5. [ ] رفع على استضافة

---

## 📞 الدعم

إذا واجهت أي مشكلة:
1. راجع قسم "حل المشاكل" أعلاه
2. تأكد من تشغيل PostgreSQL و Backend
3. تحقق من ملفات `.env`
4. راجع console logs للأخطاء

---

## ✅ Checklist

- [ ] PostgreSQL مثبت ويعمل
- [ ] قاعدة البيانات `drsara_db` منشأة
- [ ] Schema مستورد
- [ ] Admin user منشأ
- [ ] `backend/.env` معبأ بالبيانات الصحيحة
- [ ] Backend dependencies مثبتة
- [ ] Backend يعمل على port 5000
- [ ] Frontend dependencies مثبتة
- [ ] Frontend يعمل على port 3000
- [ ] صفحة المتجر تفتح
- [ ] منتج تجريبي مضاف ويظهر

---

## 🎉 تم!

الآن المشروع جاهز ومستقل بالكامل!
