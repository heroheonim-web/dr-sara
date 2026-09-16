// functions/api/[[path]].js
// ------------------------------------------------------------------
// Cloudflare Pages Function — بديل الـ rewrite يلي كان بـ vercel.json.
// كل طلب لـ /api/* من الموقع بينمرَّر هون وبيتحوّل (proxy) للباك إند
// على Render، لأن ملف _redirects بـ Cloudflare Pages ما بيقدر يعمل
// proxy لدومين خارجي (يدعم بس روابط نسبية على نفس الموقع).
//
// اضبط متغير البيئة BACKEND_URL من لوحة Cloudflare Pages:
// Settings → Environment variables → BACKEND_URL = https://your-backend.onrender.com
// (بدون /api بالآخر)
// ------------------------------------------------------------------

export async function onRequest(context) {
  const { request, env, params } = context;

  const backendBase = (env.BACKEND_URL || '').replace(/\/+$/, '');
  if (!backendBase) {
    return new Response(
      JSON.stringify({ error: 'BACKEND_URL غير مضبوط في إعدادات Cloudflare Pages' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const incoming = new URL(request.url);
  const pathParts = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  const targetUrl = `${backendBase}/api/${pathParts}${incoming.search}`;

  // انسخ الهيدرز الأصلية (Authorization, Content-Type...) بدون هيدرز Cloudflare/host الخاصة
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete('host');
  forwardHeaders.delete('cf-connecting-ip');
  forwardHeaders.delete('cf-ray');
  forwardHeaders.delete('cf-visitor');

  const hasBody = !['GET', 'HEAD'].includes(request.method);

  const backendResponse = await fetch(targetUrl, {
    method: request.method,
    headers: forwardHeaders,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(backendResponse.headers);
  return new Response(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: responseHeaders,
  });
}
