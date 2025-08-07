import { Topbar } from './topbar';

interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="min-h-screen flex flex-col surface-gradient">
      <Topbar />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl">
        {children}
      </main>
      
      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-surface/50 px-4 py-3">
        <div className="container mx-auto max-w-7xl flex justify-between items-center text-sm text-text-muted">
          <div>
            <span>{process.env.NEXT_PUBLIC_APP_NAME || 'Spellbook'}</span>
            <span className="ml-2">© 2025</span>
          </div>
          <div>
            Built with ❤️ for card collectors
          </div>
        </div>
      </footer>
    </div>
  );
}