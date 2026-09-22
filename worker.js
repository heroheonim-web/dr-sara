// worker.js
// ------------------------------------------------------------------
// نقطة دخول الـ Worker: أي طلب لـ /api/* بينمرّر (proxy) للباك إند
// على Render، وأي طلب تاني بيتقدّم من الملفات الستاتيك (dist) عبر
// binding اسمه ASSETS (مضبوط بملف wrangler.jsonc).
//
// اضبط متغير البيئة BACKEND_URL من لوحة Cloudflare:
// Worker → Settings → Variables and Secrets → BACKEND_URL = https://dr-sara.onrender.com
// (بدون /api بالآخر)
// ------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const backendBase = (env.BACKEND_URL || '').replace(/\/+$/, '');
      if (!backendBase) {
        return new Response(
          JSON.stringify({ error: 'BACKEND_URL غير مضبوط في إعدادات Cloudflare' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const targetUrl = `${backendBase}${url.pathname}${url.search}`;

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

    // أي طلب مش /api/* بيتقدّم من الملفات الستاتيك (dist)
    return env.ASSETS.fetch(request);
  },
};
