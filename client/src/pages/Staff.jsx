import React, { useEffect, useState } from 'react';
import { api, ROLE_LABEL } from '../api.js';

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'librarian' });
  const [msg, setMsg] = useState(null);
  const load = () => api('/staff').then(setStaff).catch((e) => setMsg({ err: e.message }));
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function create(e) {
    e.preventDefault(); setMsg(null);
    try { await api('/users', { method: 'POST', body: f }); setMsg({ ok: 'Account created.' }); setF({ name: '', email: '', password: '', role: f.role }); load(); }
    catch (x) { setMsg({ err: x.message }); }
  }
  return (
    <>
      <h2>Accounts</h2>
      <p className="muted">Only admins can create librarian, faculty, student or other admin accounts.</p>
      {msg?.err && <div className="error" role="alert">{msg.err}</div>}
      {msg?.ok && <div className="success" role="status">{msg.ok}</div>}
      <form className="card pad form" onSubmit={create}>
        <h3>Create account</h3>
        <div className="fgrid">
          <label>Name<input value={f.name} onChange={set('name')} required /></label>
          <label>Email<input type="email" value={f.email} onChange={set('email')} required /></label>
          <label>Temporary password<input type="password" minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" required /></label>
          <label>Role<select value={f.role} onChange={set('role')}>{['librarian', 'admin', 'faculty', 'student'].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
        </div>
        <button className="btn primary">Create</button>
      </form>
      <h3>Staff</h3>
      <div className="table-wrap card">
        <table><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>{staff.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.email}</td><td><span className={'badge role-' + s.role}>{ROLE_LABEL[s.role]}</span></td></tr>)}</tbody></table>
      </div>
      <h3>Role permissions</h3>
      <div className="table-wrap card">
        <table>
          <thead><tr><th>Role</th><th>Can do</th></tr></thead>
          <tbody>
            <tr><td>Admin</td><td>Everything, including deleting books and creating accounts</td></tr>
            <tr><td>Librarian</td><td>Add and edit books, issue and return, manage members, view dashboard</td></tr>
            <tr><td>Faculty</td><td>Browse and borrow up to 6 books for 30 days, renew once for 14 days</td></tr>
            <tr><td>Student</td><td>Browse and borrow up to 3 books for 14 days, renew once for 7 days</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
