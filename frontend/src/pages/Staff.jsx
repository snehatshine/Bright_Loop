import { useState, useEffect } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';

export default function Staff() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Add Staff Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Live password checks
  const checks = {
    len: password.length > 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    special: /[^A-Za-z0-9]/.test(password)
  };
  const isPasswordValid = checks.len && checks.upper && checks.lower && checks.special;

  const loadStaff = async (p = page) => {
    setLoading(true);
    try {
      const res = await api(`/users?role=staff&page=${p}&limit=10`);
      setStaffList(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch (err) {
      toast.error(err.message || 'Failed to load staff members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const openCreateModal = () => {
    setName('');
    setEmail('');
    setPassword('');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim() || !email.trim()) return setFormError('Name and email are required');
    if (!isPasswordValid) return setFormError('Password does not meet the security requirements');

    setSaving(true);
    try {
      await api('/users/staff', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim(), password }
      });
      toast.success(`Staff member ${name} added successfully`);
      setIsModalOpen(false);
      loadStaff();
    } catch (err) {
      setFormError(err.message || 'Failed to create staff member');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: 'ID', key: 'id', width: '70px' },
    {
      header: 'Staff Name',
      render: (r) => <b>{r.name}</b>
    },
    { header: 'Email Address', key: 'email' },
    {
      header: 'Role',
      render: (r) => <span className="user-role-pill">{r.role}</span>
    },
    {
      header: 'Added On',
      render: (r) => <span>{new Date(r.created_at).toLocaleDateString()}</span>
    }
  ];

  const toolbar = (
    <>
      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
        Staff Count: {total}
      </span>
      <button type="button" className="primary sm" onClick={openCreateModal}>
        + Add Staff Member
      </button>
    </>
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>Staff Management</h1>
        <p className="sub" style={{ margin: 0 }}>Create and manage internal operational staff accounts (Admin Only).</p>
      </div>

      <DataTable
        columns={columns}
        data={staffList}
        loading={loading}
        page={page}
        total={total}
        limit={10}
        onPageChange={(p) => loadStaff(p)}
        toolbar={toolbar}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Staff Member"
        maxWidth="460px"
      >
        <form onSubmit={handleCreateStaff}>
          <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
            {formError && <p className="error">{formError}</p>}
            <label>
              Full Name *
              <input
                type="text"
                required
                placeholder="Jane Staff"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </label>
            <label>
              Email Address *
              <input
                type="email"
                required
                placeholder="staff@brightloop.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>
            <label>
              Temporary Password *
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </label>

            <ul className="rules" aria-label="Password requirements">
              <li className={checks.len ? 'ok' : ''}>More than 8 characters</li>
              <li className={checks.upper ? 'ok' : ''}>At least one uppercase letter</li>
              <li className={checks.lower ? 'ok' : ''}>At least one lowercase letter</li>
              <li className={checks.special ? 'ok' : ''}>At least one special character</li>
            </ul>
          </div>
          <div className="modal-footer">
            <button type="button" className="ghost" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving || !isPasswordValid}>
              {saving ? 'Adding...' : 'Add Staff'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
