import React from 'react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { text: 'Workflows', icon: 'dashboard', path: '/' },
  { text: 'Runners', icon: 'precision_manufacturing', path: '/runners' },
  { text: 'Statistics', icon: 'analytics', path: '/stats' },
  { text: 'Settings', icon: 'settings', path: '/settings' },
];

const Layout = ({ children }) => {
  return (
    <div className="bg-surface text-on-surface antialiased overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[240px] h-screen fixed left-0 top-0 bg-[#0a0e14] flex flex-col py-6 px-4 text-sm tracking-tight z-[60]">
        <div className="mb-8 px-2">
          <h1 className="text-[#a2c9ff] font-bold tracking-tighter text-xl">RunWatch</h1>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(({ text, icon, path }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 transition-colors duration-200 hover:bg-[#1c2026] ${
                  isActive
                    ? 'text-[#a2c9ff] font-medium border-l-2 border-[#a2c9ff]'
                    : 'text-[#dfe2eb]/60 hover:text-[#dfe2eb]'
                }`
              }
            >
              <span className="material-symbols-outlined">{icon}</span>
              {text}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-1 pt-6">
          <a
            href="#"
            className="flex items-center gap-3 px-3 py-2 text-[#dfe2eb]/60 hover:text-[#dfe2eb] hover:bg-[#1c2026] transition-colors duration-200"
          >
            <span className="material-symbols-outlined">description</span>
            Docs
          </a>
          <div className="mt-6 flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-xs font-bold text-on-surface">
              U
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold">User</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Top Header */}
      <header className="fixed top-0 right-0 left-[240px] h-16 bg-[#10141a]/80 backdrop-blur-xl flex items-center justify-between px-8 z-50 text-sm font-medium tracking-normal">
        <div className="flex items-center gap-6">
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-[#dfe2eb]/60 hover:text-primary transition-colors">
            <span className="material-symbols-outlined">refresh</span>
          </button>
          <div className="flex items-center gap-1">
            <button className="p-1.5 text-[#dfe2eb]/60 hover:text-primary material-symbols-outlined">chevron_left</button>
            <button className="p-1.5 text-[#dfe2eb]/60 hover:text-primary material-symbols-outlined">chevron_right</button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="ml-[240px] pt-16 h-screen overflow-y-auto bg-surface">
        {children}
      </main>
    </div>
  );
};

export default Layout;
