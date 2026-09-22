import React, { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { API_BASE, safeJson } from '@/lib/apiClient';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const AuthContext = createContext();
const API = API_BASE;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    const stored = localStorage.getItem('admin_user');
    if (token && stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (email, password, _attempt = 1) => {
    let res;
    try {
      res = await fetch(`${API}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error('تعذّر الوصول للسيرفر — تحقق من اتصالك بالإنترنت وحاول مرة أخرى');
    }

    let data;
    try {
      data = await safeJson(res);
    } catch (err) {
      // السيرفر (Render) قد يكون بدأ التشغيل للتو بعد فترة خمول ("cold start")
      // فيرجع رد فاضٍ لأول محاولة — نعيد المحاولة تلقائياً مرة واحدة بعد مهلة قصيرة.
      if (_attempt === 1) {
        toast({ title: 'السيرفر يبدأ التشغيل...', description: 'يرجى الانتظار لحظات' });
        await sleep(4000);
        return login(email, password, 2);
      }
      throw err;
    }

    if (!res.ok) throw new Error(data?.error || 'فشل تسجيل الدخول');
    localStorage.setItem('admin_token', data.token);
    localStorage.setItem('admin_user', JSON.stringify(data.admin));
    setUser(data.admin);
    toast({ title: 'تم تسجيل الدخول', description: `مرحباً ${data.admin.full_name}` });
    return data.admin;
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setUser(null);
    toast({ title: 'تم تسجيل الخروج' });
  };

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin' || user?.role === 'super_admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
