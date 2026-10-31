import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { api } from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try { setMessage((await api('/auth/forgot-password', { method: 'POST', body: { email } })).message); }
    catch (err) { setError(err.message); }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email a reset link to your registered address."
      footer={<Link to="/login">Back to log in</Link>}>
      {message ? <p className="success" role="status">{message}</p> : (
        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button>Send reset link</button>
        </form>
      )}
    </AuthShell>
  );
}
