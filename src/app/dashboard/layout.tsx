import type { Metadata } from 'next';
import { SiteShell } from '@/components/layout/site-shell';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Usage, processing history and API keys.',
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell>
      <div className="inner-page inner-dashboard">
        <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
          <DashboardNav />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </SiteShell>
  );
}
