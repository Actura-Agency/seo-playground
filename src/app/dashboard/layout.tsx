import Sidebar, { MobileSidebar } from '@/components/Sidebar';
import BalanceBadge from '@/components/BalanceBadge';
import ThemeToggle from '@/components/ThemeToggle';
import UpdateBanner from '@/components/UpdateBanner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh print:block print:h-auto bg-slate-50 dark:bg-slate-950 print:bg-white text-slate-900 dark:text-slate-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">
        <div className="print:hidden"><UpdateBanner /></div>
        <header className="print:hidden h-14 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between md:justify-end px-4 md:px-6 shrink-0 gap-3">
          <MobileSidebar />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <BalanceBadge />
          </div>
        </header>

        <div className="flex-1 overflow-hidden print:overflow-visible">
          <main className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 print:h-auto print:overflow-visible print:p-0">
            <div className="max-w-6xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
