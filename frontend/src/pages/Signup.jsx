import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { useAuth } from '../auth';

// Same rules as the backend: more than 8 characters, upper, lower, special.
const rules = [
  ['More than 8 characters', p => p.length > 8],
  ['An uppercase letter', p => /[A-Z]/.test(p)],
  ['A lowercase letter', p => /[a-z]/.test(p)],
  ['A special character', p => /[^A-Za-z0-9]/.test(p)],
];

export default function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const allOk = rules.every(([, test]) => test(password));

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await signup(name, email, password); nav('/'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell title="Create your account" subtitle="One account for all your subscriptions."
      footer={<>Already have an account? <Link to="/login">Log in</Link></>}>
      <form onSubmit={submit}>
        <label>Full name<input value={name} onChange={e => setName(e.target.value)} required autoFocus /></label>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <ul className="rules">
          {rules.map(([label, test]) => <li key={label} className={test(password) ? 'ok' : ''}>{label}</li>)}
        </ul>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy || !allOk}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthShell>
  );
}
