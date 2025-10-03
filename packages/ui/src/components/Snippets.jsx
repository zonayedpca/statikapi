// packages/ui/src/components/Snippets.jsx
import React, { useMemo } from 'react';
import CopyButton from './CopyButton.jsx';
import { makeSnippets } from '../lib/snippets.js';

export default function Snippets({ route }) {
  const { curl, browser, node, url } = useMemo(() => makeSnippets(route), [route]);

  const Block = ({ title, code, getText }) => (
    <div className="border rounded mb-3 overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between bg-black/5">
        <div className="text-xs font-medium">{title}</div>
        <CopyButton getText={getText || (() => code)} label="Copy" title={`Copy ${title}`} />
      </div>
      <pre className="p-3 text-xs whitespace-pre-wrap break-words">{code}</pre>
    </div>
  );

  return (
    <div className="mt-4">
      <div className="mb-2 text-sm">
        <span className="opacity-70">Absolute URL:</span> <code className="font-mono">{url}</code>
      </div>

      <Block title="curl" code={curl} />
      <Block title="Browser fetch" code={browser} />
      <Block title="Node fetch" code={node} />
    </div>
  );
}
