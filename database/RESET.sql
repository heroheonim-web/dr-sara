-- ============================================
-- ⚠️  تحذير: هذا الملف يحذف كل الجداول وكل البيانات.
-- استخدمه مرة واحدة فقط قبل تشغيل schema.sql من الصفر.
-- الخطوات في Supabase SQL Editor:
--   1) شغّل هذا الملف
--   2) بعدها الصق محتوى database/schema.sql وشغّله
-- ============================================

DROP TABLE IF EXISTS
    activity_logs,
    order_items,
    orders,
    bookings,
    contact_messages,
    blog_posts,
    coupons,
    shipping_methods,
    products,
    categories,
    customers,
    settings,
    admins
CASCADE;

-- جداول النسخة القديمة الخاطئة (supabase_tables.sql) — إن وجدت
DROP TABLE IF EXISTS users, courses, testimonials, media, certifications CASCADE;

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
