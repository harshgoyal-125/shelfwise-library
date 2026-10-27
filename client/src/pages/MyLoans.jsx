import React, { useEffect, useState } from 'react';
import Toast from '../Toast.jsx';
import { api, fmtDate } from '../api.js';

export default function MyLoans({ user }) {
  const [loans, setLoans] = useState(null);
  const [resv, setResv] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [msg, setMsg] = useState(null);
  const load = () => {
    api('/loans/mine').then(setLoans).catch((e) => setMsg({ err: e.message }));
    api('/reservations/mine').then(setResv).catch(() => {});
    api('/requests/mine').then(setReqs).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  async function act(id, what) {
    setMsg(null);
    try { await api(`/loans/${id}/${what}`, { method: 'POST' }); setMsg({ ok: what === 'renew' ? 'Renewed.' : 'Book returned. Thank you!' }); load(); }
    catch (e) { setMsg({ err: e.message }); }
  }
  async function cancel(id) {
    setMsg(null);
    try { await api('/reservations/' + id, { method: 'DELETE' }); setMsg({ ok: 'Reservation cancelled.' }); load(); }
    catch (e) { setMsg({ err: e.message }); }
  }
  async function cancelReq(id) {
    setMsg(null);
    try { await api('/requests/' + id + '/cancel', { method: 'POST' }); setMsg({ ok: 'Request cancelled.' }); load(); }
    catch (e) { setMsg({ err: e.message }); }
  }
  if (!loans) return <p className="muted">Loading…</p>;
  const waiting = resv.filter((r) => r.status === 'waiting');
  const pendingReqs = reqs.filter((r) => r.status === 'pending');
  const decidedReqs = reqs.filter((r) => r.status === 'rejected').slice(0, 5);
  const active = loans.filter((l) => !l.returnedAt);
  const past = loans.filter((l) => l.returnedAt);
  const fines = loans.reduce((s, l) => s + (l.fine || 0), 0);
  return (
    <>
      <h2>My loans</h2>
      <Toast msg={msg} onClose={() => setMsg(null)} />
      <div className="stats">
        <div className="stat card"><b>{active.length}</b><span>Borrowed now</span></div>
        <div className="stat card"><b>{active.filter((l) => l.overdue).length}</b><span>Overdue</span></div>
        <div className="stat card"><b>₹{fines}</b><span>Fines (₹5/day late)</span></div>
      </div>
      {user?.role === 'student' && (<>
      <h3>Requests</h3>
      {pendingReqs.length === 0 && decidedReqs.length === 0 ? <p className="muted">No pending requests. Request a book from the catalog and the librarian will approve it.</p> : (
        <div className="list">
          {pendingReqs.map((r) => (
            <div className="item card" key={r._id}>
              <div className="grow">
                <b>{r.book?.title}</b>
                <div className="small-text muted">Requested {fmtDate(r.createdAt)} · waiting for librarian approval</div>
              </div>
              <div className="row gap">
                <span className="badge warn">Pending</span>
                <button className="btn small" onClick={() => cancelReq(r._id)}>Cancel</button>
              </div>
            </div>
          ))}
          {decidedReqs.map((r) => (
            <div className="item card" key={r._id}>
              <div className="grow">
                <b>{r.book?.title}</b>
                <div className="small-text muted">Requested {fmtDate(r.createdAt)}</div>
              </div>
              <span className="badge">Rejected</span>
            </div>
          ))}
        </div>
      )}
      </>)}
      <h3>Currently borrowed</h3>
      {active.length === 0 ? <p className="muted">Nothing borrowed. Visit the catalog to pick a book.</p> : (
        <div className="list">
          {active.map((l) => (
            <div className="item card" key={l._id}>
              <div className="grow">
                <b>{l.book?.title}</b>
                <div className="muted">{l.book?.author}</div>
                <div className="small-text">Issued {fmtDate(l.issuedAt)} · Due <b className={l.overdue ? 'danger' : ''}>{fmtDate(l.dueAt)}</b>{l.overdue && ` · fine so far ₹${l.fine}`}</div>
              </div>
              <div className="row gap">
                <button className="btn small" disabled={l.overdue || l.renewals >= 1} onClick={() => act(l._id, 'renew')}>Renew</button>
                <button className="btn small primary" onClick={() => act(l._id, 'return')}>Return</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <h3>Reservations</h3>
      {waiting.length === 0 ? <p className="muted">No active reservations. When every copy of a book is out, you can reserve it from the catalog.</p> : (
        <div className="list">
          {waiting.map((r) => (
            <div className="item card" key={r._id}>
              <div className="grow">
                <b>{r.book?.title}</b>
                <div className="small-text muted">Queue position {r.position}{r.book?.availableCopies > 0 && r.position === 1 ? ' · a copy is ready, borrow it from the catalog' : ''}</div>
              </div>
              <button className="btn small" onClick={() => cancel(r._id)}>Cancel</button>
            </div>
          ))}
        </div>
      )}
      <h3>History</h3>
      {past.length === 0 ? <p className="muted">No past loans yet.</p> : (
        <div className="list">
          {past.map((l) => (
            <div className="item card" key={l._id}>
              <div className="grow"><b>{l.book?.title}</b><div className="small-text muted">{fmtDate(l.issuedAt)} → returned {fmtDate(l.returnedAt)}</div></div>
              {l.fine > 0 && <span className="badge warn">Fine ₹{l.fine}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
