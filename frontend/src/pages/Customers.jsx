import { useState, useEffect } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import DataTable from '../components/DataTable';

export default function Customers() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const loadCustomers = async (p = page, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ role: 'customer', page: p, limit: 15 });
      if (q) params.set('q', q);
      const res = await api(`/users?${params.toString()}`);
      setCustomers(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch (err) {
      toast.error(err.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadCustomers(1, search);
  };

  const columns = [
    { header: 'ID', key: 'id', width: '70px' },
    {
      header: 'Customer Name',
      render: (r) => <b>{r.name}</b>
    },
    { header: 'Email Address', key: 'email' },
    {
      header: 'Joined On',
      render: (r) => <span>{new Date(r.created_at).toLocaleDateString()}</span>
    }
  ];

  const toolbar = (
    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', flex: 1, maxWidth: '400px' }}>
      <input
        type="search"
        placeholder="Search customers by name or email..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '0.45rem 0.75rem' }}
      />
      <button type="submit" className="ghost sm">Search</button>
    </form>
  );

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h1>Customers Directory</h1>
        <p className="sub" style={{ margin: 0 }}>Registered customer accounts and self-service portal users.</p>
      </div>

      <DataTable
        columns={columns}
        data={customers}
        loading={loading}
        page={page}
        total={total}
        limit={15}
        onPageChange={(p) => loadCustomers(p)}
        toolbar={toolbar}
      />
    </div>
  );
}
