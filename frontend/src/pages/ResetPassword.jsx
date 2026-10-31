import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { api } from '../api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try { await api('/auth/reset-password', { method: 'POST', body: { token: params.get('token'), password } }); setDone(true); }
    catch (err) { setError(err.message); }
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use more than 8 characters, with upper and lower case letters and a special character.">
      {done ? <p className="success" role="status">Password updated. <Link to="/login">Log in</Link></p> : (
        <form onSubmit={submit}>
          <label>New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button>Save new password</button>
        </form>
      )}
    </AuthShell>
  );
}
