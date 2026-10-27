import React, { useEffect, useState } from 'react';
import { api, ROLE_LABEL } from '../api.js';

export default function Members() {
  const [m, setM] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api('/members').then(setM).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  async function toggle(x) {
    setErr('');
    try { await api('/members/' + x.id, { method: 'PATCH', body: { active: !x.active } }); load(); } catch (e) { setErr(e.message); }
  }
  if (!m) return <p className="muted">Loading…</p>;
  return (
    <>
      <h2>Members</h2>
      {err && <div className="error">{err}</div>}
      <div className="table-wrap card">
        <table className="members-table">
          <thead><tr><th>Member</th><th>Type</th><th>Borrowed</th><th></th></tr></thead>
          <tbody>
            {m.map((x) => (
              <tr key={x.id} className={x.active ? '' : 'dim'}>
                <td><b>{x.name}</b><div className="muted small-text">{x.memberId} · {x.email}<span className="only-mobile"> · {ROLE_LABEL[x.role]}</span></div></td>
                <td><span className={'badge role-' + x.role}>{ROLE_LABEL[x.role]}</span></td>
                <td>{x.activeLoans}</td>
                <td className="actions"><button className="btn small" onClick={() => toggle(x)}>{x.active ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
