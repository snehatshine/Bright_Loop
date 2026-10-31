import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin';
  const isCustomer = user?.role === 'customer';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <svg className="sidebar-logo" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" className="loop-track" />
            <path d="M 50 10 A 40 40 0 0 1 90 50" className="loop-arc" />
            <circle cx="90" cy="50" r="6" className="loop-dot" />
          </svg>
          <Link to="/" className="sidebar-brand">Brightloop</Link>
        </div>

        <nav className="sidebar-nav" aria-label="Main Navigation">
          {isCustomer ? (
            <>
              <div className="sidebar-section-title">Customer Portal</div>
              <NavLink to="/customer/home" className={({ isActive }) => isActive ? 'active' : ''}>
                🏠 Home
              </NavLink>
              <NavLink to="/customer/subscriptions" className={({ isActive }) => isActive ? 'active' : ''}>
                🔄 My Subscriptions
              </NavLink>
              <NavLink to="/customer/invoices" className={({ isActive }) => isActive ? 'active' : ''}>
                📄 My Invoices
              </NavLink>
            </>
          ) : (
            <>
              <div className="sidebar-section-title">Overview</div>
              <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                📊 Dashboard
              </NavLink>

              <div className="sidebar-section-title">Billing & Operations</div>
              <NavLink to="/subscriptions" className={({ isActive }) => isActive ? 'active' : ''}>
                🔄 Subscriptions
              </NavLink>
              <NavLink to="/invoices" className={({ isActive }) => isActive ? 'active' : ''}>
                📄 Invoices
              </NavLink>
              <NavLink to="/payments" className={({ isActive }) => isActive ? 'active' : ''}>
                💳 Payments
              </NavLink>
              <NavLink to="/customers" className={({ isActive }) => isActive ? 'active' : ''}>
                👥 Customers
              </NavLink>

              <div className="sidebar-section-title">Catalog & Rules</div>
              <NavLink to="/products" className={({ isActive }) => isActive ? 'active' : ''}>
                📦 Products
              </NavLink>
              <NavLink to="/plans" className={({ isActive }) => isActive ? 'active' : ''}>
                📅 Plans
              </NavLink>
              <NavLink to="/taxes" className={({ isActive }) => isActive ? 'active' : ''}>
                🏷️ Taxes
              </NavLink>
              <NavLink to="/discounts" className={({ isActive }) => isActive ? 'active' : ''}>
                🎟️ Discounts
              </NavLink>
              <NavLink to="/templates" className={({ isActive }) => isActive ? 'active' : ''}>
                📋 Templates
              </NavLink>

              {isAdmin && (
                <>
                  <div className="sidebar-section-title">Administration</div>
                  <NavLink to="/staff" className={({ isActive }) => isActive ? 'active' : ''}>
                    🛡️ Staff
                  </NavLink>
                </>
              )}
            </>
          )}
        </nav>
      </aside>

      <div className="main-content">
        <header className="top-header">
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
            Brightloop Subscription Management
          </div>
          <div className="top-header-user">
            <span className="user-badge">
              <span>{user?.name}</span>
              <span className="user-role-pill">{user?.role}</span>
            </span>
            <button type="button" className="ghost sm" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        <main className="content-body">
          {children}
        </main>
      </div>
    </div>
  );
}
