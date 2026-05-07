import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rupeezy RM Dashboard',
  description: 'AI Voice Agent — Partner Lead Conversion',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen overflow-hidden bg-gray-50">
          {/* Sidebar — light theme */}
          <aside className="hidden lg:flex flex-col w-56 bg-white border-r border-gray-200 shrink-0">
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">R</div>
              <div>
                <div className="text-gray-900 font-bold text-sm">Rupeezy</div>
                <div className="text-gray-400 text-xs">RM Dashboard</div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-3 space-y-0.5">
              {[
                { href: '/', label: 'Overview', emoji: '📊' },
                { href: '/leads', label: 'All Leads', emoji: '👥' },
                { href: '/leads?status=HOT', label: 'Hot Leads', emoji: '🔥' },
                { href: '/leads?status=WARM', label: 'Warm Leads', emoji: '🌡️' },
                { href: '/leads?status=COLD', label: 'Cold Leads', emoji: '❄️' },
              ].map(item => (
                <a key={item.href} href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all text-sm font-medium">
                  <span className="text-base">{item.emoji}</span>
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
                🎙 Test Voice Call
              </a>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Top bar */}
            <header className="bg-white border-b border-gray-200 px-6 h-14 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-700">Partner Lead Conversion</span>
                <span className="text-gray-300">·</span>
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
