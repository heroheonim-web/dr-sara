#!/usr/bin/env node
/**
 * توليد كلمة مرور أدمن مشفّرة (bcrypt) + جملة SQL جاهزة.
 *
 * الاستخدام من داخل مجلد backend:
 *   node scripts/hash-password.js "MyNewPassword123" dr.sara@example.com
 */
const bcrypt = require('bcryptjs');

const password = process.argv[2];
const email = process.argv[3] || 'dr.sara@example.com';

if (!password) {
    console.error('الاستخدام: node scripts/hash-password.js "كلمة-المرور" [البريد]');
    process.exit(1);
}
if (password.length < 8) {
    console.error('❌ كلمة المرور قصيرة — 8 أحرف على الأقل.');
    process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);

console.log('\nالهاش:\n' + hash + '\n');
console.log('SQL لإنشاء/تحديث الأدمن:\n');
console.log(`INSERT INTO admins (email, password_hash, full_name, role, is_active)
VALUES ('${email}', '${hash}', 'د. سارة', 'super_admin', true)
ON CONFLICT (email) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      is_active = true;\n`);
