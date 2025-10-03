// packages/ui/src/components/JsonTree.jsx
import React from 'react';

export default function JsonTree({ data }) {
  return <div className="font-mono text-sm">{renderNode(data, 0)}</div>;
}

function renderNode(value, depth) {
  const pad = { paddingLeft: `${depth * 14}px` };

  if (value === null) return <div style={pad}>null</div>;
  const t = typeof value;

  if (t === 'string' || t === 'number' || t === 'boolean') {
    return <div style={pad}>{formatScalar(value)}</div>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <div style={pad}>[]</div>;
    return (
      <div>
        <div style={pad}>[</div>
        {value.map((v, i) => (
          <div key={i}>{renderNode(v, depth + 1)}</div>
        ))}
        <div style={pad}>]</div>
      </div>
    );
  }

  if (t === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) return <div style={pad}>{'{}'}</div>;
    return (
      <div>
        <div style={pad}>{'{'}</div>
        {keys.map((k) => (
          <div key={k}>
            <div style={{ paddingLeft: `${(depth + 1) * 14}px` }}>
              <span className="text-sky-700 dark:text-sky-300">"{k}"</span>
              <span>: </span>
              {isScalar(value[k]) ? (
                <span>{formatScalar(value[k])}</span>
              ) : (
                <div>{renderNode(value[k], depth + 2)}</div>
              )}
            </div>
          </div>
        ))}
        <div style={pad}>{'}'}</div>
      </div>
    );
  }

  return <div style={pad}>{String(value)}</div>;
}

function isScalar(v) {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function formatScalar(v) {
  if (typeof v === 'string') return `"${v}"`;
  return String(v);
}
