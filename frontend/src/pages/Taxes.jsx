import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Taxes() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [taxes, setTaxes] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTax, setEditingTax] = useState(null);
  const [formData, setFormData] = useState({ name: '', rate_percent: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadTaxes = async () => {
    setLoading(true);
    try {
      const res = await api('/taxes');
      setTaxes(res.items || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load taxes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTaxes();
  }, []);

  const openCreateModal = () => {
    setEditingTax(null);
    setFormData({ name: '', rate_percent: '' });
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (t) => {
    setEditingTax(t);
    setFormData({ name: t.name, rate_percent: t.rate_percent });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveTax = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formData.name.trim()) return setFormError('Tax name is required');
    if (formData.rate_percent === '' || Number(formData.rate_percent) < 0 || Number(formData.rate_percent) > 100) {
      return setFormError('Tax rate must be between 0 and 100%');
    }

    setSaving(true);
    try {
      if (editingTax) {
        await api(`/taxes/${editingTax.id}`, { method: 'PUT', body: formData });
        toast.success('Tax updated');
      } else {
        await api('/taxes', { method: 'POST', body: formData });
        toast.success('Tax created');
      }
      setIsModalOpen(false);
      loadTaxes();
    } catch (err) {
      setFormError(err.message || 'Failed to save tax');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTax = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/taxes/${deleteId}`, { method: 'DELETE' });
      toast.success('Tax deactivated');
      setDeleteId(null);
      loadTaxes();
    } catch (err) {
      toast.error(err.message || 'Failed to delete tax');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { header: 'ID', key: 'id', width: '60px' },
    {
      header: 'Tax Name',
      render: (r) => <b>{r.name}</b>
    },
    {
      header: 'Rate (%)',
      render: (r) => <b>{Number(r.rate_percent).toFixed(2)}%</b>
    },
    {
      header: 'Status',
      render: (r) => (
        <span className={`badge ${r.active ? 'active' : 'closed'}`}>
          {r.active ? 'Active' : 'Inactive'}
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
        Active Tax Rules: {taxes.length}
      </span>
      {isAdmin && (
        <button type="button" className="primary sm" onClick={openCreateModal}>
          + New Tax
        </button>
      )}
    </>
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>Tax Rates & Rules</h1>
        <p className="sub" style={{ margin: 0 }}>Configure sales taxes, GST percentages, and line tax calculations.</p>
      </div>

      <DataTable
        columns={columns}
        data={taxes}
        loading={loading}
        toolbar={toolbar}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTax ? 'Edit Tax' : 'Add Tax Rule'}
      >
        <form onSubmit={handleSaveTax}>
          <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
            {formError && <p className="error">{formError}</p>}
            <label>
              Tax Name *
              <input
                type="text"
                required
                placeholder="e.g. GST 18%"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </label>
            <label>
              Rate Percent (%) *
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                placeholder="18"
                value={formData.rate_percent}
                onChange={e => setFormData({ ...formData, rate_percent: e.target.value })}
              />
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="ghost" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving...' : (editingTax ? 'Save Changes' : 'Create Tax')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteTax}
        title="Deactivate Tax"
        message="Are you sure you want to deactivate this tax rule? Historic invoices will preserve their tax rates."
        confirmText="Deactivate"
        isDangerous
        loading={deleting}
      />
    </div>
  );
}
