import React from 'react';

const DemoBanner = () => (
  <div
    className="relative z-50 flex items-center justify-center gap-3 py-1.5 px-4 border-b border-purple-500/30"
    style={{ background: 'linear-gradient(90deg, #1a1b2e 0%, #2d1b4e 50%, #1a1b2e 100%)' }}
  >
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold border border-purple-500/40 bg-purple-500/20 text-purple-400">
      <span className="material-symbols-outlined text-[14px]">science</span>
      DEMO
    </span>
    <span className="text-[0.8rem] text-[#8B949E]">
      This is a demo with mock data.{' '}
      <a
        href="https://github.com/homeles/RunWatch"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
      >
        Install RunWatch →
      </a>
    </span>
  </div>
);

export default DemoBanner;
