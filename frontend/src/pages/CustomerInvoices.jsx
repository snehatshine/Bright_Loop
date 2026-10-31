import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmtMoney, printInvoice } from '../api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Stepper from '../components/Stepper';
import Spinner from '../components/Spinner';

export default function CustomerInvoices() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadList = async (p = page) => {
    setLoading(true);
    try {
      const res = await api(`/invoices?page=${p}&limit=10`);
      setInvoices(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (invId) => {
    setLoading(true);
    try {
      const data = await api(`/invoices/${invId}`);
      setSelectedInvoice(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadDetail(id);
    } else {
      setSelectedInvoice(null);
      loadList();
    }
  }, [id]);

  if (loading) return <Spinner text="Loading invoices..." />;

  // Detail View
  if (selectedInvoice) {
    const steps = ['Draft', 'Confirmed', 'Paid'];
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <Link to="/customer/invoices" style={{ fontSize: '0.85rem', fontWeight: 600 }}>← Back to All Invoices</Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
              <h1 style={{ margin: 0 }}>{selectedInvoice.number}</h1>
              <StatusBadge status={selectedInvoice.status} overdue={selectedInvoice.overdue} />
            </div>
          </div>

          <button type="button" className="ghost" onClick={() => printInvoice(selectedInvoice.id)}>
            🖨️ Print Invoice
          </button>
        </div>

        {selectedInvoice.status !== 'cancelled' && (
          <Stepper steps={steps} currentStep={selectedInvoice.status} />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div className="card-box">
            <h3 style={{ margin: '0 0 0.5rem' }}>Billing Information</h3>
            <p style={{ margin: '0 0 0.35rem' }}><b>Billed To:</b> {selectedInvoice.customer_name}</p>
            <p style={{ margin: '0 0 0.35rem' }}><b>Email:</b> {selectedInvoice.customer_email}</p>
            <p style={{ margin: 0 }}><b>Invoice Number:</b> {selectedInvoice.number}</p>
          </div>
          <div className="card-box">
            <h3 style={{ margin: '0 0 0.5rem' }}>Period & Dates</h3>
            <p style={{ margin: '0 0 0.35rem' }}><b>Period:</b> {selectedInvoice.period_start} → {selectedInvoice.period_end}</p>
            <p style={{ margin: '0 0 0.35rem' }}><b>Due Date:</b> {selectedInvoice.due_date}</p>
            <p style={{ margin: 0 }}><b>Status:</b> <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{selectedInvoice.status}</span></p>
          </div>
        </div>

        {/* Lines */}
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
                {(selectedInvoice.lines || []).map(l => {
                  const isDiscount = Number(l.amount) < 0;
                  return (
                    <tr key={l.id} style={isDiscount ? { color: '#047857', background: '#f0fdf4' } : {}}>
                      <td><b>{l.description}</b></td>
                      <td style={{ textAlign: 'right' }}>{l.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(l.unit_price)}</td>
                      <td style={{ textAlign: 'right' }}>{l.tax_percent > 0 ? `${l.tax_percent}%` : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(l.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Subtotal:</span>
                <span>{fmtMoney(selectedInvoice.subtotal)}</span>
              </div>
              {Number(selectedInvoice.discount_total) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#047857' }}>
                  <span>Discounts:</span>
                  <span>-{fmtMoney(selectedInvoice.discount_total)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Taxes:</span>
                <span>{fmtMoney(selectedInvoice.tax_total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '0.5rem', fontWeight: 700, fontSize: '1.1rem' }}>
                <span>Total:</span>
                <span>{fmtMoney(selectedInvoice.total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--loop)' }}>
                <span>Paid:</span>
                <span>{fmtMoney(selectedInvoice.amount_paid)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--ink)', paddingTop: '0.5rem', fontWeight: 700, fontSize: '1.15rem', color: Number(selectedInvoice.balance) > 0 ? 'var(--alert)' : 'var(--text)' }}>
                <span>Balance Due:</span>
                <span>{fmtMoney(selectedInvoice.balance)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payments History */}
        <div className="card-box">
          <h3 style={{ margin: '0 0 1rem' }}>Settled Payments</h3>
          {(selectedInvoice.payments || []).length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>No payments recorded yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payment Method</th>
                    <th>Receipt Note</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.payments.map(p => (
                    <tr key={p.id}>
                      <td>{p.paid_on}</td>
                      <td><b>{p.method}</b></td>
                      <td>{p.note || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--loop)' }}>{fmtMoney(p.amount)}</td>
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

  // List View
  const columns = [
    {
      header: 'Invoice #',
      render: (r) => (
        <Link to={`/customer/invoices/${r.id}`} style={{ fontWeight: 700 }}>
          {r.number}
        </Link>
      )
    },
    {
      header: 'Billing Period',
      render: (r) => <span>{r.period_start} → {r.period_end}</span>
    },
    {
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} overdue={r.overdue} />
    },
    { header: 'Due Date', key: 'due_date' },
    {
      header: 'Total',
      align: 'right',
      render: (r) => <b>{fmtMoney(r.total)}</b>
    },
    {
      header: 'Balance Due',
      align: 'right',
      render: (r) => (
        <b style={{ color: Number(r.balance) > 0 ? 'var(--alert)' : 'var(--text)' }}>
          {fmtMoney(r.balance)}
        </b>
      )
    },
    {
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          <button type="button" className="ghost sm" onClick={() => printInvoice(r.id)}>🖨️</button>
          <Link to={`/customer/invoices/${r.id}`} className="button ghost sm">View →</Link>
        </div>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>My Invoices</h1>
        <p className="sub" style={{ margin: 0 }}>Review all statements, payment receipts, and outstanding balances.</p>
      </div>

      <DataTable
        columns={columns}
        data={invoices}
        loading={loading}
        page={page}
        total={total}
        limit={10}
        onPageChange={(p) => loadList(p)}
      />
    </div>
  );
}
