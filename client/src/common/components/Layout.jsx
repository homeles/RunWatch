import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import apiService from '../../api/apiService';
import { socket } from '../../api/socketService';

const staticNavItems = [
  { text: 'Workflows', icon: 'dashboard', path: '/' },
  { text: 'Statistics', icon: 'analytics', path: '/stats' },
  { text: 'Settings', icon: 'settings', path: '/settings' },
];

const RUNNERS_TOOLTIP =
  'Self-hosted runners monitoring requires additional GitHub App permissions. Contact your admin to enable the Self-hosted runners (Read) permission.';

const Layout = ({ children }) => {
  const [runnersAvailable, setRunnersAvailable] = useState(false);
  const [socketConnected, setSocketConnected] = useState(socket.connected);

  useEffect(() => {
    apiService.getRunnersStatus().then((status) => {
      setRunnersAvailable(status.available === true);
    });
  }, []);

  useEffect(() => {
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <div className="bg-surface text-on-surface antialiased overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[240px] h-screen fixed left-0 top-0 bg-[#0a0e14] flex flex-col py-6 px-4 text-sm tracking-tight z-[60]">
        <div className="mb-8 px-2">
          <h1 className="text-[#a2c9ff] font-bold tracking-tighter text-xl">RunWatch</h1>
        </div>

        <nav className="flex-1 space-y-1">
          {/* Static nav items (Workflows first, then others after Runners) */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 transition-colors duration-200 hover:bg-[#1c2026] ${
                isActive
                  ? 'text-[#a2c9ff] font-medium border-l-2 border-[#a2c9ff]'
                  : 'text-[#dfe2eb]/60 hover:text-[#dfe2eb]'
              }`
            }
          >
            <span className="material-symbols-outlined">dashboard</span>
            Workflows
          </NavLink>

          {/* Runners nav item — conditional on permission */}
          {runnersAvailable ? (
            <NavLink
              to="/runners"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 transition-colors duration-200 hover:bg-[#1c2026] ${
                  isActive
                    ? 'text-[#a2c9ff] font-medium border-l-2 border-[#a2c9ff]'
                    : 'text-[#dfe2eb]/60 hover:text-[#dfe2eb]'
                }`
              }
            >
              <span className="material-symbols-outlined">precision_manufacturing</span>
              Runners
            </NavLink>
          ) : (
            <div className="relative group">
              <div className="flex items-center gap-3 px-3 py-2 text-[#dfe2eb]/25 cursor-not-allowed select-none">
                <span className="material-symbols-outlined">precision_manufacturing</span>
                Runners
              </div>
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 hidden group-hover:block w-64 bg-[#1c2026] border border-[#dfe2eb]/10 rounded-lg px-3 py-2 text-xs text-[#dfe2eb]/60 shadow-xl pointer-events-none">
                {RUNNERS_TOOLTIP}
              </div>
            </div>
          )}

          {/* Statistics and Settings */}
          {staticNavItems.slice(1).map(({ text, icon, path }) => (
            <NavLink
              key={path}
              to={path}
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
      <header className="fixed top-0 right-0 left-[240px] h-16 bg-[#10141a]/80 backdrop-blur-xl flex items-center justify-end px-8 z-50 text-sm font-medium tracking-normal">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              socketConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
            }`}
          />
          <span className="text-xs text-[#dfe2eb]/50">
            {socketConnected ? 'Live' : 'Disconnected'}
          </span>
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
