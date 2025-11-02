import React from 'react';
import { Github, Layers, MoveUpRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import ThemeToggle from '@/components/ThemeToggle.jsx';

export default function NavBar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-12 items-center px-3">
        {/* Left: logo + name */}
        <div className="flex items-center gap-2">
          <div className="inline-flex h-6 w-6 items-center justify-center rounded-md border">
            <Layers className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">StatikAPI</span>
        </div>

        {/* Right */}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <a
              href="https://statikapi.com/docs"
              target="_blank"
              rel="noreferrer"
              aria-label="Open documentation"
            >
              <span className="hidden sm:inline">Docs</span>
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <a
              href="https://github.com/zonayedpca/statikapi"
              target="_blank"
              rel="noreferrer"
              aria-label="Open GitHub repository"
            >
              <Github className="h-4 w-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
