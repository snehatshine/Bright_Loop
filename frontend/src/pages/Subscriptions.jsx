import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

export default function Subscriptions() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdminOrStaff = user?.role === 'admin' || user?.role === 'staff';

  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // New Subscription Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);

  const [form, setForm] = useState({
    customer_id: '',
    plan_id: '',
    template_id: '',
    start_date: new Date().toISOString().slice(0, 10),
    expiry_date: '',
    payment_terms_days: 15
  });
  const [lines, setLines] = useState([{ product_id: '', variant_id: '', quantity: 1, tax_id: '' }]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSubscriptions = async (p = page, st = statusFilter, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 10 });
      if (st) params.set('status', st);
      if (q) params.set('q', q);
      const res = await api(`/subscriptions?${params.toString()}`);
      setSubscriptions(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch (err) {
      toast.error(err.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const openNewSubModal = async () => {
    try {
      const [custRes, planRes, tmplRes, prodRes, taxRes] = await Promise.all([
        api('/users?role=customer&limit=100'),
        api('/plans?limit=100'),
        api('/templates?limit=100'),
        api('/products?limit=100'),
        api('/taxes')
      ]);
      setCustomers(custRes.items || []);
      setPlans(planRes.items || []);
      setTemplates(tmplRes.items || []);
      setProducts(prodRes.items || []);
      setTaxes(taxRes.items || []);

      setForm({
        customer_id: custRes.items?.[0]?.id || '',
        plan_id: planRes.items?.[0]?.id || '',
        template_id: '',
        start_date: new Date().toISOString().slice(0, 10),
        expiry_date: '',
        payment_terms_days: 15
      });
      setLines([{ product_id: prodRes.items?.[0]?.id || '', variant_id: '', quantity: 1, tax_id: '' }]);
      setFormError('');
      setIsModalOpen(true);
    } catch (err) {
      toast.error('Failed to load dependencies for subscription creation');
    }
  };

  const handleTemplateSelect = async (tmplId) => {
    setForm(prev => ({ ...prev, template_id: tmplId }));
    if (!tmplId) return;
    try {
      const tmpl = await api(`/templates/${tmplId}`);
      if (tmpl.plan_id) {
        setForm(prev => ({ ...prev, plan_id: tmpl.plan_id }));
      }
      if (tmpl.lines && tmpl.lines.length > 0) {
        setLines(tmpl.lines.map(l => ({
          product_id: l.product_id,
          variant_id: l.variant_id || '',
          quantity: l.quantity,
          tax_id: ''
        })));
      }
    } catch (err) {
      toast.error('Failed to preload template lines');
    }
  };

  const calculateLinePrice = (line) => {
    const prod = products.find(p => String(p.id) === String(line.product_id));
    if (!prod) return 0;
    let extra = 0;
    if (line.variant_id) {
      const v = (prod.variants || []).find(v => String(v.id) === String(line.variant_id));
      if (v) extra = Number(v.extra_price || 0);
    }
    return Number(prod.sales_price) + extra;
  };

  const handleAddLine = () => {
    setLines([...lines, { product_id: products[0]?.id || '', variant_id: '', quantity: 1, tax_id: '' }]);
  };

  const handleRemoveLine = (idx) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (idx, field, val) => {
    const updated = [...lines];
    updated[idx][field] = val;
    if (field === 'product_id') {
      updated[idx].variant_id = '';
    }
    setLines(updated);
  };

  const handleCreateSubscription = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.customer_id) return setFormError('Customer is required');
    if (!form.plan_id) return setFormError('Plan is required');
    if (!form.start_date) return setFormError('Start date is required');
    if (lines.length === 0) return setFormError('At least one line is required');

    setSaving(true);
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        plan_id: Number(form.plan_id),
        template_id: form.template_id ? Number(form.template_id) : null,
        start_date: form.start_date,
        expiry_date: form.expiry_date || null,
        payment_terms_days: Number(form.payment_terms_days || 15),
        lines: lines.map(l => ({
          product_id: Number(l.product_id),
          variant_id: l.variant_id ? Number(l.variant_id) : null,
          quantity: Number(l.quantity || 1),
          tax_id: l.tax_id ? Number(l.tax_id) : null
        }))
      };
      const res = await api('/subscriptions', { method: 'POST', body: payload });
      toast.success(`Subscription ${res.number} created`);
      setIsModalOpen(false);
      loadSubscriptions();
    } catch (err) {
      setFormError(err.message || 'Failed to create subscription');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      header: 'Number',
      render: (r) => (
        <Link to={`/subscriptions/${r.id}`} style={{ fontWeight: 700 }}>
          {r.number}
        </Link>
      )
    },
    { header: 'Customer', key: 'customer_name' },
    { header: 'Plan', key: 'plan_name' },
    {
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} paused={r.paused} />
    },
    { header: 'Start Date', key: 'start_date' },
    {
      header: 'Next Billing',
      render: (r) => <span>{r.next_invoice_date || '—'}</span>
    },
    {
      header: 'Action',
      align: 'right',
      render: (r) => (
        <Link to={`/subscriptions/${r.id}`} className="button ghost sm">
          View Detail →
        </Link>
      )
    }
  ];

  const toolbar = (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', flex: 1, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="Search by number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: '240px', padding: '0.45rem 0.75rem' }}
        />
        <select
          value={statusFilter}
          onChange={e => {
            setStatusFilter(e.target.value);
            setPage(1);
            loadSubscriptions(1, e.target.value, search);
          }}
          style={{ padding: '0.45rem 0.75rem' }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="quotation">Quotation</option>
          <option value="confirmed">Confirmed</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
        <button
          type="button"
          className="ghost sm"
          onClick={() => { setPage(1); loadSubscriptions(1, statusFilter, search); }}
        >
          Filter
        </button>
      </div>

      {isAdminOrStaff && (
        <button type="button" className="primary sm" onClick={openNewSubModal}>
          + New Subscription
        </button>
      )}
    </>
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>Subscriptions</h1>
        <p className="sub" style={{ margin: 0 }}>Lifecycle tracking, recurring schedules, and line configuration.</p>
      </div>

      <DataTable
        columns={columns}
        data={subscriptions}
        loading={loading}
        page={page}
        total={total}
        limit={10}
        onPageChange={(p) => loadSubscriptions(p)}
        toolbar={toolbar}
      />

      {/* New Subscription Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Subscription"
        maxWidth="760px"
      >
        <form onSubmit={handleCreateSubscription}>
          <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
            {formError && <p className="error">{formError}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label>
                Customer *
                <select
                  required
                  value={form.customer_id}
                  onChange={e => setForm({ ...form, customer_id: e.target.value })}
                >
                  <option value="">-- Choose Customer --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                  ))}
                </select>
              </label>

              <label>
                Plan *
                <select
                  required
                  value={form.plan_id}
                  onChange={e => setForm({ ...form, plan_id: e.target.value })}
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.period} - {fmtMoney(p.price)})</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <label>
                Load from Template (Optional)
                <select
                  value={form.template_id}
                  onChange={e => handleTemplateSelect(e.target.value)}
                >
                  <option value="">-- None --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Start Date *
                <input
                  type="date"
                  required
                  value={form.start_date}
                  onChange={e => setForm({ ...form, start_date: e.target.value })}
                />
              </label>

              <label>
                Expiry Date
                <input
                  type="date"
                  value={form.expiry_date}
                  onChange={e => setForm({ ...form, expiry_date: e.target.value })}
                />
              </label>
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>Subscription Lines</span>
                <button type="button" className="ghost sm" onClick={handleAddLine}>+ Add Line</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {lines.map((l, idx) => {
                  const prod = products.find(p => String(p.id) === String(l.product_id));
                  const variants = prod?.variants || [];
                  const unitPrice = calculateLinePrice(l);
                  const amount = unitPrice * Number(l.quantity || 1);

                  return (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1.5fr 1fr auto', gap: '0.5rem', alignItems: 'center', background: '#fafcfb', padding: '0.5rem', border: '1px solid var(--line)', borderRadius: 6 }}>
                      <select
                        required
                        value={l.product_id}
                        onChange={e => handleLineChange(idx, 'product_id', e.target.value)}
                      >
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>

                      <select
                        value={l.variant_id}
                        onChange={e => handleLineChange(idx, 'variant_id', e.target.value)}
                        disabled={variants.length === 0}
                      >
                        <option value="">No Variant</option>
                        {variants.map(v => (
                          <option key={v.id} value={v.id}>{v.attribute}: {v.value} (+{fmtMoney(v.extra_price)})</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        required
                        placeholder="Qty"
                        value={l.quantity}
                        onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                      />

                      <select
                        value={l.tax_id}
                        onChange={e => handleLineChange(idx, 'tax_id', e.target.value)}
                      >
                        <option value="">No Tax</option>
                        {taxes.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.rate_percent}%)</option>
                        ))}
                      </select>

                      <div style={{ fontWeight: 700, fontSize: '0.9rem', textAlign: 'right' }}>
                        {fmtMoney(amount)}
                      </div>

                      <button
                        type="button"
                        className="danger sm"
                        onClick={() => handleRemoveLine(idx)}
                        disabled={lines.length <= 1}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="ghost" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Creating...' : 'Create Subscription'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
