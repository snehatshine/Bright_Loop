import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, fmtMoney } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import Stepper from '../components/Stepper';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

export default function SubscriptionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const isAdminOrStaff = user?.role === 'admin' || user?.role === 'staff';

  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState(null);
  const [plan, setPlan] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  const loadSubscription = async () => {
    setLoading(true);
    try {
      const data = await api(`/subscriptions/${id}`);
      setSub(data);
      if (data.plan_id) {
        const planData = await api(`/plans/${data.plan_id}`);
        setPlan(planData);
      }
      const invData = await api(`/invoices?subscription_id=${id}&limit=20`);
      setInvoices(invData.items || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, [id]);

  const handleTransition = async (nextStatus) => {
    setActionLoading(true);
    try {
      await api(`/subscriptions/${id}/transition`, { method: 'POST', body: { to: nextStatus } });
      toast.success(`Subscription moved to ${nextStatus}`);
      loadSubscription();
    } catch (err) {
      toast.error(err.message || 'Transition failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePauseResume = async () => {
    setActionLoading(true);
    try {
      const endpoint = sub.paused ? `/subscriptions/${id}/resume` : `/subscriptions/${id}/pause`;
      await api(endpoint, { method: 'POST' });
      toast.success(sub.paused ? 'Subscription resumed' : 'Subscription paused');
      loadSubscription();
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenew = async () => {
    setActionLoading(true);
    try {
      const updated = await api(`/subscriptions/${id}/renew`, { method: 'POST' });
      toast.success(`Subscription renewed. New expiry: ${updated.expiry_date}`);
      loadSubscription();
    } catch (err) {
      toast.error(err.message || 'Renewal failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    setActionLoading(true);
    try {
      await api(`/subscriptions/${id}/transition`, { method: 'POST', body: { to: 'closed' } });
      toast.success('Subscription closed');
      loadSubscription();
    } catch (err) {
      toast.error(err.message || 'Failed to close subscription');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Spinner text="Loading subscription details..." />;
  if (!sub) return <p>Subscription not found.</p>;

  const steps = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'];

  // Next transition mapping
  let nextAction = null;
  if (sub.status === 'draft') nextAction = { label: 'Send Quotation', to: 'quotation' };
  else if (sub.status === 'quotation') nextAction = { label: 'Confirm Subscription', to: 'confirmed' };
  else if (sub.status === 'confirmed') nextAction = { label: 'Activate Subscription', to: 'active' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Link to="/subscriptions" style={{ fontSize: '0.85rem', fontWeight: 600 }}>← Back to Subscriptions</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
            <h1 style={{ margin: 0 }}>{sub.number}</h1>
            <StatusBadge status={sub.status} paused={sub.paused} />
          </div>
        </div>

        {isAdminOrStaff && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {nextAction && (
              <button
                type="button"
                className="primary"
                disabled={actionLoading}
                onClick={() => handleTransition(nextAction.to)}
              >
                {actionLoading ? 'Updating...' : `Advance: ${nextAction.label}`}
              </button>
            )}

            {sub.status === 'active' && plan?.pausable && (
              <button
                type="button"
                className="ghost"
                disabled={actionLoading}
                onClick={handlePauseResume}
              >
                {sub.paused ? '▶ Resume' : '⏸ Pause'}
              </button>
            )}

            {sub.status === 'active' && plan?.renewable && (
              <button
                type="button"
                className="ghost"
                disabled={actionLoading}
                onClick={handleRenew}
              >
                🔄 Renew Cycle
              </button>
            )}

            {sub.status === 'active' && plan?.closable && (
              <button
                type="button"
                className="danger"
                disabled={actionLoading}
                onClick={handleClose}
              >
                ✖ Close Subscription
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stepper */}
      <Stepper steps={steps} currentStep={sub.status} />

      {/* Overview Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="card-box">
          <h3 style={{ margin: '0 0 0.75rem' }}>Customer & Plan</h3>
          <p style={{ margin: '0 0 0.35rem' }}><b>Customer:</b> {sub.customer_name}</p>
          <p style={{ margin: '0 0 0.35rem' }}><b>Billing Plan:</b> {sub.plan_name} ({plan?.period})</p>
          <p style={{ margin: 0 }}><b>Terms:</b> {sub.payment_terms_days} days to pay</p>
        </div>

        <div className="card-box">
          <h3 style={{ margin: '0 0 0.75rem' }}>Schedule & Dates</h3>
          <p style={{ margin: '0 0 0.35rem' }}><b>Start Date:</b> {sub.start_date}</p>
          <p style={{ margin: '0 0 0.35rem' }}><b>Expiry Date:</b> {sub.expiry_date || 'Ongoing / Indefinite'}</p>
          <p style={{ margin: 0 }}><b>Next Invoice Date:</b> {sub.next_invoice_date || '—'}</p>
        </div>
      </div>

      {/* Lines Table */}
      <div className="card-box" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem' }}>Subscription Lines</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant</th>
                <th style={{ textAlign: 'right' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'right' }}>Tax</th>
                <th style={{ textAlign: 'right' }}>Line Amount</th>
              </tr>
            </thead>
            <tbody>
              {(sub.lines || []).map(l => (
                <tr key={l.id}>
                  <td><b>{l.product_name}</b></td>
                  <td>{l.variant_value || 'Standard'}</td>
                  <td style={{ textAlign: 'right' }}>{l.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(l.unit_price)}</td>
                  <td style={{ textAlign: 'right' }}>{l.tax_name ? `${l.tax_name} (${l.tax_rate}%)` : 'None'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoices Generated */}
      <div className="card-box">
        <h3 style={{ margin: '0 0 1rem' }}>Generated Invoices</h3>
        {invoices.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>No invoices generated for this subscription yet.</p>
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
                  <th style={{ textAlign: 'right' }}>Paid</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>
                      <Link to={`/invoices/${inv.id}`} style={{ fontWeight: 700 }}>
                        {inv.number}
                      </Link>
                    </td>
                    <td>{inv.period_start} → {inv.period_end}</td>
                    <td><StatusBadge status={inv.status} overdue={inv.overdue} /></td>
                    <td>{inv.due_date}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(inv.total)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(inv.amount_paid)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(inv.balance)}</td>
                    <td>
                      <Link to={`/invoices/${inv.id}`} className="button ghost sm">View →</Link>
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
