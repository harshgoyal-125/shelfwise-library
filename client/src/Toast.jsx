import React, { useEffect } from 'react';

// Floating message so feedback is visible wherever the user has scrolled.
export default function Toast({ msg, onClose }) {
  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(onClose, msg.err ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [msg, onClose]);
  if (!msg) return null;
  return (
    <div className={'toast ' + (msg.err ? 'toast-err' : 'toast-ok')} role={msg.err ? 'alert' : 'status'} onClick={onClose}>
      <span>{msg.err || msg.ok}</span>
      <button type="button" aria-label="Dismiss" className="toast-x">×</button>
    </div>
  );
}
