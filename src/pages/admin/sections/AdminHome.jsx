import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Calendar, Users, Package, Mail, TrendingUp, AlertTriangle } from 'lucide-react';
import { API_BASE } from '@/lib/apiClient';

const API = `${API_BASE}/admin`;
const token = () => localStorage.getItem('admin_token');

const StatCard = ({ icon: Icon, label, value, sub, color, link }) => (
  <Link to={link || '#'} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all block">
    <div className="flex items-start justify-between">
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
        <Icon size={22} className="text-white" />
      </div>
      {sub && <span className={`text-xs font-semibold px-2 py-1 rounded-full ${sub.startsWith('+') ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{sub}</span>}
    </div>
    <div className="mt-4">
      <p className="text-3xl font-bold text-gray-900">{value ?? '...'}</p>
      <p className="text-gray-500 text-sm mt-1">{label}</p>
    </div>
  </Link>
);

const AdminHome = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/stats`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-500"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="إجمالي الإيرادات" value={`${stats?.revenue?.toLocaleString()} ر.س`} color="bg-green-500" link="/admin/orders" />
        <StatCard icon={ShoppingCart} label="الطلبات" value={stats?.orders?.total} sub={stats?.orders?.pending > 0 ? `${stats.orders.pending} جديد` : undefined} color="bg-blue-500" link="/admin/orders" />
        <StatCard icon={Calendar} label="الحجوزات" value={stats?.bookings?.total} sub={stats?.bookings?.pending > 0 ? `${stats.bookings.pending} جديد` : undefined} color="bg-purple-500" link="/admin/bookings" />
        <StatCard icon={Users} label="العملاء" value={stats?.customers} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard icon={Package} label="المنتجات المنشورة" value={stats?.products} color="bg-indigo-500" link="/admin/products" />
        <StatCard icon={Mail} label="رسائل غير مقروءة" value={stats?.unread_messages} sub={stats?.unread_messages > 0 ? `جديد` : undefined} color="bg-pink-500" link="/admin/messages" />
        {stats?.low_stock > 0 && (
          <Link to="/admin/products" className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 flex items-center gap-4">
            <AlertTriangle className="text-red-500 flex-shrink-0" size={28} />
            <div>
              <p className="font-bold text-red-700">{stats.low_stock} منتج مخزونه منخفض</p>
              <p className="text-red-500 text-sm">اضغط لإدارة المنتجات</p>
            </div>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 text-lg">آخر الطلبات</h3>
            <Link to="/admin/orders" className="text-sm text-blue-600 hover:underline">عرض الكل</Link>
          </div>
          <div className="space-y-3">
            {stats?.recent_orders?.length > 0 ? stats.recent_orders.map(order => (
              <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-semibold text-sm text-gray-800">{order.customer_name}</p>
                  <p className="text-xs text-gray-400">{order.order_number}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm text-gray-900">{parseFloat(order.total).toFixed(0)} ر.س</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${order.status === 'delivered' ? 'bg-green-100 text-green-700' : order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                    {order.status === 'pending' ? 'جديد' : order.status === 'processing' ? 'قيد التجهيز' : order.status === 'shipped' ? 'مشحون' : order.status === 'delivered' ? 'تم التوصيل' : order.status}
                  </span>
                </div>
              </div>
            )) : <p className="text-gray-400 text-sm text-center py-4">لا توجد طلبات بعد</p>}
          </div>
        </div>

        {/* Recent Bookings */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 text-lg">آخر الحجوزات</h3>
            <Link to="/admin/bookings" className="text-sm text-blue-600 hover:underline">عرض الكل</Link>
          </div>
          <div className="space-y-3">
            {stats?.recent_bookings?.length > 0 ? stats.recent_bookings.map(b => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-semibold text-sm text-gray-800">{b.customer_name}</p>
                  <p className="text-xs text-gray-400">{b.booking_date} - {b.time_slot}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{b.session_type === 'online' ? '🖥 أونلاين' : '📍 حضوري'}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${b.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {b.status === 'pending' ? 'بانتظار التأكيد' : b.status === 'confirmed' ? 'مؤكد' : b.status}
                  </span>
                </div>
              </div>
            )) : <p className="text-gray-400 text-sm text-center py-4">لا توجد حجوزات بعد</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminHome;
