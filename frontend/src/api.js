const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Every screen talks to the backend through this one function.
export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.clear();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

// Fetch invoice HTML with Bearer token and open via Blob URL in a new window
export async function printInvoice(invoiceId) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}/invoices/${invoiceId}/print`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = '/login';
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Failed to print invoice');
  }

  const html = await res.text();
  const blob = new Blob([html], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, '_blank');
}

export function fmtMoney(val) {
  const n = Number(val || 0);
  return `₹${n.toFixed(2)}`;
}
