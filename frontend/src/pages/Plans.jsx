import { useState, useEffect } from 'react';
import { api, fmtMoney } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Plans() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    period: 'monthly',
    min_quantity: '1',
    available_from: '',
    available_to: '',
    auto_close: false,
    closable: true,
    pausable: true,
    renewable: true
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadPlans = async (p = page) => {
    setLoading(true);
    try {
      const res = await api(`/plans?page=${p}&limit=10`);
      setPlans(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch (err) {
      toast.error(err.message || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormData({
      name: '',
      price: '',
      period: 'monthly',
      min_quantity: '1',
      available_from: '',
      available_to: '',
      auto_close: false,
      closable: true,
      pausable: true,
      renewable: true
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (plan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      price: plan.price,
      period: plan.period,
      min_quantity: String(plan.min_quantity || 1),
      available_from: plan.available_from || '',
      available_to: plan.available_to || '',
      auto_close: Boolean(plan.auto_close),
      closable: Boolean(plan.closable),
      pausable: Boolean(plan.pausable),
      renewable: Boolean(plan.renewable)
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formData.name.trim()) return setFormError('Plan name is required');
    if (!formData.price || Number(formData.price) < 0) return setFormError('Valid price is required');

    setSaving(true);
    try {
      if (editingPlan) {
        await api(`/plans/${editingPlan.id}`, { method: 'PUT', body: formData });
        toast.success('Plan updated');
      } else {
        await api('/plans', { method: 'POST', body: formData });
        toast.success('Plan created');
      }
      setIsModalOpen(false);
      loadPlans();
    } catch (err) {
      setFormError(err.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/plans/${deleteId}`, { method: 'DELETE' });
      toast.success('Plan removed');
      setDeleteId(null);
      loadPlans();
    } catch (err) {
      toast.error(err.message || 'Failed to delete plan');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { header: 'ID', key: 'id', width: '60px' },
    {
      header: 'Plan Name',
      render: (r) => (
        <div>
          <b>{r.name}</b>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Min Qty: {r.min_quantity}
          </div>
        </div>
      )
    },
    {
      header: 'Price / Cycle',
      render: (r) => (
        <span>
          <b>{fmtMoney(r.price)}</b> <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>/ {r.period}</span>
        </span>
      )
    },
    {
      header: 'Flags & Rules',
      render: (r) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
          {r.pausable && <span className="badge paused" style={{ fontSize: '0.72rem' }}>Pausable</span>}
          {r.renewable && <span className="badge active" style={{ fontSize: '0.72rem' }}>Renewable</span>}
          {r.closable && <span className="badge draft" style={{ fontSize: '0.72rem' }}>Closable</span>}
          {r.auto_close && <span className="badge overdue" style={{ fontSize: '0.72rem' }}>Auto-Close</span>}
        </div>
      )
    },
    {
      header: 'Availability',
      render: (r) => (
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          {r.available_from || 'Always'} → {r.available_to || 'Open'}
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
        Total Plans: {total}
      </span>
      {isAdmin && (
        <button type="button" className="primary sm" onClick={openCreateModal}>
          + New Plan
        </button>
      )}
    </>
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>Billing Plans</h1>
        <p className="sub" style={{ margin: 0 }}>Configure recurring schedules, cycle periods, and lifecycle governance flags.</p>
      </div>

      <DataTable
        columns={columns}
        data={plans}
        loading={loading}
        page={page}
        total={total}
        limit={10}
        onPageChange={(p) => loadPlans(p)}
        toolbar={toolbar}
      />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPlan ? 'Edit Plan' : 'Create Billing Plan'}
      >
        <form onSubmit={handleSavePlan}>
          <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
            {formError && <p className="error">{formError}</p>}
            <label>
              Plan Name *
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label>
                Price (₹) *
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.price}
                  onChange={e => setFormData({ ...formData, price: e.target.value })}
                />
              </label>
              <label>
                Billing Period *
                <select
                  value={formData.period}
                  onChange={e => setFormData({ ...formData, period: e.target.value })}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <label>
                Min Quantity
                <input
                  type="number"
                  min="1"
                  required
                  value={formData.min_quantity}
                  onChange={e => setFormData({ ...formData, min_quantity: e.target.value })}
                />
              </label>
              <label>
                Available From
                <input
                  type="date"
                  value={formData.available_from}
                  onChange={e => setFormData({ ...formData, available_from: e.target.value })}
                />
              </label>
              <label>
                Available To
                <input
                  type="date"
                  value={formData.available_to}
                  onChange={e => setFormData({ ...formData, available_to: e.target.value })}
                />
              </label>
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>Lifecycle Governance Flags</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={formData.pausable}
                    onChange={e => setFormData({ ...formData, pausable: e.target.checked })}
                  />
                  Allow Pause / Resume
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={formData.renewable}
                    onChange={e => setFormData({ ...formData, renewable: e.target.checked })}
                  />
                  Allow Renewal
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={formData.closable}
                    onChange={e => setFormData({ ...formData, closable: e.target.checked })}
                  />
                  Allow Manual Close
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={formData.auto_close}
                    onChange={e => setFormData({ ...formData, auto_close: e.target.checked })}
                  />
                  Auto-Close at Expiry
                </label>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="ghost" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving...' : (editingPlan ? 'Save Changes' : 'Create Plan')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeletePlan}
        title="Remove Plan"
        message="Are you sure you want to delete this plan? If existing subscriptions use this plan, deletion will be blocked."
        confirmText="Delete Plan"
        isDangerous
        loading={deleting}
      />
    </div>
  );
}
