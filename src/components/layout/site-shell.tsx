import '@/app/inner-pages.css';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';

/** Standard page frame: nav, main landmark, footer. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
