import React, { useState } from 'react';
import { Clipboard, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function CopyButton({ getText, label = 'Copy JSON', title = 'Copy JSON' }) {
  const [ok, setOk] = useState(false);

  async function onCopy() {
    try {
      const txt = typeof getText === 'function' ? getText() : String(getText ?? '');
      await navigator.clipboard.writeText(txt);
      setOk(true);
      setTimeout(() => setOk(false), 1000);
    } catch {}
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={onCopy} className="gap-2">
            {ok ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            <span className="hidden sm:inline">{ok ? 'Copied' : label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
