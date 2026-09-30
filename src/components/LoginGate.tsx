import { useState, type FormEvent, type ReactNode } from 'react';
import { APP_NAME } from '../lib/brand';
import { BrandMark } from './BrandMark';

// Small synchronous SHA-256 fallback for plain HTTP LAN previews, where
// Web Crypto is intentionally unavailable. This keeps only the hash in the
// bundle rather than publishing the demo password itself.
function sha256Hex(input: string): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bytes = Array.from(new TextEncoder().encode(input));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length + 8) % 64) bytes.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) bytes.push((bitLength / 2 ** shift) & 0xff);
  let state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const schedule = new Array<number>(64).fill(0);
    for (let i = 0; i < 16; i++) schedule[i] = (bytes[offset + i * 4] * 0x1000000) + (bytes[offset + i * 4 + 1] << 16) + (bytes[offset + i * 4 + 2] << 8) + bytes[offset + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const x = schedule[i - 15], y = schedule[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + constants[i] + schedule[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) >>> 0, c, b, a, (temp1 + temp2) >>> 0];
    }
    state = state.map((value, i) => (value + [a, b, c, d, e, f, g, h][i]) >>> 0);
  }
  return state.map(value => value.toString(16).padStart(8, '0')).join('');
}

// Browser-only convenience gate. This is not server authentication: the
// credential and application code are inspectable by anyone with the bundle.
export default function LoginGate({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function login(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    let passwordMatches = false;

    // `crypto.subtle` is unavailable when the Vite dev server is opened over
    // a plain LAN HTTP address. Keep the local demo gate usable there while
    // retaining the hashed comparison in secure contexts.
    if (globalThis.crypto?.subtle) {
      try {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
        const passwordHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        passwordMatches = passwordHash === '00273f25d2aac4550758f4f8313673aeee1e11a4e776b746cb0950497200f4df';
      } catch {
        passwordMatches = sha256Hex(password) === '00273f25d2aac4550758f4f8313673aeee1e11a4e776b746cb0950497200f4df';
      }
    } else {
      passwordMatches = sha256Hex(password) === '00273f25d2aac4550758f4f8313673aeee1e11a4e776b746cb0950497200f4df';
    }

    if (normalizedEmail === 'admin@noorahzaid.com' && passwordMatches) {
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
