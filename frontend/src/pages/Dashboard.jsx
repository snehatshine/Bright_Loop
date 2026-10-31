import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney } from '../api';
import Spinner from '../components/Spinner';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState(null);
  const [revData, setRevData] = useState([]);
  const [overdueList, setOverdueList] = useState([]);
  const [methods, setMethods] = useState([]);
  const [error, setError] = useState('');

  const loadData = async (fromDate = from, toDate = to) => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (fromDate) q.set('from', fromDate);
      if (toDate) q.set('to', toDate);
      const queryStr = q.toString() ? `?${q.toString()}` : '';

      const [sumRes, revRes, overRes, methRes] = await Promise.all([
        api(`/reports/summary${queryStr}`),
        api('/reports/revenue-by-month?months=12'),
        api('/reports/overdue?limit=5'),
        api(`/reports/payments-by-method${queryStr}`)
      ]);

      setSummary(sumRes);
      setRevData(revRes.items || []);
      setOverdueList(overRes.items || []);
      setMethods(methRes.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFilter = (e) => {
    e.preventDefault();
    loadData(from, to);
  };

  const handleReset = () => {
    setFrom('');
    setTo('');
    loadData('', '');
  };

  if (loading && !summary) {
    return <Spinner text="Loading executive dashboard..." />;
  }

  // Calculate SVG chart scale
  const maxVal = Math.max(
    ...revData.map(d => Math.max(Number(d.invoiced || 0), Number(d.collected || 0))),
    100
  );
  const svgHeight = 220;
  const svgWidth = 650;
  const barGroupWidth = svgWidth / Math.max(revData.length, 1);
  const barWidth = Math.max(6, (barGroupWidth - 16) / 2);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1>Executive Dashboard</h1>
          <p className="sub" style={{ margin: 0 }}>High-level subscription performance and financial summaries.</p>
        </div>

        <form onSubmit={handleFilter} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <span>From:</span>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
            />
          </label>
          <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
            <span>To:</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
            />
          </label>
          <button type="submit" className="primary sm">Filter</button>
          {(from || to) && <button type="button" className="ghost sm" onClick={handleReset}>Clear</button>}
        </form>
      </div>

      {error && <p className="error" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* KPI Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-title">Active Subscriptions</span>
          <span className="metric-value">{summary?.active_subscriptions ?? 0}</span>
          <span className="metric-sub">{summary?.paused_subscriptions ?? 0} paused</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Revenue Collected</span>
          <span className="metric-value" style={{ color: 'var(--loop)' }}>{fmtMoney(summary?.revenue_collected)}</span>
          <span className="metric-sub">{summary?.payments_count ?? 0} total payments</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Outstanding Invoices</span>
          <span className="metric-value">{fmtMoney(summary?.outstanding)}</span>
          <span className="metric-sub">{summary?.invoices_by_status?.confirmed ?? 0} confirmed pending</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Overdue Invoices</span>
          <span className="metric-value" style={{ color: 'var(--alert)' }}>{summary?.overdue_count ?? 0}</span>
          <span className="metric-sub">{fmtMoney(summary?.overdue_amount)} balance due</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Inline SVG Chart: Revenue by Month */}
        <div className="card-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Monthly Invoiced vs Collected</h3>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', fontWeight: 600 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 10, background: '#2563eb', borderRadius: 2 }} /> Invoiced
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 10, background: '#1f8f6b', borderRadius: 2 }} /> Collected
              </span>
            </div>
          </div>

          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight + 40}`} style={{ width: '100%', minWidth: '480px', height: 'auto' }}>
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = svgHeight - pct * (svgHeight - 30) - 20;
                return (
                  <g key={i}>
                    <line x1="0" y1={y} x2={svgWidth} y2={y} stroke="#e2ece8" strokeDasharray="4" />
                    <text x="5" y={y - 4} fontSize="10" fill="#8ba098">{fmtMoney(maxVal * pct)}</text>
                  </g>
                );
              })}

              {/* Grouped bars */}
              {revData.map((d, idx) => {
                const xGroup = idx * barGroupWidth;
                const invHeight = (Number(d.invoiced) / maxVal) * (svgHeight - 40);
                const colHeight = (Number(d.collected) / maxVal) * (svgHeight - 40);
                const yInv = svgHeight - 20 - invHeight;
                const yCol = svgHeight - 20 - colHeight;

                return (
                  <g key={d.month}>
                    {/* Invoiced Bar */}
                    <rect
                      x={xGroup + 6}
                      y={yInv}
                      width={barWidth}
                      height={Math.max(2, invHeight)}
                      fill="#2563eb"
                      rx="3"
                    >
                      <title>{`${d.month} Invoiced: ${fmtMoney(d.invoiced)}`}</title>
                    </rect>
                    {/* Collected Bar */}
                    <rect
                      x={xGroup + 6 + barWidth + 3}
                      y={yCol}
                      width={barWidth}
                      height={Math.max(2, colHeight)}
                      fill="#1f8f6b"
                      rx="3"
                    >
                      <title>{`${d.month} Collected: ${fmtMoney(d.collected)}`}</title>
                    </rect>
                    {/* Month Label */}
                    <text
                      x={xGroup + barGroupWidth / 2}
                      y={svgHeight + 5}
                      fontSize="10"
                      fill="#4b6358"
                      textAnchor="middle"
                    >
                      {d.month.slice(5)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Subscriptions by Status & Payments by Method */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card-box">
            <h3 style={{ margin: '0 0 1rem' }}>Subscriptions by Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '0.75rem', textAlign: 'center' }}>
              {Object.entries(summary?.subscriptions_by_status || {}).map(([st, cnt]) => (
                <div key={st} style={{ background: '#fafcfb', border: '1px solid var(--line)', borderRadius: 6, padding: '0.75rem 0.5rem' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink)' }}>{cnt}</div>
                  <div style={{ fontSize: '0.78rem', textTransform: 'capitalize', color: 'var(--muted)', marginTop: '0.2rem' }}>{st}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-box">
            <h3 style={{ margin: '0 0 1rem' }}>Payments by Method</h3>
            {methods.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>No payments recorded in this period.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {methods.map(m => (
                  <div key={m.method} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #f0f4f2' }}>
                    <span style={{ fontWeight: 600 }}>{m.method} <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>({m.count} txns)</span></span>
                    <span style={{ fontWeight: 700, color: 'var(--loop)' }}>{fmtMoney(m.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overdue Invoices Table */}
      <div className="card-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Priority Overdue Invoices</h3>
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Confirmed invoices with past due dates requiring collection</span>
          </div>
          <Link to="/invoices?overdue=true" className="small" style={{ fontWeight: 600 }}>
            View all overdue →
          </Link>
        </div>

        {overdueList.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>No overdue invoices found. Excellent!</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Due Date</th>
                  <th>Days Overdue</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Paid</th>
                  <th style={{ textAlign: 'right' }}>Balance Due</th>
                </tr>
              </thead>
              <tbody>
                {overdueList.map(inv => (
                  <tr key={inv.id}>
                    <td>
                      <Link to={`/invoices/${inv.id}`} style={{ fontWeight: 700 }}>
                        {inv.number}
                      </Link>
                    </td>
                    <td>{inv.customer_name}</td>
                    <td>{inv.due_date}</td>
                    <td>
                      <span className="badge overdue">{inv.days_overdue} days</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(inv.total)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(inv.amount_paid)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--alert)' }}>
                      {fmtMoney(inv.balance)}
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
