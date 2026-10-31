import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney } from '../api';
import { useToast } from '../components/Toast';
import DataTable from '../components/DataTable';

export default function Payments() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [method, setMethod] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadPayments = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 15 });
      if (method) params.set('method', method);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await api(`/payments?${params.toString()}`);
      setPayments(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch (err) {
      toast.error(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const handleFilter = (e) => {
    e.preventDefault();
    setPage(1);
    loadPayments(1);
  };

  const columns = [
    { header: 'ID', key: 'id', width: '70px' },
    {
      header: 'Invoice #',
      render: (r) => (
        <Link to={`/invoices/${r.invoice_id}`} style={{ fontWeight: 700 }}>
          {r.invoice_number || `INV-${r.invoice_id}`}
        </Link>
      )
    },
    { header: 'Payment Date', key: 'paid_on' },
    {
      header: 'Method',
      render: (r) => <b>{r.method}</b>
    },
    {
      header: 'Amount Paid',
      align: 'right',
      render: (r) => <b style={{ color: 'var(--loop)' }}>{fmtMoney(r.amount)}</b>
    },
    {
      header: 'Note',
      render: (r) => <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{r.note || '—'}</span>
    }
  ];

  const toolbar = (
    <form onSubmit={handleFilter} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
      <select
        value={method}
        onChange={e => setMethod(e.target.value)}
        style={{ padding: '0.45rem 0.6rem' }}
      >
        <option value="">All Methods</option>
        <option value="Card">Card</option>
        <option value="UPI">UPI</option>
        <option value="Bank transfer">Bank transfer</option>
        <option value="Cash">Cash</option>
      </select>

      <input
        type="date"
        value={fromDate}
        onChange={e => setFromDate(e.target.value)}
        placeholder="From Date"
        style={{ padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
      />
      <input
        type="date"
        value={toDate}
        onChange={e => setToDate(e.target.value)}
        placeholder="To Date"
        style={{ padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
      />

      <button type="submit" className="ghost sm">
        Filter
      </button>
      {(method || fromDate || toDate) && (
        <button
          type="button"
          className="ghost sm"
          onClick={() => { setMethod(''); setFromDate(''); setToDate(''); setPage(1); loadPayments(1); }}
        >
          Reset
        </button>
      )}
    </form>
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>Payments Ledger</h1>
        <p className="sub" style={{ margin: 0 }}>Review settled cash, card, bank, and UPI transactions linked to customer invoices.</p>
      </div>

      <DataTable
        columns={columns}
        data={payments}
        loading={loading}
        page={page}
        total={total}
        limit={15}
        onPageChange={(p) => loadPayments(p)}
        toolbar={toolbar}
      />
    </div>
  );
}
