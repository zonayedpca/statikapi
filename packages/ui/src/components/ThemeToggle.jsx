// src/components/ThemeToggle.jsx
import React from 'react';
import { Moon, Sun, Laptop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/theme/ThemeProvider.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const Item = ({ active, onClick, icon: Icon, label }) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={onClick}
          aria-label={label}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="inline-flex items-center gap-1">
      <Item active={theme === 'light'} onClick={() => setTheme('light')} icon={Sun} label="Light" />
      <Item
        active={theme === 'system'}
        onClick={() => setTheme('system')}
        icon={Laptop}
        label="System"
      />
      <Item active={theme === 'dark'} onClick={() => setTheme('dark')} icon={Moon} label="Dark" />
    </div>
  );
}
