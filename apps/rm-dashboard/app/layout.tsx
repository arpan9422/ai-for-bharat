import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rupeezy RM Dashboard',
  description: 'AI Voice Agent — Partner Lead Conversion Dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          {/* Top nav */}
          <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">R</div>
                <div>
                  <span className="font-semibold text-gray-900 text-sm">Rupeezy</span>
                  <span className="text-gray-400 text-sm ml-1.5">RM Dashboard</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  AI Agent Live
                </span>
                <a
                  href="http://localhost:4000/test-voice-pipeline"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 border border-indigo-200 bg-indigo-50 px-3 py-1 rounded-full font-medium hover:bg-indigo-100 transition-colors"
                >
                  🎙 Test Voice
                </a>
              </div>
            </div>
          </header>

          {/* Sidebar + content */}
          <div className="flex flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 gap-6">
            {/* Sidebar */}
            <nav className="hidden lg:flex flex-col gap-1 w-44 shrink-0">
              {[
                { href: '/', icon: '📊', label: 'Dashboard' },
                { href: '/leads', icon: '👥', label: 'All Leads' },
                { href: '/leads?status=HOT', icon: '🔥', label: 'Hot Leads' },
                { href: '/leads?status=WARM', icon: '🌡️', label: 'Warm Leads' },
                { href: '/leads?status=COLD', icon: '❄️', label: 'Cold Leads' },
              ].map(item => (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm transition-all"
                >
                  <span>{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </a>
              ))}
            </nav>

            {/* Main content */}
            <main className="flex-1 min-w-0">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
