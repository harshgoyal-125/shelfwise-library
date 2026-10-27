import React, { useState } from 'react';
import { api, setToken } from '../api.js';

const DEMO = [
  ['Admin', 'admin@shelfwise.demo'],
  ['Librarian', 'librarian@shelfwise.demo'],
  ['Faculty', 'faculty@shelfwise.demo'],
  ['Student', 'student@shelfwise.demo'],
];

export default function Login({ onLogin, theme, onTheme }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: f });
      setToken(r.token);
      onLogin(r.user);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <button type="button" className="btn small ghost theme-fab" onClick={onTheme} aria-label="Toggle dark mode">{theme === 'dark' ? '☀️' : '🌙'}</button>
      <form className="card login" onSubmit={submit}>
        <div className="login-brand"><span className="logo big">📚</span><h1>ShelfWise</h1><p className="muted">Library management system</p></div>
        {mode === 'register' && (
          <label>Full name<input value={f.name} onChange={set('name')} autoComplete="name" required /></label>
        )}
        <label>Email<input type="email" value={f.email} onChange={set('email')} autoComplete="username" required /></label>
        <label>Password<input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required /></label>
        {err && <div className="error" role="alert">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create student account'}</button>
        <p className="muted center-text">
          {mode === 'login' ? <>New here? <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); setErr(''); }}>Register</a></> : <>Have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setErr(''); }}>Log in</a></>}
        </p>
        {mode === 'login' && (
          <div className="demo">
            <div className="muted small-text">Demo accounts (tap to fill email)</div>
            <div className="chips">
              {DEMO.map(([l, e]) => <button type="button" key={e} className="chip" onClick={() => setF({ ...f, email: e })}>{l}</button>)}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
