import React, { useEffect, useState } from 'react';
import Toast from '../Toast.jsx';
import { api, isStaff } from '../api.js';

const palette = ['#1e3a5f', '#7c3a4a', '#2f6b4f', '#8a5a14', '#4a3a7c', '#245c6b', '#6b2f2f', '#3b4a5a'];
export const hue = (s) => palette[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];

export function Cover({ book }) {
  return (
    <div className="cover" style={{ background: hue(book.title) }}>
      <span className="cover-cat">{book.category}</span>
      <span className="cover-title">{book.title}</span>
    </div>
  );
}

export default function Catalog({ user }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [available, setAvailable] = useState(false);
  const [page, setPage] = useState(1);
  const [cats, setCats] = useState([]);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const staff = isStaff(user);

  useEffect(() => { api('/books/categories').then(setCats).catch(() => {}); }, []);
  useEffect(() => { if (staff) api('/members').then((m) => setMembers(m.filter((x) => x.active))).catch(() => {}); }, [staff]);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const load = () => {
    setLoading(true);
    const p = new URLSearchParams({ page, limit: 12, ...(debounced ? { q: debounced } : {}), ...(category ? { category } : {}), ...(available ? { available: 'true' } : {}) });
    return api('/books?' + p).then(setData).catch((e) => setMsg({ err: e.message })).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [debounced, category, available, page]);

  async function reserve(book) {
    setMsg(null);
    if (staff && !memberId) { setMsg({ err: 'Choose a member to reserve this book for' }); return; }
    try {
      const r = await api('/reservations', { method: 'POST', body: { bookId: book._id, memberId: staff ? memberId : undefined } });
      setMsg({ ok: `Reserved "${book.title}". Queue position: ${r.position}.` });
      load();
    } catch (e) { setMsg({ err: e.message }); }
  }

  async function borrow(book) {
    setMsg(null);
    if (staff && !memberId) { setMsg({ err: 'Choose a member to issue this book to' }); return; }
    try {
      const l = await api('/loans', { method: 'POST', body: { bookId: book._id, memberId: staff ? memberId : undefined } });
      setMsg({ ok: `"${book.title}" issued. Due ${new Date(l.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.` });
      load();
    } catch (e) { setMsg({ err: e.message }); }
  }

  return (
    <>
      <div className="hero"><h2>{staff ? 'Library catalog' : `Welcome, ${user.name.split(' ')[0]}`}</h2><p>{staff ? 'Search the collection and issue books to members.' : 'Find your next read and borrow it in one tap.'}</p></div>
      <div className="filters">
        <input className="grow" type="search" placeholder="Search title, author, category or ISBN" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={available} onChange={(e) => { setAvailable(e.target.checked); setPage(1); }} /> Available only</label>
      </div>
      {staff && (
        <div className="filters">
          <span className="muted">Issue to:</span>
          <select className="grow" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Select member…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.memberId})</option>)}
          </select>
        </div>
      )}
      <Toast msg={msg} onClose={() => setMsg(null)} />
      {loading ? <p className="muted">Loading books…</p> : data.items.length === 0 ? <p className="muted">No books match your search.</p> : (
        <div className="grid">
          {data.items.map((b) => (
            <article className="book card" key={b._id}>
              <Cover book={b} />
              <div className="book-body">
                <h3>{b.title}</h3>
                <div className="muted">{b.author}{b.year ? ` · ${b.year}` : ''}</div>
                <div className="row between">
                  <span className={'badge ' + (b.availableCopies > 0 ? 'ok' : 'warn')}>{b.availableCopies > 0 ? `${b.availableCopies} of ${b.totalCopies} available` : `All copies out${b.waiting ? ` · ${b.waiting} waiting` : ''}`}</span>
                  <span className="muted small-text">Shelf {b.shelf || '-'}</span>
                </div>
                {open === b._id && <p className="desc">{b.description || 'No description.'}<br /><span className="muted small-text">ISBN {b.isbn || '-'}</span></p>}
                <div className="row gap">
                  <button className="btn small ghost" onClick={() => setOpen(open === b._id ? null : b._id)}>{open === b._id ? 'Less' : 'Details'}</button>
                  {b.availableCopies - b.waiting < 1 && !(b.reservedByMe && b.availableCopies > 0) ? (
                    <button className="btn small primary" disabled={b.reservedByMe} onClick={() => reserve(b)}>{b.reservedByMe ? 'Reserved' : 'Reserve'}</button>
                  ) : (
                    <button className="btn small primary" onClick={() => borrow(b)}>{staff ? 'Issue' : 'Borrow'}</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="pager">
        <button className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="muted">Page {data.page || 1} of {data.pages} · {data.total} books</span>
        <button className="btn small" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </>
  );
}
