import React, { useEffect, useState } from 'react';
import Toast from '../Toast.jsx';
import { api, fmtDate } from '../api.js';

export default function Loans() {
  const [status, setStatus] = useState('active');
  const [loans, setLoans] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => api('/loans?status=' + status).then(setLoans).catch((e) => setMsg({ err: e.message }));
  useEffect(() => { setLoans(null); load(); /* eslint-disable-next-line */ }, [status]);
  async function act(id, what) {
    setMsg(null);
    try { await api(`/loans/${id}/${what}`, { method: 'POST' }); setMsg({ ok: what === 'return' ? 'Marked as returned.' : 'Renewed.' }); load(); }
    catch (e) { setMsg({ err: e.message }); }
  }
  return (
    <>
      <h2>Loans</h2>
      <div className="chips">
        {['active', 'overdue', 'returned', 'all'].map((s) => <button key={s} className={'chip' + (status === s ? ' on' : '')} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}
      </div>
      <p className="muted small-text">To issue a book, open the Catalog, pick a member and press Issue.</p>
      <Toast msg={msg} onClose={() => setMsg(null)} />
      {!loans ? <p className="muted">Loading…</p> : loans.length === 0 ? <p className="muted">No loans here.</p> : (
        <div className="list">
          {loans.map((l) => (
            <div className="item card" key={l._id}>
              <div className="grow">
                <b>{l.book?.title}</b>
                <div className="muted">{l.member?.name} · {l.member?.memberId}</div>
                <div className="small-text">Issued {fmtDate(l.issuedAt)} · {l.returnedAt ? <>Returned {fmtDate(l.returnedAt)}</> : <>Due <b className={l.overdue ? 'danger' : ''}>{fmtDate(l.dueAt)}</b></>}{l.fine > 0 && ` · Fine ₹${l.fine}`}</div>
              </div>
              {!l.returnedAt && (
                <div className="row gap">
                  <button className="btn small" disabled={l.overdue || l.renewals >= 1} onClick={() => act(l._id, 'renew')}>Renew</button>
                  <button className="btn small primary" onClick={() => act(l._id, 'return')}>Mark returned</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
