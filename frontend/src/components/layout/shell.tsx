import { Topbar } from './topbar';

interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-primary-bg">
      <Topbar />
      <main className="flex-1 container mx-auto px-md py-lg max-w-7xl">
        {children}
      </main>
      
      <footer className="mt-auto border-t border-border bg-ui-bg/50 px-md py-sm">
        <div className="container mx-auto max-w-7xl flex justify-between items-center text-sm text-text-secondary">
          <div>
            <span>{process.env.NEXT_PUBLIC_APP_NAME || 'Spellbook'}</span>
            <span className="ml-sm">© 2025</span>
          </div>
          <div>
            Built with ❤️ for card collectors
          </div>
        </div>
      </footer>
    </div>
  );
}