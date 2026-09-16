import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { Toaster } from '@/components/ui/toaster';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ProtectedRoute from '@/components/ProtectedRoute';

// صفحات عامة خفيفة تُحمّل مباشرة
import HomePage from '@/pages/HomePage';
import NotFoundPage from '@/pages/NotFoundPage';

// ---- Code splitting: كل صفحة بملف منفصل يتحمّل عند الحاجة فقط ----
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const ServicesPage = lazy(() => import('@/pages/ServicesPage'));
const CertificationsPage = lazy(() => import('@/pages/CertificationsPage'));
const MediaPage = lazy(() => import('@/pages/MediaPage'));
const CoursesPage = lazy(() => import('@/pages/CoursesPage'));
const ProductsPage = lazy(() => import('@/pages/ProductsPage'));
const BookingPage = lazy(() => import('@/pages/BookingPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const BlogPage = lazy(() => import('@/pages/BlogPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const CartPage = lazy(() => import('@/pages/CartPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const TestimonialsPage = lazy(() => import('@/pages/TestimonialsPage'));
const CheckoutPage = lazy(() => import('@/pages/checkout/CheckoutPage'));
const OrderSuccessPage = lazy(() => import('@/pages/checkout/OrderSuccessPage'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));

const PageLoader = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

function App() {
  return (
    <Router>
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            <div className="flex flex-col min-h-screen font-sans">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Admin routes - no Header/Footer */}
                  <Route
                    path="/admin/*"
                    element={
                      <ProtectedRoute adminOnly>
                        <AdminLayout />
                      </ProtectedRoute>
                    }
                  />
                  {/* Public routes - with Header/Footer */}
                  <Route path="*" element={
                    <>
                      <Header />
                      <main className="flex-1">
                        <Suspense fallback={<PageLoader />}>
                          <Routes>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/about" element={<AboutPage />} />
                            <Route path="/services" element={<ServicesPage />} />
                            <Route path="/certifications" element={<CertificationsPage />} />
                            <Route path="/media" element={<MediaPage />} />
                            <Route path="/courses" element={<CoursesPage />} />
                            <Route path="/products" element={<ProductsPage />} />
                            <Route path="/booking" element={<BookingPage />} />
                            <Route path="/blog" element={<BlogPage />} />
                            <Route path="/contact" element={<ContactPage />} />
                            <Route path="/testimonials" element={<TestimonialsPage />} />
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/signup" element={<SignupPage />} />
                            <Route path="/cart" element={<CartPage />} />
                            <Route path="/checkout" element={<CheckoutPage />} />
                            <Route path="/order-success" element={<OrderSuccessPage />} />
                            <Route
                              path="/dashboard"
                              element={
                                <ProtectedRoute>
                                  <DashboardPage />
                                </ProtectedRoute>
                              }
                            />
                            <Route path="*" element={<NotFoundPage />} />
                          </Routes>
                        </Suspense>
                      </main>
                      <Footer />
                    </>
                  } />
                </Routes>
              </Suspense>
              <Toaster />
            </div>
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </Router>
  );
}

export default App;
