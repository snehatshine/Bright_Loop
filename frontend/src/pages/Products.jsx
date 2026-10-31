import { useState, useEffect } from 'react';
import { api, fmtMoney } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Products() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({ name: '', type: 'Software', sales_price: '', cost_price: '', notes: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Variant modal state
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variantForm, setVariantForm] = useState({ attribute: 'brand', value: '', extra_price: '0' });
  const [variantSaving, setVariantSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadProducts = async (p = page, q = search) => {
    setLoading(true);
    try {
      const res = await api(`/products?page=${p}&limit=10&q=${encodeURIComponent(q)}`);
      setProducts(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch (err) {
      toast.error(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadProducts(1, search);
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({ name: '', type: 'Software', sales_price: '', cost_price: '0', notes: '' });
    setFormError('');
    setIsEditModalOpen(true);
  };

  const openEditModal = (prod) => {
    setEditingProduct(prod);
    setFormData({
      name: prod.name,
      type: prod.type,
      sales_price: prod.sales_price,
      cost_price: prod.cost_price || '0',
      notes: prod.notes || ''
    });
    setFormError('');
    setIsEditModalOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formData.name.trim()) return setFormError('Product name is required');
    if (!formData.sales_price || Number(formData.sales_price) < 0) return setFormError('Valid sales price is required');

    setSaving(true);
    try {
      if (editingProduct) {
        await api(`/products/${editingProduct.id}`, { method: 'PUT', body: formData });
        toast.success('Product updated successfully');
      } else {
        await api('/products', { method: 'POST', body: formData });
        toast.success('Product created successfully');
      }
      setIsEditModalOpen(false);
      loadProducts();
    } catch (err) {
      setFormError(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api(`/products/${deleteId}`, { method: 'DELETE' });
      toast.success('Product removed');
      setDeleteId(null);
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to delete product');
    } finally {
      setDeleting(false);
    }
  };

  const openVariantModal = (prod) => {
    setSelectedProduct(prod);
    setVariantForm({ attribute: 'brand', value: '', extra_price: '0' });
    setIsVariantModalOpen(true);
  };

  const handleAddVariant = async (e) => {
    e.preventDefault();
    if (!variantForm.value.trim()) return;
    setVariantSaving(true);
    try {
      await api(`/products/${selectedProduct.id}/variants`, { method: 'POST', body: variantForm });
      toast.success('Variant added');
      // Refresh current product variants
      const updated = await api(`/products/${selectedProduct.id}`);
      setSelectedProduct(updated);
      setVariantForm({ attribute: 'brand', value: '', extra_price: '0' });
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to add variant');
    } finally {
      setVariantSaving(false);
    }
  };

  const handleDeleteVariant = async (variantId) => {
    try {
      await api(`/products/${selectedProduct.id}/variants/${variantId}`, { method: 'DELETE' });
      toast.success('Variant removed');
      const updated = await api(`/products/${selectedProduct.id}`);
      setSelectedProduct(updated);
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to remove variant');
    }
  };

  const columns = [
    { header: 'ID', key: 'id', width: '60px' },
    {
      header: 'Name',
      render: (r) => (
        <div>
          <b>{r.name}</b>
          {r.notes && <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{r.notes}</div>}
        </div>
      )
    },
    { header: 'Type', key: 'type', width: '120px' },
    {
      header: 'Sales Price',
      align: 'right',
      render: (r) => <b>{fmtMoney(r.sales_price)}</b>
    },
    {
      header: 'Variants',
      render: (r) => {
        const vars = r.variants || [];
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
            {vars.map(v => (
              <span key={v.id} style={{ fontSize: '0.78rem', background: '#eaf3ef', color: '#165743', padding: '0.15rem 0.4rem', borderRadius: 4, fontWeight: 600 }}>
                {v.attribute}: {v.value} (+{fmtMoney(v.extra_price)})
              </span>
            ))}
            {isAdmin && (
              <button type="button" className="ghost sm" onClick={() => openVariantModal(r)} style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}>
                + Manage ({vars.length})
              </button>
            )}
          </div>
        );
      }
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
      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1, maxWidth: '400px' }}>
        <input
          type="search"
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.45rem 0.75rem' }}
        />
        <button type="submit" className="ghost sm">Search</button>
      </form>

      {isAdmin && (
        <button type="button" className="primary sm" onClick={openCreateModal}>
          + New Product
        </button>
      )}
    </>
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>Products & Variants</h1>
        <p className="sub" style={{ margin: 0 }}>Manage sellable software products, services, and attribute variants.</p>
      </div>

      <DataTable
        columns={columns}
        data={products}
        loading={loading}
        page={page}
        total={total}
        limit={10}
        onPageChange={(p) => loadProducts(p)}
        toolbar={toolbar}
      />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={editingProduct ? 'Edit Product' : 'Add New Product'}
      >
        <form onSubmit={handleSaveProduct}>
          <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
            {formError && <p className="error">{formError}</p>}
            <label>
              Product Name *
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
                  <option value="Software">Software</option>
                  <option value="Service">Service</option>
                  <option value="Addon">Addon</option>
                  <option value="Hardware">Hardware</option>
                </select>
              </label>
              <label>
                Sales Price (₹) *
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.sales_price}
                  onChange={e => setFormData({ ...formData, sales_price: e.target.value })}
                />
              </label>
            </div>
            <label>
              Cost Price (₹)
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.cost_price}
                onChange={e => setFormData({ ...formData, cost_price: e.target.value })}
              />
            </label>
            <label>
              Notes
              <textarea
                rows="2"
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
              />
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="ghost" onClick={() => setIsEditModalOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving...' : (editingProduct ? 'Save Changes' : 'Create Product')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Variants Management Modal */}
      <Modal
        isOpen={isVariantModalOpen}
        onClose={() => setIsVariantModalOpen(false)}
        title={`Variants: ${selectedProduct?.name}`}
      >
        <div className="modal-body" style={{ display: 'grid', gap: '1.25rem' }}>
          <div>
            <h4 style={{ margin: '0 0 0.5rem' }}>Existing Variants</h4>
            {(selectedProduct?.variants || []).length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: 0 }}>No variants defined yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {selectedProduct.variants.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: '#fafcfb', border: '1px solid var(--line)', borderRadius: 6 }}>
                    <span>
                      <b>{v.attribute}:</b> {v.value} (+{fmtMoney(v.extra_price)})
                    </span>
                    <button type="button" className="danger sm" onClick={() => handleDeleteVariant(v.id)} style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleAddVariant} style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem' }}>Add New Variant</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem' }}>
                Attribute
                <input
                  type="text"
                  required
                  placeholder="e.g. brand"
                  value={variantForm.attribute}
                  onChange={e => setVariantForm({ ...variantForm, attribute: e.target.value })}
                />
              </label>
              <label style={{ fontSize: '0.85rem' }}>
                Value
                <input
                  type="text"
                  required
                  placeholder="e.g. Odoo"
                  value={variantForm.value}
                  onChange={e => setVariantForm({ ...variantForm, value: e.target.value })}
                />
              </label>
              <label style={{ fontSize: '0.85rem' }}>
                Extra Price (₹)
                <input
                  type="number"
                  step="0.01"
                  required
                  value={variantForm.extra_price}
                  onChange={e => setVariantForm({ ...variantForm, extra_price: e.target.value })}
                />
              </label>
            </div>
            <button type="submit" className="primary sm" disabled={variantSaving} style={{ marginTop: '0.5rem', justifySelf: 'start' }}>
              {variantSaving ? 'Adding...' : '+ Add Variant'}
            </button>
          </form>
        </div>
        <div className="modal-footer">
          <button type="button" className="ghost" onClick={() => setIsVariantModalOpen(false)}>
            Close
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteProduct}
        title="Remove Product"
        message="Are you sure you want to deactivate this product? Existing subscription lines will remain intact."
        confirmText="Remove"
        isDangerous
        loading={deleting}
      />
    </div>
  );
}
