import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';

// Auth Pages
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// Admin & Staff Pages
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Plans from './pages/Plans';
import Taxes from './pages/Taxes';
import Discounts from './pages/Discounts';
import Templates from './pages/Templates';
import Subscriptions from './pages/Subscriptions';
import SubscriptionDetail from './pages/SubscriptionDetail';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Payments from './pages/Payments';
import Customers from './pages/Customers';
import Staff from './pages/Staff';

// Customer Portal Pages
import CustomerHome from './pages/CustomerHome';
import CustomerSubscriptions from './pages/CustomerSubscriptions';
import CustomerInvoices from './pages/CustomerInvoices';

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Route guard for Admin / Staff: customers typing admin routes get redirected to customer portal
function RequireStaffOrAdmin({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'customer') {
    return <Navigate to="/customer/home" replace />;
  }
  return children;
}

// Route guard strictly for Admin (e.g. /staff)
function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'customer') return <Navigate to="/customer/home" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

// Route guard for customer portal
function RequireCustomer({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'customer') {
    return <Navigate to="/customer/home" replace />;
  }
  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Authenticated Application */}
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Layout>
                    <RoleRootRedirect />
                  </Layout>
                </RequireAuth>
              }
            />

            {/* Admin & Staff Routes */}
            <Route
              path="/products"
              element={
                <RequireStaffOrAdmin>
                  <Layout><Products /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/plans"
              element={
                <RequireStaffOrAdmin>
                  <Layout><Plans /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/taxes"
              element={
                <RequireStaffOrAdmin>
                  <Layout><Taxes /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/discounts"
              element={
                <RequireStaffOrAdmin>
                  <Layout><Discounts /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/templates"
              element={
                <RequireStaffOrAdmin>
                  <Layout><Templates /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/subscriptions"
              element={
                <RequireStaffOrAdmin>
                  <Layout><Subscriptions /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/subscriptions/:id"
              element={
                <RequireStaffOrAdmin>
                  <Layout><SubscriptionDetail /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/invoices"
              element={
                <RequireStaffOrAdmin>
                  <Layout><Invoices /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/invoices/:id"
              element={
                <RequireStaffOrAdmin>
                  <Layout><InvoiceDetail /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/payments"
              element={
                <RequireStaffOrAdmin>
                  <Layout><Payments /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/customers"
              element={
                <RequireStaffOrAdmin>
                  <Layout><Customers /></Layout>
                </RequireStaffOrAdmin>
              }
            />
            <Route
              path="/staff"
              element={
                <RequireAdmin>
                  <Layout><Staff /></Layout>
                </RequireAdmin>
              }
            />

            {/* Customer Portal Routes */}
            <Route
              path="/customer/home"
              element={
                <RequireCustomer>
                  <Layout><CustomerHome /></Layout>
                </RequireCustomer>
              }
            />
            <Route
              path="/customer/subscriptions"
              element={
                <RequireCustomer>
                  <Layout><CustomerSubscriptions /></Layout>
                </RequireCustomer>
              }
            />
            <Route
              path="/customer/subscriptions/:id"
              element={
                <RequireCustomer>
                  <Layout><CustomerSubscriptions /></Layout>
                </RequireCustomer>
              }
            />
            <Route
              path="/customer/invoices"
              element={
                <RequireCustomer>
                  <Layout><CustomerInvoices /></Layout>
                </RequireCustomer>
              }
            />
            <Route
              path="/customer/invoices/:id"
              element={
                <RequireCustomer>
                  <Layout><CustomerInvoices /></Layout>
                </RequireCustomer>
              }
            />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
