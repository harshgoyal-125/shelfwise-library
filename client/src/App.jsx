import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { api, getToken, setToken, isStaff, ROLE_LABEL } from './api.js';
import Login from './pages/Login.jsx';
import Catalog from './pages/Catalog.jsx';
import MyLoans from './pages/MyLoans.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ManageBooks from './pages/ManageBooks.jsx';
import Loans from './pages/Loans.jsx';
import Members from './pages/Members.jsx';
import Staff from './pages/Staff.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('shelfwise_theme') || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('shelfwise_theme', theme); }, [theme]);
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const [ready, setReady] = useState(false);
  const nav = useNavigate();

  const logout = useCallback(() => { setToken(null); setUser(null); nav('/login'); }, [nav]);
  useEffect(() => {
    window.addEventListener('shelfwise-logout', logout);
    return () => window.removeEventListener('shelfwise-logout', logout);
  }, [logout]);
  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api('/auth/me').then((r) => setUser(r.user)).catch(() => {}).finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="center muted">Loading…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login theme={theme} onTheme={toggleTheme} onLogin={(u) => { setUser(u); nav(isStaff(u) ? '/dashboard' : '/'); }} />} />
      </Routes>
    );
  }
  const staff = isStaff(user);
  return (
    <div className="shell">
      <header className="top">
        <div className="brand"><span className="logo" aria-hidden>📚</span> ShelfWise</div>
        <nav className="tabs">
          {staff && <NavLink to="/dashboard">Dashboard</NavLink>}
          <NavLink to="/" end>Catalog</NavLink>
          {!staff && <NavLink to="/my-loans">My loans</NavLink>}
          {staff && <NavLink to="/books">Manage books</NavLink>}
          {staff && <NavLink to="/loans">Loans</NavLink>}
          {staff && <NavLink to="/members">Members</NavLink>}
          {user.role === 'admin' && <NavLink to="/staff">Accounts</NavLink>}
        </nav>
        <div className="who">
          <span className={'badge role-' + user.role}>{ROLE_LABEL[user.role]}</span>
          <span className="name">{user.name}</span>
          <button className="btn small ghost" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button className="btn small ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Catalog user={user} />} />
          <Route path="/my-loans" element={staff ? <Navigate to="/loans" /> : <MyLoans />} />
          <Route path="/dashboard" element={staff ? <Dashboard /> : <Navigate to="/" />} />
          <Route path="/books" element={staff ? <ManageBooks user={user} /> : <Navigate to="/" />} />
          <Route path="/loans" element={staff ? <Loans /> : <Navigate to="/" />} />
          <Route path="/members" element={staff ? <Members /> : <Navigate to="/" />} />
          <Route path="/staff" element={user.role === 'admin' ? <Staff /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
