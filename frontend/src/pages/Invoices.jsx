import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtMoney, printInvoice } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';

export default function Invoices() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdminOrStaff = user?.role === 'admin' || user?.role === 'staff';
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get('overdue') === 'true');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadInvoices = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 10 });
      if (statusFilter) params.set('status', statusFilter);
      if (overdueOnly) params.set('overdue', 'true');
      if (search) params.set('q', search);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await api(`/invoices?${params.toString()}`);
      setInvoices(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch (err) {
      toast.error(err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [overdueOnly]);

  const handleGenerateInvoices = async () => {
    setGenerating(true);
    try {
      const res = await api('/invoices/generate', { method: 'POST' });
      toast.success(`Billing Run Complete: ${res.created} created, ${res.skipped_existing} existing skipped.`);
      loadInvoices(1);
    } catch (err) {
      toast.error(err.message || 'Failed to generate due invoices');
    } finally {
      setGenerating(false);
    }
  };

  const columns = [
    {
      header: 'Invoice #',
      render: (r) => (
        <Link to={`/invoices/${r.id}`} style={{ fontWeight: 700 }}>
          {r.number}
        </Link>
      )
    },
    { header: 'Customer', key: 'customer_name' },
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
      header: 'Paid',
      align: 'right',
      render: (r) => <span style={{ color: 'var(--loop)' }}>{fmtMoney(r.amount_paid)}</span>
    },
    {
      header: 'Balance',
      align: 'right',
      render: (r) => (
        <span style={{ fontWeight: 700, color: Number(r.balance) > 0 ? 'var(--alert)' : 'var(--text)' }}>
          {fmtMoney(r.balance)}
        </span>
      )
    },
    {
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="ghost sm"
            onClick={() => printInvoice(r.id)}
            title="Print printable invoice"
          >
            🖨️
          </button>
          <Link to={`/invoices/${r.id}`} className="button ghost sm">
            View →
          </Link>
        </div>
      )
    }
  ];

  const toolbar = (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
        <input
          type="search"
          placeholder="Search by number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: '180px', padding: '0.45rem 0.6rem' }}
        />

        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: '0.45rem 0.6rem' }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={e => { setOverdueOnly(e.target.checked); setPage(1); }}
          />
          Overdue Only
        </label>

        <input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          placeholder="From"
          style={{ padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
        />
        <input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          placeholder="To"
          style={{ padding: '0.45rem 0.6rem', fontSize: '0.85rem' }}
        />

        <button type="button" className="ghost sm" onClick={() => { setPage(1); loadInvoices(1); }}>
          Filter
        </button>
      </div>

      {isAdminOrStaff && (
        <button
          type="button"
          className="primary sm"
          disabled={generating}
          onClick={handleGenerateInvoices}
        >
          {generating ? 'Running Billing...' : '⚡ Generate Due Invoices'}
        </button>
      )}
    </>
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>Invoices</h1>
        <p className="sub" style={{ margin: 0 }}>Review billed cycles, payment collections, and printable statements.</p>
      </div>

      <DataTable
        columns={columns}
        data={invoices}
        loading={loading}
        page={page}
        total={total}
        limit={10}
        onPageChange={(p) => loadInvoices(p)}
        toolbar={toolbar}
      />
    </div>
  );
}
