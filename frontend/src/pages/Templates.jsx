import { useState, useEffect } from 'react';
import { api, fmtMoney } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Templates() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Create Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', plan_id: '', validity_days: '30' });
  const [lines, setLines] = useState([{ product_id: '', variant_id: '', quantity: 1 }]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // View Modal
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Delete
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = async (p = page) => {
    setLoading(true);
    try {
      const [tmplRes, planRes, prodRes] = await Promise.all([
        api(`/templates?page=${p}&limit=10`),
        api('/plans?limit=100'),
        api('/products?limit=100')
      ]);
      setTemplates(tmplRes.items || []);
      setTotal(tmplRes.total || 0);
      setPage(tmplRes.page || 1);
      setPlans(planRes.items || []);
      setProducts(prodRes.items || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setFormData({ name: '', plan_id: plans[0]?.id || '', validity_days: '30' });
    setLines([{ product_id: products[0]?.id || '', variant_id: '', quantity: 1 }]);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleAddLine = () => {
    setLines([...lines, { product_id: products[0]?.id || '', variant_id: '', quantity: 1 }]);
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

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formData.name.trim()) return setFormError('Template name is required');
    if (!formData.plan_id) return setFormError('Plan is required');

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        plan_id: Number(formData.plan_id),
        validity_days: Number(formData.validity_days),
        lines: lines.map(l => ({
          product_id: Number(l.product_id),
          variant_id: l.variant_id ? Number(l.variant_id) : null,
          quantity: Number(l.quantity || 1)
        }))
      };
      await api('/templates', { method: 'POST', body: payload });
      toast.success('Template created successfully');
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleViewTemplate = async (tmpl) => {
    try {
      const full = await api(`/templates/${tmpl.id}`);
      setSelectedTemplate(full);
    } catch (err) {
      toast.error(err.message || 'Failed to fetch template lines');
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/templates/${deleteId}`, { method: 'DELETE' });
      toast.success('Template removed');
      setDeleteId(null);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete template');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { header: 'ID', key: 'id', width: '60px' },
    {
      header: 'Template Name',
      render: (r) => (
        <button
          type="button"
          onClick={() => handleViewTemplate(r)}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--ink)', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
        >
          {r.name}
        </button>
      )
    },
    { header: 'Associated Plan', key: 'plan_name' },
    {
      header: 'Validity',
      render: (r) => <span>{r.validity_days} days</span>
    },
    {
      header: 'Actions',
      align: 'right',
      width: '140px',
      render: (r) => (
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          <button type="button" className="ghost sm" onClick={() => handleViewTemplate(r)}>View</button>
          {isAdmin && (
            <button type="button" className="danger sm" onClick={() => setDeleteId(r.id)}>Delete</button>
          )}
        </div>
      )
    }
  ];

  const toolbar = (
    <>
      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
        Total Quotation Templates: {total}
      </span>
      <button type="button" className="primary sm" onClick={openCreateModal}>
        + New Template
      </button>
    </>
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>Quotation Templates</h1>
        <p className="sub" style={{ margin: 0 }}>Define reusable line bundles and preset quotation durations.</p>
      </div>

      <DataTable
        columns={columns}
        data={templates}
        loading={loading}
        page={page}
        total={total}
        limit={10}
        onPageChange={(p) => loadData(p)}
        toolbar={toolbar}
      />

      {/* Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Quotation Template"
        maxWidth="680px"
      >
        <form onSubmit={handleSaveTemplate}>
          <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
            {formError && <p className="error">{formError}</p>}
            <label>
              Template Name *
              <input
                type="text"
                required
                placeholder="e.g. Enterprise Cloud Package"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
              <label>
                Plan *
                <select
                  required
                  value={formData.plan_id}
                  onChange={e => setFormData({ ...formData, plan_id: e.target.value })}
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.period} - {fmtMoney(p.price)})</option>
                  ))}
                </select>
              </label>
              <label>
                Validity (Days) *
                <input
                  type="number"
                  min="1"
                  required
                  value={formData.validity_days}
                  onChange={e => setFormData({ ...formData, validity_days: e.target.value })}
                />
              </label>
            </div>

            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>Template Lines</span>
                <button type="button" className="ghost sm" onClick={handleAddLine}>+ Add Line</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {lines.map((l, idx) => {
                  const prod = products.find(p => String(p.id) === String(l.product_id));
                  const variants = prod?.variants || [];
                  return (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: '0.5rem', alignItems: 'center', background: '#fafcfb', padding: '0.5rem', border: '1px solid var(--line)', borderRadius: 6 }}>
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
                        value={l.quantity}
                        onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                      />

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
              {saving ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Template Modal */}
      <Modal
        isOpen={Boolean(selectedTemplate)}
        onClose={() => setSelectedTemplate(null)}
        title={`Template: ${selectedTemplate?.name}`}
      >
        <div className="modal-body">
          <p><b>Plan:</b> {selectedTemplate?.plan_name}</p>
          <p><b>Validity:</b> {selectedTemplate?.validity_days} days</p>
          <h4>Included Products & Lines:</h4>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {(selectedTemplate?.lines || []).map((l, idx) => (
                <tr key={idx}>
                  <td><b>{l.product_name}</b></td>
                  <td>{l.variant_value || 'None'}</td>
                  <td>{l.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button type="button" className="ghost" onClick={() => setSelectedTemplate(null)}>
            Close
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteTemplate}
        title="Delete Quotation Template"
        message="Are you sure you want to delete this template?"
        confirmText="Delete"
        isDangerous
        loading={deleting}
      />
    </div>
  );
}
