import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { API_BASE } from '@/lib/apiClient';

const OrderSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('order_id');
  const paymentId = searchParams.get('payment_id');
  const [order, setOrder] = useState(null);

  const API_URL = API_BASE;

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    const run = async () => {
      // 1) لو راجع من بوابة الدفع: تأكيد الدفع أولاً حتى تتحدث حالة الطلب
      //    (لا تعتمد على الـ webhook وحده)
      if (paymentId) {
        try {
          await fetch(`${API_URL}/payments/verify/${paymentId}`);
        } catch (e) {
          console.error('Payment verify failed:', e);
        }
      }
      // 2) ثم اجلب تفاصيل الطلب المحدثة
      try {
        const res = await fetch(`${API_URL}/orders/public/${orderId}`);
        const data = await res.json();
        if (!cancelled && res.ok) setOrder(data);
      } catch (e) {
        console.error(e);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [orderId, paymentId]);

  return (
    <div className="min-h-screen bg-[#FFF8F0] flex items-center justify-center py-16" dir="rtl">
      <div className="container mx-auto px-4 max-w-2xl">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="bg-white rounded-3xl shadow-2xl p-10 text-center"
        >
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <svg className="w-14 h-14 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>

          <h1 className="text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Playfair Display, serif' }}>
            تم استلام طلبك! 🎉
          </h1>
          <p className="text-gray-600 mb-8 text-lg leading-relaxed">
            شكراً لثقتك بد. سارة. سيتم معالجة طلبك وإرساله في أقرب وقت ممكن.
          </p>

          {/* Order Details */}
          {order && (
            <div className="bg-[#FFF8F0] rounded-2xl p-6 mb-8 text-right space-y-3">
              <div className="flex justify-between">
                <span className="font-bold text-gray-900">{order.order_number}</span>
                <span className="text-gray-600">رقم الطلب</span>
              </div>
              <div className="flex justify-between">
                <span className={`font-bold ${order.payment_status === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {order.payment_status === 'paid' ? 'مدفوع ✓' : 'قيد المعالجة'}
                </span>
                <span className="text-gray-600">حالة الدفع</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-[#D4AF37]">{parseFloat(order.total).toFixed(2)} ر.س</span>
                <span className="text-gray-600">المبلغ الإجمالي</span>
              </div>
            </div>
          )}

          {/* What's Next */}
          <div className="text-right mb-8 space-y-3">
            <h3 className="font-bold text-gray-900 text-lg">الخطوات التالية:</h3>
            {[
              'ستصلك رسالة تأكيد على بريدك الإلكتروني',
              'سنقوم بتحضير طلبك خلال 24-48 ساعة',
              'ستصلك رسالة برقم التتبع عند الشحن',
              'التوصيل خلال 2-5 أيام عمل حسب شركة الشحن',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 bg-[#D4AF37] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">{i + 1}</span>
                </div>
                <span className="text-gray-700">{step}</span>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-4 justify-center flex-wrap">
            <Link to="/products"
              className="px-8 py-3 bg-[#D4AF37] text-white rounded-xl font-bold hover:bg-[#B8941F] transition-all shadow-lg">
              تسوق المزيد
            </Link>
            <Link to="/"
              className="px-8 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all">
              الرئيسية
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default OrderSuccessPage;
