import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmtMoney } from '../api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Stepper from '../components/Stepper';
import Spinner from '../components/Spinner';

export default function CustomerSubscriptions() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const loadList = async (p = page) => {
    setLoading(true);
    try {
      const res = await api(`/subscriptions?page=${p}&limit=10`);
      setSubs(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (subId) => {
    setLoading(true);
    try {
      const data = await api(`/subscriptions/${subId}`);
      setSelectedSub(data);
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
      setSelectedSub(null);
      loadList();
    }
  }, [id]);

  if (loading) return <Spinner text="Loading your subscriptions..." />;

  // Detail View
  if (selectedSub) {
    const steps = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'];
    return (
      <div>
        <div style={{ marginBottom: '1rem' }}>
          <Link to="/customer/subscriptions" style={{ fontSize: '0.85rem', fontWeight: 600 }}>← Back to All Subscriptions</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
            <h1 style={{ margin: 0 }}>{selectedSub.number}</h1>
            <StatusBadge status={selectedSub.status} paused={selectedSub.paused} />
          </div>
        </div>

        <Stepper steps={steps} currentStep={selectedSub.status} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div className="card-box">
            <h3 style={{ margin: '0 0 0.5rem' }}>Plan Details</h3>
            <p style={{ margin: '0 0 0.35rem' }}><b>Plan:</b> {selectedSub.plan_name}</p>
            <p style={{ margin: 0 }}><b>Terms:</b> {selectedSub.payment_terms_days} days</p>
          </div>
          <div className="card-box">
            <h3 style={{ margin: '0 0 0.5rem' }}>Dates & Schedule</h3>
            <p style={{ margin: '0 0 0.35rem' }}><b>Start Date:</b> {selectedSub.start_date}</p>
            <p style={{ margin: '0 0 0.35rem' }}><b>Expiry Date:</b> {selectedSub.expiry_date || 'Indefinite'}</p>
            <p style={{ margin: 0 }}><b>Next Invoice Date:</b> {selectedSub.next_invoice_date || '—'}</p>
          </div>
        </div>

        <div className="card-box">
          <h3 style={{ margin: '0 0 1rem' }}>Included Software & Services</h3>
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
                {(selectedSub.lines || []).map(l => (
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
      </div>
    );
  }

  // List View
  const columns = [
    {
      header: 'Subscription #',
      render: (r) => (
        <Link to={`/customer/subscriptions/${r.id}`} style={{ fontWeight: 700 }}>
          {r.number}
        </Link>
      )
    },
    { header: 'Plan', key: 'plan_name' },
    {
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} paused={r.paused} />
    },
    { header: 'Start Date', key: 'start_date' },
    { header: 'Next Billing', render: (r) => <span>{r.next_invoice_date || '—'}</span> },
    {
      header: 'Action',
      align: 'right',
      render: (r) => (
        <Link to={`/customer/subscriptions/${r.id}`} className="button ghost sm">
          View Detail →
        </Link>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>My Subscriptions</h1>
        <p className="sub" style={{ margin: 0 }}>Review all your active, quotation, and past software subscriptions.</p>
      </div>

      <DataTable
        columns={columns}
        data={subs}
        loading={loading}
        page={page}
        total={total}
        limit={10}
        onPageChange={(p) => loadList(p)}
      />
    </div>
  );
}
