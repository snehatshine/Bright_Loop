import { useAuth } from '../auth';

// Placeholder home. Each role sees a different menu; the real pages get added here later.
const menus = {
  admin: ['Products', 'Plans', 'Taxes', 'Discounts', 'Subscriptions', 'Invoices', 'Payments', 'Staff', 'Reports'],
  staff: ['Subscriptions', 'Invoices', 'Payments', 'Customers'],
  customer: ['My subscriptions', 'My invoices'],
};

export default function Home() {
  const { user, logout } = useAuth();
  return (
    <div className="home">
      <header>
        <strong>Brightloop</strong>
        <span>{user.name} ({user.role})</span>
        <button className="ghost" onClick={logout}>Log out</button>
      </header>
      <nav aria-label="Main">
        {menus[user.role].map(m => <a key={m} href="#top">{m}</a>)}
      </nav>
      <section>
        <h1>Welcome, {user.name}</h1>
        <p>You are signed in as <b>{user.role}</b>. Screens for the menu items above will be added here.</p>
      </section>
    </div>
  );
}
