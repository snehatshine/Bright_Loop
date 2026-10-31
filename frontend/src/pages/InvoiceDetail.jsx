import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmtMoney, printInvoice } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import Stepper from '../components/Stepper';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';

export default function InvoiceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const isAdminOrStaff = user?.role === 'admin' || user?.role === 'staff';

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Payment Modal
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    method: 'Card',
    amount: '',
    paid_on: new Date().toISOString().slice(0, 10),
    note: ''
  });
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);

  const loadInvoice = async () => {
    setLoading(true);
    try {
      const data = await api(`/invoices/${id}`);
      setInvoice(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
  }, [id]);

  const handleConfirm = async () => {
    setActionLoading(true);
    try {
      await api(`/invoices/${id}/confirm`, { method: 'POST' });
      toast.success('Invoice confirmed');
      loadInvoice();
    } catch (err) {
      toast.error(err.message || 'Confirm failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this invoice?')) return;
    setActionLoading(true);
    try {
      await api(`/invoices/${id}/cancel`, { method: 'POST' });
      toast.success('Invoice cancelled');
      loadInvoice();
    } catch (err) {
      toast.error(err.message || 'Cancel failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSend = async () => {
    setActionLoading(true);
    try {
      const res = await api(`/invoices/${id}/send`, { method: 'POST' });
      toast.success(res.message || 'Invoice emailed successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to send invoice email');
    } finally {
      setActionLoading(false);
    }
  };

  const openPaymentModal = () => {
    setPayForm({
      method: 'Card',
      amount: String(invoice.balance || '0.00'),
      paid_on: new Date().toISOString().slice(0, 10),
      note: ''
    });
    setPayError('');
    setIsPayModalOpen(true);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    setPayError('');
    const amt = Number(payForm.amount);
    const bal = Number(invoice.balance || 0);

    if (isNaN(amt) || amt <= 0) {
      return setPayError('Payment amount must be greater than zero');
    }
    if (amt > bal) {
      return setPayError(`Payment amount cannot exceed the balance due of ${fmtMoney(bal)}`);
    }

    setPaying(true);
    try {
      await api('/payments', {
        method: 'POST',
        body: {
          invoice_id: Number(id),
          method: payForm.method,
          amount: payForm.amount,
          paid_on: payForm.paid_on,
          note: payForm.note || undefined
        }
      });
      toast.success('Payment recorded successfully');
      setIsPayModalOpen(false);
      loadInvoice();
    } catch (err) {
      setPayError(err.message || 'Payment recording failed');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <Spinner text="Loading invoice..." />;
  if (!invoice) return <p>Invoice not found.</p>;

  const steps = ['Draft', 'Confirmed', 'Paid'];
  const canConfirm = invoice.status === 'draft';
  const canCancel = (invoice.status === 'draft' || invoice.status === 'confirmed') && Number(invoice.amount_paid) === 0;
  const canSend = invoice.status === 'confirmed' || invoice.status === 'paid';
  const canPay = invoice.status === 'confirmed' && Number(invoice.balance) > 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Link to="/invoices" style={{ fontSize: '0.85rem', fontWeight: 600 }}>← Back to Invoices</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
            <h1 style={{ margin: 0 }}>{invoice.number}</h1>
            <StatusBadge status={invoice.status} overdue={invoice.overdue} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="ghost" onClick={() => printInvoice(invoice.id)}>
            🖨️ Print Invoice
          </button>

          {isAdminOrStaff && (
            <>
              {canConfirm && (
                <button type="button" className="primary" disabled={actionLoading} onClick={handleConfirm}>
                  {actionLoading ? 'Confirming...' : '✓ Confirm Invoice'}
                </button>
              )}

              {canPay && (
                <button type="button" className="primary" onClick={openPaymentModal}>
                  💳 Record Payment
                </button>
              )}

              {canSend && (
                <button type="button" className="ghost" disabled={actionLoading} onClick={handleSend}>
                  ✉️ Email Customer
                </button>
              )}

              {canCancel && (
                <button type="button" className="danger" disabled={actionLoading} onClick={handleCancel}>
                  Cancel Invoice
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {invoice.status !== 'cancelled' && (
        <Stepper steps={steps} currentStep={invoice.status} />
      )}

      {/* Invoice Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <div className="card-box">
          <h3 style={{ margin: '0 0 0.75rem' }}>Customer Details</h3>
          <p style={{ margin: '0 0 0.35rem' }}><b>Name:</b> {invoice.customer_name}</p>
          <p style={{ margin: '0 0 0.35rem' }}><b>Email:</b> {invoice.customer_email}</p>
          <p style={{ margin: 0 }}>
            <b>Subscription:</b> <Link to={`/subscriptions/${invoice.subscription_id}`}>View Subscription →</Link>
          </p>
        </div>

        <div className="card-box">
          <h3 style={{ margin: '0 0 0.75rem' }}>Billing Period & Due Date</h3>
          <p style={{ margin: '0 0 0.35rem' }}><b>Period:</b> {invoice.period_start} → {invoice.period_end}</p>
          <p style={{ margin: '0 0 0.35rem' }}><b>Due Date:</b> {invoice.due_date}</p>
          <p style={{ margin: 0 }}>
            <b>Status:</b> <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{invoice.status}</span>
          </p>
        </div>
      </div>

      {/* Lines Table */}
      <div className="card-box" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem' }}>Invoice Line Items</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'right' }}>Tax %</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.lines || []).map(l => {
                const isDiscount = Number(l.amount) < 0;
                return (
                  <tr key={l.id} style={isDiscount ? { color: '#047857', background: '#f0fdf4' } : {}}>
                    <td>
                      <b>{l.description}</b>
                    </td>
                    <td style={{ textAlign: 'right' }}>{l.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(l.unit_price)}</td>
                    <td style={{ textAlign: 'right' }}>{l.tax_percent > 0 ? `${l.tax_percent}%` : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {fmtMoney(l.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Financial Summary */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Subtotal:</span>
              <span>{fmtMoney(invoice.subtotal)}</span>
            </div>
            {Number(invoice.discount_total) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#047857' }}>
                <span>Discounts:</span>
                <span>-{fmtMoney(invoice.discount_total)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Taxes:</span>
              <span>{fmtMoney(invoice.tax_total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '0.5rem', fontWeight: 700, fontSize: '1.1rem' }}>
              <span>Total:</span>
              <span>{fmtMoney(invoice.total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--loop)' }}>
              <span>Paid:</span>
              <span>{fmtMoney(invoice.amount_paid)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--ink)', paddingTop: '0.5rem', fontWeight: 700, fontSize: '1.15rem', color: Number(invoice.balance) > 0 ? 'var(--alert)' : 'var(--text)' }}>
              <span>Balance Due:</span>
              <span>{fmtMoney(invoice.balance)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="card-box">
        <h3 style={{ margin: '0 0 1rem' }}>Payment Transactions</h3>
        {(invoice.payments || []).length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>No payments recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Note</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map(p => (
                  <tr key={p.id}>
                    <td>#{p.id}</td>
                    <td>{p.paid_on}</td>
                    <td><b>{p.method}</b></td>
                    <td>{p.note || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--loop)' }}>
                      {fmtMoney(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <Modal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        title="Record Payment"
        maxWidth="460px"
      >
        <form onSubmit={handleRecordPayment}>
          <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
            {payError && <p className="error">{payError}</p>}
            <div style={{ background: '#f8faf9', padding: '0.75rem', borderRadius: 6, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Remaining Balance Due:</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink)' }}>{fmtMoney(invoice.balance)}</div>
            </div>

            <label>
              Payment Method *
              <select
                required
                value={payForm.method}
                onChange={e => setPayForm({ ...payForm, method: e.target.value })}
              >
                <option value="Card">Card</option>
                <option value="UPI">UPI</option>
                <option value="Bank transfer">Bank transfer</option>
                <option value="Cash">Cash</option>
              </select>
            </label>

            <label>
              Amount (₹) *
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={Number(invoice.balance)}
                required
                value={payForm.amount}
                onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
              />
            </label>

            <label>
              Payment Date *
              <input
                type="date"
                required
                value={payForm.paid_on}
                onChange={e => setPayForm({ ...payForm, paid_on: e.target.value })}
              />
            </label>

            <label>
              Notes
              <input
                type="text"
                placeholder="Transaction reference, receipt number..."
                value={payForm.note}
                onChange={e => setPayForm({ ...payForm, note: e.target.value })}
              />
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="ghost" onClick={() => setIsPayModalOpen(false)} disabled={paying}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={paying}>
              {paying ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
