import React, { useMemo } from 'react';
import CopyButton from './CopyButton.jsx';
import { makeSnippets } from '../lib/snippets.js';
import Snippet from './Snippet.jsx';
import { CommandIcon, GlobeIcon, HexagonIcon } from 'lucide-react';

export default function Snippets({ route }) {
  const { curl, browser, node, url } = useMemo(() => makeSnippets(route), [route]);

  return (
    <div className="mt-4">
      <div className="mb-2 text-sm">
        <span className="opacity-70">Absolute URL:</span> <code className="font-mono">{url}</code>
      </div>
      <Snippet
        commands={[
          {
            label: 'curl',
            icon: CommandIcon,
            code: curl,
          },
          {
            label: 'Browser fetch',
            icon: GlobeIcon,
            code: browser,
          },
          {
            label: 'Node fetch',
            icon: HexagonIcon,
            code: node,
          },
        ]}
      />
    </div>
  );
}
