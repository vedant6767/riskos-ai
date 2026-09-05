'use client';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar }  from './Navbar';
import { useCommandPalette, CommandPalettePortal } from '@/components/ui/CommandPalette';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { open, setOpen } = useCommandPalette();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Navbar onSearchOpen={() => setOpen(true)} />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto bg-slate-950"
          tabIndex={-1}
        >
          <div className="p-5 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>
      {/* Global Cmd+K command palette */}
      <CommandPalettePortal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
