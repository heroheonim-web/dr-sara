import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCart } from '@/contexts/CartContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { API_BASE, mediaUrl, PLACEHOLDER_IMG, safeJson } from '@/lib/apiClient';

// ======= Moyasar Payment Widget =======
const MoyasarForm = ({ amount, orderId, onSuccess, onFail }) => {
  const PUBLISHABLE_KEY = import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY;

  useEffect(() => {
    // تحميل Moyasar Script
    const script = document.createElement('script');
    script.src = 'https://cdn.moyasar.com/mpf/1.13.0/moyasar.js';
    script.onload = () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.moyasar.com/mpf/1.13.0/moyasar.css';
      document.head.appendChild(link);

      // تهيئة Moyasar
      window.Moyasar.init({
        element: '.moyasar-form',
        amount: Math.round(amount * 100),
        currency: 'SAR',
        description: `طلب د. سارة - #${orderId}`,
        publishable_api_key: PUBLISHABLE_KEY,
        callback_url: `${window.location.origin}/order-success?order_id=${orderId}`,
        methods: ['creditcard', 'applepay', 'stcpay'],
        apple_pay: {
          country: 'SA',
          label: 'د. سارة',
          validate_merchant_url: `${API_BASE}/payments/apple-pay/validate`,
        },
        on_completed: (payment) => {
          if (payment.status === 'paid') {
            onSuccess(payment);
          } else {
            onFail(payment);
          }
        },
        on_failed: (error) => {
          onFail(error);
        },
      });
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, [amount, orderId]);

  return (
    <div className="moyasar-form mt-6">
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37]"></div>
        <span className="mr-3 text-gray-600">جاري تحميل نموذج الدفع...</span>
      </div>
    </div>
  );
};

// ======= الصفحة الرئيسية =======
const CheckoutPage = () => {
  const navigate = useNavigate();
  const { items, getTotal, clearCart } = useCart();
  const { language } = useLanguage();

  const [step, setStep] = useState(1); // 1=معلومات, 2=شحن, 3=دفع
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [shippingMethods, setShippingMethods] = useState([]);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [shippingCost, setShippingCost] = useState(0);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postal_code: '',
    shipping_method_id: '',
  });

  const API_URL = API_BASE;

  // إعادة التوجيه إذا السلة فارغة
  useEffect(() => {
    if (items.length === 0) navigate('/products');
  }, [items]);

  // جلب طرق الشحن
  useEffect(() => {
    fetch(`${API_URL}/shipping/methods`)
      .then(r => safeJson(r))
      .then(data => {
        setShippingMethods(data);
        if (data.length > 0) {
          setFormData(prev => ({ ...prev, shipping_method_id: data[0].id }));
          setShippingCost(parseFloat(data[0].price) || 0);
        }
      })
      .catch(console.error);
  }, []);

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (name === 'shipping_method_id') {
      const method = shippingMethods.find(m => m.id === parseInt(value));
      setShippingCost(parseFloat(method?.price) || 0);
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError('');
    try {
      const res = await fetch(`${API_URL}/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, amount: getTotal() })
      });
      const data = await safeJson(res);
      if (data.discount) {
        setCouponDiscount(data.discount);
      } else {
        setCouponError('كوبون غير صالح أو منتهي الصلاحية');
      }
    } catch {
      setCouponError('تعذر التحقق من الكوبون');
    }
  };

  const subtotal = getTotal();
  const tax = (subtotal - couponDiscount) * 0.15;
  const total = subtotal + shippingCost - couponDiscount + tax;

  const handleCreateOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            first_name: formData.first_name,
            last_name: formData.last_name,
            email: formData.email,
            phone: formData.phone,
          },
          items: items.map(item => ({
            product_id: item.id,
            quantity: item.quantity,
          })),
          shipping: {
            method_id: formData.shipping_method_id,
            address: {
              street: formData.address,
              city: formData.city,
              postal_code: formData.postal_code,
              country: 'SA',
            }
          },
          payment_method: 'online',
          coupon_code: couponCode || undefined,
        })
      });
      const data = await safeJson(res);
      if (data.order_id) {
        setOrderId(data.order_id);
        setStep(3);
      } else {
        alert(data.error || 'فشل إنشاء الطلب');
      }
    } catch (err) {
      alert('خطأ في الاتصال بالسيرفر');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = (payment) => {
    clearCart();
    navigate(`/order-success?order_id=${orderId}&payment_id=${payment.id}`);
  };

  const handlePaymentFail = () => {
    alert('فشل الدفع. يرجى المحاولة مرة أخرى.');
    setStep(2);
  };

  const inputClass = "w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent bg-white transition-all text-right";
  const labelClass = "block text-sm font-semibold text-gray-700 mb-2 text-right";

  return (
    <div className="min-h-screen bg-[#FFF8F0] py-12" dir="rtl">
      <div className="container mx-auto px-4 max-w-6xl">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            إتمام الطلب
          </h1>
          {/* Steps Indicator */}
          <div className="flex items-center justify-center mt-6 gap-4">
            {['معلوماتك', 'الشحن', 'الدفع'].map((label, i) => (
              <React.Fragment key={i}>
                <div className={`flex items-center gap-2 ${step > i + 1 ? 'text-green-600' : step === i + 1 ? 'text-[#D4AF37]' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${step > i + 1 ? 'bg-green-600 border-green-600 text-white' : step === i + 1 ? 'bg-[#D4AF37] border-[#D4AF37] text-white' : 'border-gray-300'}`}>
                    {step > i + 1 ? '✓' : i + 1}
                  </div>
                  <span className="font-semibold text-sm hidden sm:block">{label}</span>
                </div>
                {i < 2 && <div className={`flex-1 max-w-16 h-0.5 ${step > i + 1 ? 'bg-green-600' : 'bg-gray-200'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Form */}
          <div className="lg:col-span-2">

            {/* Step 1: Personal Info */}
            {step === 1 && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-2xl shadow-lg p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">المعلومات الشخصية</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>الاسم الأول *</label>
                    <input type="text" name="first_name" value={formData.first_name} onChange={handleInput} className={inputClass} placeholder="سارة" required />
                  </div>
                  <div>
                    <label className={labelClass}>اسم العائلة *</label>
                    <input type="text" name="last_name" value={formData.last_name} onChange={handleInput} className={inputClass} placeholder="العمري" required />
                  </div>
                  <div>
                    <label className={labelClass}>البريد الإلكتروني *</label>
                    <input type="email" name="email" value={formData.email} onChange={handleInput} className={inputClass} placeholder="example@email.com" required />
                  </div>
                  <div>
                    <label className={labelClass}>رقم الجوال *</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleInput} className={inputClass} placeholder="05xxxxxxxx" required />
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!formData.first_name || !formData.email || !formData.phone) {
                      alert('يرجى تعبئة جميع الحقول المطلوبة');
                      return;
                    }
                    setStep(2);
                  }}
                  className="mt-6 w-full bg-[#D4AF37] text-white py-4 rounded-xl font-bold hover:bg-[#B8941F] transition-all"
                >
                  التالي: اختيار الشحن →
                </button>
              </motion.div>
            )}

            {/* Step 2: Shipping */}
            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-2xl shadow-lg p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">عنوان الشحن</h2>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className={labelClass}>العنوان *</label>
                    <input type="text" name="address" value={formData.address} onChange={handleInput} className={inputClass} placeholder="الشارع، رقم المبنى، الحي" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>المدينة *</label>
                      <input type="text" name="city" value={formData.city} onChange={handleInput} className={inputClass} placeholder="الرياض" />
                    </div>
                    <div>
                      <label className={labelClass}>الرمز البريدي</label>
                      <input type="text" name="postal_code" value={formData.postal_code} onChange={handleInput} className={inputClass} placeholder="12345" />
                    </div>
                  </div>
                </div>

                {/* طرق الشحن */}
                <h3 className="text-lg font-bold text-gray-900 mb-4">طريقة الشحن</h3>
                <div className="space-y-3 mb-6">
                  {shippingMethods.length > 0 ? shippingMethods.map((method) => (
                    <label key={method.id}
                      className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.shipping_method_id == method.id ? 'border-[#D4AF37] bg-[#FFF8F0]' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="flex items-center gap-3">
                        <input type="radio" name="shipping_method_id" value={method.id}
                          checked={formData.shipping_method_id == method.id}
                          onChange={handleInput} className="text-[#D4AF37]" />
                        <div>
                          <p className="font-bold text-gray-900">{method.name_ar}</p>
                          <p className="text-sm text-gray-500">
                            {method.estimated_days_min === 0 ? 'استلام فوري' : `${method.estimated_days_min}-${method.estimated_days_max} أيام عمل`}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold text-[#D4AF37]">
                        {parseFloat(method.price) === 0 ? 'مجاني' : `${method.price} ر.س`}
                      </span>
                    </label>
                  )) : (
                    /* Default shipping methods if DB empty */
                    [
                      { id: 'smsa', name: 'شحن سمسا', days: '2-4', price: '25', logo: '📦' },
                      { id: 'aramex', name: 'شحن أرامكس', days: '2-5', price: '30', logo: '✈️' },
                      { id: 'pickup', name: 'استلام من الفرع', days: 'فوري', price: '0', logo: '🏪' },
                      { id: 'redbox', name: 'ريد بوكس', days: '1-3', price: '20', logo: '📫' },
                      { id: 'anymca', name: 'أي مكان', days: '2-3', price: '22', logo: '🚚' },
                    ].map(m => (
                      <label key={m.id}
                        className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.shipping_method_id === m.id ? 'border-[#D4AF37] bg-[#FFF8F0]' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <div className="flex items-center gap-3">
                          <input type="radio" name="shipping_method_id" value={m.id}
                            checked={formData.shipping_method_id === m.id}
                            onChange={handleInput} />
                          <div>
                            <p className="font-bold text-gray-900">{m.logo} {m.name}</p>
                            <p className="text-sm text-gray-500">{m.days === 'فوري' ? 'استلام فوري' : `${m.days} أيام عمل`}</p>
                          </div>
                        </div>
                        <span className="font-bold text-[#D4AF37]">
                          {m.price === '0' ? 'مجاني' : `${m.price} ر.س`}
                        </span>
                      </label>
                    ))
                  )}
                </div>

                {/* كوبون الخصم */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-3">كوبون الخصم (اختياري)</h3>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={e => { setCouponCode(e.target.value); setCouponError(''); }}
                      className={inputClass}
                      placeholder="أدخل كود الخصم"
                    />
                    <button onClick={applyCoupon}
                      className="px-6 py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-900 transition-all whitespace-nowrap">
                      تطبيق
                    </button>
                  </div>
                  {couponDiscount > 0 && (
                    <p className="text-green-600 font-semibold mt-2">✓ تم تطبيق الخصم: -{couponDiscount.toFixed(2)} ر.س</p>
                  )}
                  {couponError && <p className="text-red-500 mt-2">{couponError}</p>}
                </div>

                <div className="flex gap-4 mt-6">
                  <button onClick={() => setStep(1)}
                    className="flex-1 py-4 rounded-xl font-bold border-2 border-gray-200 text-gray-700 hover:border-gray-300 transition-all">
                    ← السابق
                  </button>
                  <button
                    onClick={() => {
                      if (!formData.address || !formData.city) {
                        alert('يرجى إدخال العنوان والمدينة');
                        return;
                      }
                      handleCreateOrder();
                    }}
                    disabled={loading}
                    className="flex-1 bg-[#D4AF37] text-white py-4 rounded-xl font-bold hover:bg-[#B8941F] transition-all disabled:opacity-60"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        جاري المعالجة...
                      </span>
                    ) : 'التالي: الدفع →'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Payment */}
            {step === 3 && orderId && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-2xl shadow-lg p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">الدفع الآمن</h2>
                <p className="text-gray-500 mb-6">يمكنك الدفع بـ مدى، فيزا، ماستركارد، Apple Pay، أو STC Pay</p>

                {/* Payment Method Logos */}
                <div className="flex gap-3 flex-wrap mb-6 p-4 bg-gray-50 rounded-xl">
                  {[
                    { name: 'مدى', color: 'bg-green-600', text: 'مدى' },
                    { name: 'Visa', color: 'bg-blue-700', text: 'VISA' },
                    { name: 'MasterCard', color: 'bg-red-600', text: 'MC' },
                    { name: 'Apple Pay', color: 'bg-black', text: '🍎' },
                    { name: 'STC Pay', color: 'bg-purple-600', text: 'STC' },
                  ].map(m => (
                    <div key={m.name} className={`${m.color} text-white px-4 py-2 rounded-lg text-sm font-bold`}>
                      {m.text}
                    </div>
                  ))}
                </div>

                {/* Moyasar Form */}
                <MoyasarForm
                  amount={total}
                  orderId={orderId}
                  onSuccess={handlePaymentSuccess}
                  onFail={handlePaymentFail}
                />
              </motion.div>
            )}
          </div>

          {/* Order Summary - Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">ملخص الطلب</h2>

              {/* Items */}
              <div className="space-y-4 mb-6 max-h-60 overflow-y-auto">
                {items.map(item => (
                  <div key={item.id} className="flex gap-3">
                    <div className="relative flex-shrink-0">
                      <img src={mediaUrl(item.image, PLACEHOLDER_IMG)} alt={item.title}
                        className="w-14 h-14 object-cover rounded-lg" />
                      <span className="absolute -top-2 -left-2 bg-[#D4AF37] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{item.title}</p>
                      <p className="text-[#D4AF37] font-bold text-sm">
                        {((Number(item.sale_price ?? item.discount_price ?? item.price) || 0) * item.quantity).toFixed(2)} ر.س
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pricing Breakdown */}
              <div className="space-y-3 pt-4 border-t text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>المجموع الفرعي</span>
                  <span>{subtotal.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>الشحن</span>
                  <span>{shippingCost === 0 ? <span className="text-green-600">مجاني</span> : `${shippingCost.toFixed(2)} ر.س`}</span>
                </div>
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>خصم الكوبون</span>
                    <span>- {couponDiscount.toFixed(2)} ر.س</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>ضريبة القيمة المضافة (15%)</span>
                  <span>{tax.toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between text-xl font-bold text-gray-900 pt-3 border-t">
                  <span>الإجمالي</span>
                  <span className="text-[#D4AF37]">{total.toFixed(2)} ر.س</span>
                </div>
              </div>

              {/* Security Badge */}
              <div className="mt-6 flex items-center gap-2 text-gray-500 text-xs bg-gray-50 p-3 rounded-xl">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>جميع المعاملات مشفرة وآمنة بـ SSL 256-bit</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
