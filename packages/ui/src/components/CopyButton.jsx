import React, { useState } from 'react';

export default function CopyButton({ getText, label = 'Copy', title }) {
  const [ok, setOk] = useState(false);
  async function onCopy() {
    try {
      const txt = typeof getText === 'function' ? getText() : String(getText ?? '');
      await navigator.clipboard.writeText(txt);
      setOk(true);
      setTimeout(() => setOk(false), 1200);
    } catch {
      /* ignore */
    }
  }
  return (
    <button
      className="text-xs px-2 py-1 border rounded hover:bg-black/10"
      onClick={onCopy}
      title={title || label}
    >
      {ok ? 'Copied!' : label}
    </button>
  );
}
