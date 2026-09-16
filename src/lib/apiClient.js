// src/lib/apiClient.js
// ------------------------------------------------------------------
// المصدر الوحيد لرابط الـ API في كل المشروع.
//
// - في التطوير المحلي: اتركه فاضي -> يستخدم /api ويمر عبر proxy في vite.config.js
// - في الإنتاج: إما تضبط VITE_API_URL=https://your-backend.onrender.com/api
//   أو تترك /api ويمرّر vercel.json الطلبات للباك إند (rewrite).
// ------------------------------------------------------------------

const RAW_API = (import.meta.env.VITE_API_URL || '/api').trim();

/** رابط الـ API بدون / في النهاية */
export const API_BASE = RAW_API.replace(/\/+$/, '');

/** رابط الملفات المرفوعة (صور المنتجات والمدونة) = رابط السيرفر بدون /api */
export const MEDIA_BASE = (
  import.meta.env.VITE_MEDIA_URL || API_BASE.replace(/\/api$/, '')
).replace(/\/+$/, '');

/**
 * يحوّل مسار صورة مخزّن في قاعدة البيانات (/uploads/xxx.jpg) لرابط كامل.
 * يدعم أيضاً الروابط الجاهزة (Supabase Storage / Cloudinary) كما هي.
 */
export const mediaUrl = (p, fallback = '') => {
  if (!p) return fallback;
  if (/^(https?:)?\/\//i.test(p) || p.startsWith('data:')) return p;
  return `${MEDIA_BASE}${p.startsWith('/') ? p : `/${p}`}`;
};

/** صورة بديلة محلية (بدل via.placeholder.com يلي ممكن يكون محجوب) */
export const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#efeaf7"/><text x="50%" y="50%" font-size="20" fill="#9b8bbd" text-anchor="middle" dominant-baseline="middle">لا توجد صورة</text></svg>`
  );

export const getToken = () => localStorage.getItem('admin_token');

export const authHeaders = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const clearSession = () => {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
};

/**
 * fetch موحّد: يضيف التوكن، يبني الرابط، ويرمي خطأ مفهوم عند الفشل.
 * @param {string} path مسار بعد /api مثل '/admin/products'
 */
export async function apiFetch(path, options = {}) {
  const { auth = true, headers = {}, body, ...rest } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const finalHeaders = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(auth ? authHeaders() : {}),
    ...headers,
  };

  const res = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    ...rest,
    headers: finalHeaders,
    body,
  });

  if (res.status === 401 || res.status === 403) {
    clearSession();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('انتهت الجلسة، يرجى تسجيل الدخول مجدداً');
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // السيرفر رجّع HTML (غالباً الرابط غلط أو الـ rewrite ناقص)
    throw new Error('استجابة غير متوقعة من السيرفر — تأكد من إعداد VITE_API_URL');
  }

  if (!res.ok) {
    throw new Error(data?.error || `خطأ ${res.status}`);
  }
  return data;
}

export default { API_BASE, MEDIA_BASE, mediaUrl, apiFetch, authHeaders, clearSession };
