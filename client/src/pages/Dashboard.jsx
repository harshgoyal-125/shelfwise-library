import React, { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/stats').then(setS).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="error">{err}</div>;
  if (!s) return <p className="muted">Loading…</p>;
  const max = Math.max(...s.categories.map((c) => c.copies), 1);
  return (
    <>
      <h2>Dashboard</h2>
      <div className="stats">
        {[['Titles', s.titles], ['Copies', s.copies], ['Available', s.available], ['Members', s.members], ['On loan', s.activeLoans], ['Overdue', s.overdue]].map(([l, v]) => (
          <div className={'stat card' + (l === 'Overdue' && v > 0 ? ' alert' : '')} key={l}><b>{v}</b><span>{l}</span></div>
        ))}
      </div>
      <div className="two">
        <section className="card pad">
          <h3>Collection by category</h3>
          {s.categories.map((c) => (
            <div className="bar-row" key={c.category}>
              <span className="bar-label">{c.category}</span>
              <div className="bar"><i style={{ width: (c.copies / max) * 100 + '%' }} /></div>
              <span className="muted small-text">{c.copies}</span>
            </div>
          ))}
        </section>
        <section className="card pad">
          <h3>Recent activity</h3>
          {s.recent.map((l) => (
            <div className="activity" key={l._id}>
              <b>{l.member?.name}</b> {l.returnedAt ? 'returned' : 'borrowed'} <i>{l.book?.title}</i>
              <div className="muted small-text">{fmtDate(l.returnedAt || l.issuedAt)}</div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
