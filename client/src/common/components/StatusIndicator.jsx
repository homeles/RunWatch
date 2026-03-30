import React from 'react';

const statusClasses = {
  success: 'bg-secondary',
  failure: 'bg-error',
  warning: 'bg-tertiary',
  skipped: 'bg-outline-variant',
  running: 'bg-primary animate-pulse',
  queued: 'bg-outline-variant',
};

const sizeClasses = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2.5 h-2.5',
};

const StatusIndicator = ({ status = 'skipped', size = 'md' }) => {
  const colorClass = statusClasses[status] ?? statusClasses.skipped;
  const sizeClass = sizeClasses[size] ?? sizeClasses.md;
  return <div className={`rounded-full ${sizeClass} ${colorClass}`} />;
};

export default StatusIndicator;
