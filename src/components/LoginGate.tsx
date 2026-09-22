import { useState, type FormEvent, type ReactNode } from 'react';
import { APP_NAME } from '../lib/brand';
import { BrandMark } from './BrandMark';

// Browser-only convenience gate. This is not server authentication: the
// credential and application code are inspectable by anyone with the bundle.
export default function LoginGate({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function login(event: FormEvent) {
    event.preventDefault();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    const passwordHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (email.trim().toLowerCase() === 'admin@noorahzaid.com' && passwordHash === '00273f25d2aac4550758f4f8313673aeee1e11a4e776b746cb0950497200f4df') {
      setSignedIn(true);
      setPassword('');
      setError('');
    } else {
      setError('Incorrect email or password. Please try again.');
    }
  }

  if (signedIn) return <>
    <button className="logout-button button button--secondary" onClick={() => {
      if (window.confirm('Log out? Unsaved invoice entries will be cleared.')) setSignedIn(false);
    }}>Log out</button>
    {children}
  </>;

  return <div className="login-page">
    <form className="login-card" onSubmit={login}>
      <BrandMark large />
      <h1>{APP_NAME}</h1>
      <p>Sign in to your invoice workspace</p>
      <label htmlFor="login-email">Email</label>
      <input id="login-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required autoFocus />
      <label htmlFor="login-password">Password</label>
      <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required aria-describedby={error ? 'login-error' : undefined} />
      {error && <p id="login-error" role="alert" className="field__error">{error}</p>}
      <button className="button button--primary" type="submit">Sign in</button>
    </form>
  </div>;
}
