import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await login(email, password); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell title="Log in" subtitle="Manage your subscriptions and invoices."
      footer={<>New to Brightloop? <Link to="/signup">Create an account</Link></>}>
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <Link className="small" to="/forgot-password">Forgot your password?</Link>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </AuthShell>
  );
}
