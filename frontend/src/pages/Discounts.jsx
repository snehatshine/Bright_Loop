import { useState, useEffect } from 'react';
import { api, fmtMoney } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Discounts() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [discounts, setDiscounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'percentage',
    value: '',
    scope: 'subscription',
    product_id: '',
    min_purchase: '0',
    min_quantity: '0',
    start_date: '',
    end_date: '',
    usage_limit: ''
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async (p = page) => {
    setLoading(true);
    try {
      const [discRes, prodRes] = await Promise.all([
        api(`/discounts?page=${p}&limit=10`),
        api('/products?limit=100')
      ]);
      setDiscounts(discRes.items || []);
      setTotal(discRes.total || 0);
      setPage(discRes.page || 1);
      setProducts(prodRes.items || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load discounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getDiscountState = (d) => {
    const today = new Date().toISOString().slice(0, 10);
    if (d.usage_limit && Number(d.times_used) >= Number(d.usage_limit)) {
      return { label: 'Used up', cls: 'closed' };
    }
    if (d.end_date < today) {
      return { label: 'Expired', cls: 'overdue' };
    }
    if (d.start_date > today) {
      return { label: 'Scheduled', cls: 'paused' };
    }
    return { label: 'Active', cls: 'active' };
  };

  const openCreateModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditingDiscount(null);
    setFormData({
      name: '',
      type: 'percentage',
      value: '',
      scope: 'subscription',
      product_id: '',
      min_purchase: '0',
      min_quantity: '0',
      start_date: today,
      end_date: today,
      usage_limit: ''
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (d) => {
    setEditingDiscount(d);
    setFormData({
      name: d.name,
      type: d.type,
      value: d.value,
      scope: d.scope,
      product_id: d.product_id ? String(d.product_id) : '',
      min_purchase: String(d.min_purchase || 0),
      min_quantity: String(d.min_quantity || 0),
      start_date: d.start_date || '',
      end_date: d.end_date || '',
      usage_limit: d.usage_limit ? String(d.usage_limit) : ''
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveDiscount = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formData.name.trim()) return setFormError('Discount name is required');
    if (!formData.value || Number(formData.value) <= 0) return setFormError('Valid discount value is required');
    if (formData.type === 'percentage' && Number(formData.value) > 100) return setFormError('Percentage cannot exceed 100%');
    if (formData.scope === 'product' && !formData.product_id) return setFormError('Product is required for product scope');
    if (formData.end_date < formData.start_date) return setFormError('End date must be on or after start date');

    setSaving(true);
    try {
      const payload = {
        ...formData,
        product_id: formData.scope === 'product' ? Number(formData.product_id) : null,
        usage_limit: formData.usage_limit ? Number(formData.usage_limit) : null
      };
      if (editingDiscount) {
        await api(`/discounts/${editingDiscount.id}`, { method: 'PUT', body: payload });
        toast.success('Discount updated');
      } else {
        await api('/discounts', { method: 'POST', body: payload });
        toast.success('Discount created');
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to save discount');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDiscount = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/discounts/${deleteId}`, { method: 'DELETE' });
      toast.success('Discount removed');
      setDeleteId(null);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete discount');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { header: 'ID', key: 'id', width: '60px' },
    {
      header: 'Name',
      render: (r) => (
        <div>
          <b>{r.name}</b>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Scope: {r.scope === 'product' ? `Product (#${r.product_id})` : 'Subscription'}
          </div>
        </div>
      )
    },
    {
      header: 'Type & Value',
      render: (r) => (
        <b>{r.type === 'percentage' ? `${r.value}% Off` : `${fmtMoney(r.value)} Flat Off`}</b>
      )
    },
    {
      header: 'State',
      render: (r) => {
        const state = getDiscountState(r);
        return <span className={`badge ${state.cls}`}>{state.label}</span>;
      }
    },
    {
      header: 'Usage',
      render: (r) => (
        <span>
          used <b>{r.times_used}</b> / {r.usage_limit ? <b>{r.usage_limit}</b> : '∞'}
        </span>
      )
    },
    {
      header: 'Validity Window',
      render: (r) => (
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          {r.start_date} → {r.end_date}
        </span>
      )
    },
    ...(isAdmin ? [{
      header: 'Actions',
      align: 'right',
      width: '140px',
      render: (r) => (
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          <button type="button" className="ghost sm" onClick={() => openEditModal(r)}>Edit</button>
          <button type="button" className="danger sm" onClick={() => setDeleteId(r.id)}>Delete</button>
        </div>
      )
    }] : [])
  ];

  const toolbar = (
    <>
      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
        Total Discounts: {total}
      </span>
      {isAdmin && (
        <button type="button" className="primary sm" onClick={openCreateModal}>
          + New Discount
        </button>
      )}
    </>
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>Discounts & Promotions</h1>
        <p className="sub" style={{ margin: 0 }}>Configure percentage or flat deductions, thresholds, validity dates, and usage limits.</p>
      </div>

      <DataTable
        columns={columns}
        data={discounts}
        loading={loading}
        page={page}
        total={total}
        limit={10}
        onPageChange={(p) => loadData(p)}
        toolbar={toolbar}
      />

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDiscount ? 'Edit Discount' : 'Create Discount'}
      >
        <form onSubmit={handleSaveDiscount}>
          <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
            {formError && <p className="error">{formError}</p>}
            <label>
              Discount Name *
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label>
                Type *
                <select
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                </select>
              </label>
              <label>
                Value *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={formData.value}
                  onChange={e => setFormData({ ...formData, value: e.target.value })}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label>
                Scope *
                <select
                  value={formData.scope}
                  onChange={e => setFormData({ ...formData, scope: e.target.value })}
                >
                  <option value="subscription">Whole Subscription</option>
                  <option value="product">Specific Product</option>
                </select>
              </label>
              {formData.scope === 'product' ? (
                <label>
                  Target Product *
                  <select
                    required
                    value={formData.product_id}
                    onChange={e => setFormData({ ...formData, product_id: e.target.value })}
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Min Purchase Amount (₹)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.min_purchase}
                    onChange={e => setFormData({ ...formData, min_purchase: e.target.value })}
                  />
                </label>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <label>
                Start Date *
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                />
              </label>
              <label>
                End Date *
                <input
                  type="date"
                  required
                  value={formData.end_date}
                  onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                />
              </label>
              <label>
                Usage Limit
                <input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={formData.usage_limit}
                  onChange={e => setFormData({ ...formData, usage_limit: e.target.value })}
                />
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="ghost" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving...' : (editingDiscount ? 'Save Changes' : 'Create Discount')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteDiscount}
        title="Delete Discount"
        message="Are you sure you want to delete this promotional discount?"
        confirmText="Delete"
        isDangerous
        loading={deleting}
      />
    </div>
  );
}
