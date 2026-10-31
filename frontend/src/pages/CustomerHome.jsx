import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney, printInvoice } from '../api';
import { useAuth } from '../auth';
import Spinner from '../components/Spinner';
import StatusBadge from '../components/StatusBadge';

export default function CustomerHome() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState([]);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [subRes, invRes] = await Promise.all([
          api('/subscriptions?limit=5'),
          api('/invoices?limit=5')
        ]);
        setSubs(subRes.items || []);
        setInvoices(invRes.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) return <Spinner text="Loading your account summary..." />;

  const activeSubs = subs.filter(s => s.status === 'active' && !s.paused);
  const openInvoices = invoices.filter(i => i.status === 'confirmed' && Number(i.balance) > 0);
  const totalBalanceDue = openInvoices.reduce((sum, i) => sum + Number(i.balance || 0), 0);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1>Welcome, {user?.name}</h1>
        <p className="sub" style={{ margin: 0 }}>Review your active software subscriptions, pending billing invoices, and payment receipts.</p>
      </div>

      {/* Overview Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-title">Active Subscriptions</span>
          <span className="metric-value">{activeSubs.length}</span>
          <span className="metric-sub">{subs.length} total subscriptions</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Open Invoices</span>
          <span className="metric-value">{openInvoices.length}</span>
          <span className="metric-sub">Awaiting payment settlement</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Total Balance Due</span>
          <span className="metric-value" style={{ color: totalBalanceDue > 0 ? 'var(--alert)' : 'var(--loop)' }}>
            {fmtMoney(totalBalanceDue)}
          </span>
          <span className="metric-sub">{totalBalanceDue > 0 ? 'Payment required' : 'All accounts settled'}</span>
        </div>
      </div>

      {/* Active Subscriptions Preview */}
      <div className="card-box" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Your Subscriptions</h3>
          <Link to="/customer/subscriptions" className="small" style={{ fontWeight: 600 }}>View all →</Link>
        </div>
        {subs.length === 0 ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>You have no subscriptions yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Start Date</th>
                  <th>Next Billing</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {subs.map(s => (
                  <tr key={s.id}>
                    <td><b>{s.number}</b></td>
                    <td>{s.plan_name}</td>
                    <td><StatusBadge status={s.status} paused={s.paused} /></td>
                    <td>{s.start_date}</td>
                    <td>{s.next_invoice_date || '—'}</td>
                    <td>
                      <Link to={`/customer/subscriptions/${s.id}`} className="button ghost sm">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoices Preview */}
      <div className="card-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Recent Invoices</h3>
          <Link to="/customer/invoices" className="small" style={{ fontWeight: 600 }}>View all →</Link>
        </div>
        {invoices.length === 0 ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>No invoices generated yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(i => (
                  <tr key={i.id}>
                    <td><b>{i.number}</b></td>
                    <td>{i.period_start} → {i.period_end}</td>
                    <td><StatusBadge status={i.status} overdue={i.overdue} /></td>
                    <td>{i.due_date}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(i.total)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: Number(i.balance) > 0 ? 'var(--alert)' : 'var(--text)' }}>
                      {fmtMoney(i.balance)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" className="ghost sm" onClick={() => printInvoice(i.id)}>🖨️</button>
                        <Link to={`/customer/invoices/${i.id}`} className="button ghost sm">Details →</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
