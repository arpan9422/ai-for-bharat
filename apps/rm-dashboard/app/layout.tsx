import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rupeezy RM Dashboard',
  description: 'AI Voice Agent — Partner Lead Conversion',
};

const NAV = [
  { href: '/',                  label: 'Overview',    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/leads',             label: 'All Leads',   icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { href: '/leads?status=HOT',  label: 'Hot Leads',   icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
  { href: '/leads?status=WARM', label: 'Warm Leads',  icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { href: '/leads?status=COLD', label: 'Cold Leads',  icon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen overflow-hidden bg-[#F5F7FA]">
          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-gray-200 shrink-0 shadow-sm">
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <div className="text-gray-900 font-bold text-sm leading-tight">Rupeezy</div>
                <div className="text-gray-400 text-xs">RM Dashboard</div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-3 space-y-0.5">
              {NAV.map(item => (
                <a key={item.href} href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all text-sm font-medium group">
                  <svg className="w-4 h-4 shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  {item.label}
                </a>
              ))}
            </nav>

            {/* Bottom */}
            <div className="px-3 py-3 border-t border-gray-100 space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="text-xs text-emerald-700 font-semibold">AI Agent Live</span>
              </div>
              <a href="http://localhost:4000/test-voice-pipeline" target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Test Voice Call
              </a>
            </div>
          </aside>

          {/* Main */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Top bar */}
            <header className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Partner Lead Conversion</span>
                <span className="text-gray-300 text-xs">·</span>
                <span className="text-xs text-gray-400">AI Voice Agent Platform</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  Rupeezy AP Program
                </span>
              </div>
            </header>

            {/* Page content */}
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
