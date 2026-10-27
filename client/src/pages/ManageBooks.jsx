import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const empty = { title: '', author: '', category: '', isbn: '', year: '', shelf: '', totalCopies: 1, description: '' };

export default function ManageBooks({ user }) {
  const [books, setBooks] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => api('/books?limit=48' + (q ? '&q=' + encodeURIComponent(q) : '')).then((r) => setBooks(r.items)).catch((e) => setMsg({ err: e.message }));
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault(); setMsg(null);
    try {
      if (form._id) await api('/books/' + form._id, { method: 'PUT', body: form });
      else await api('/books', { method: 'POST', body: form });
      setForm(null); setMsg({ ok: 'Saved.' }); load();
    } catch (x) { setMsg({ err: x.message }); }
  }
  async function del(b) {
    if (!window.confirm(`Delete "${b.title}"?`)) return;
    setMsg(null);
    try { await api('/books/' + b._id, { method: 'DELETE' }); setMsg({ ok: 'Deleted.' }); load(); } catch (x) { setMsg({ err: x.message }); }
  }
  return (
    <>
      <div className="row between"><h2>Manage books</h2><button className="btn primary" onClick={() => setForm({ ...empty })}>Add book</button></div>
      <div className="filters"><input className="grow" type="search" placeholder="Search books" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {msg?.err && <div className="error" role="alert">{msg.err}</div>}
      {msg?.ok && <div className="success" role="status">{msg.ok}</div>}
      {form && (
        <form className="card pad form" onSubmit={save}>
          <h3>{form._id ? 'Edit book' : 'New book'}</h3>
          <div className="fgrid">
            <label>Title<input value={form.title} onChange={set('title')} required /></label>
            <label>Author<input value={form.author} onChange={set('author')} required /></label>
            <label>Category<input value={form.category} onChange={set('category')} required /></label>
            <label>ISBN<input value={form.isbn || ''} onChange={set('isbn')} /></label>
            <label>Year<input type="number" value={form.year ?? ''} onChange={set('year')} /></label>
            <label>Shelf<input value={form.shelf || ''} onChange={set('shelf')} /></label>
            <label>Total copies<input type="number" min="1" max="500" value={form.totalCopies} onChange={set('totalCopies')} required /></label>
          </div>
          <label>Description<textarea rows="3" value={form.description || ''} onChange={set('description')} /></label>
          <div className="row gap"><button className="btn primary">Save</button><button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      <div className="table-wrap card">
        <table>
          <thead><tr><th>Title</th><th>Category</th><th>Copies</th><th></th></tr></thead>
          <tbody>
            {books.map((b) => (
              <tr key={b._id}>
                <td><b>{b.title}</b><div className="muted small-text">{b.author}</div></td>
                <td>{b.category}</td>
                <td>{b.availableCopies}/{b.totalCopies}</td>
                <td className="actions">
                  <button className="btn small" onClick={() => { setForm(b); window.scrollTo({ top: 0 }); }}>Edit</button>
                  {user.role === 'admin' && <button className="btn small danger-btn" onClick={() => del(b)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
