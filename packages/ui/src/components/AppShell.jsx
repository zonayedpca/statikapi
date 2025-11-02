import React from 'react';

import NavBar from '@/components/NavBar.jsx';

export default function AppShell({ sidebar, children }) {
  return (
    <div className="flex h-screen flex-col">
      <NavBar />
      <div className="grid min-h-0 flex-1 grid-cols-[20rem_minmax(0,1fr)]">
        {sidebar}
        <main className="min-w-0 overflow-auto p-3">{children}</main>
      </div>
    </div>
  );
}
