import React from 'react';

const StatusChip = ({ status, conclusion }) => {
  if (['in_progress', 'queued', 'waiting', 'pending', 'requested'].includes(status)) {
    const label = status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const isInProgress = status === 'in_progress';
    const icon = isInProgress ? 'sync' : status === 'queued' ? 'play_circle' : 'schedule';
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(245,159,0,0.15)] text-[#F5A623] border border-[rgba(245,159,0,0.2)]">
        <span className={`material-symbols-outlined text-base leading-none ${isInProgress ? 'animate-spin' : ''}`}>{icon}</span>
        <span className={isInProgress ? 'animate-pulse' : ''}>{label}</span>
      </span>
    );
  }

  if (status === 'completed') {
    switch (conclusion) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary/15 text-secondary border border-secondary/20">
            <span className="material-symbols-outlined text-base leading-none">check_circle</span>
            Success
          </span>
        );
      case 'failure':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-error/15 text-error border border-error/20">
            <span className="material-symbols-outlined text-base leading-none">cancel</span>
            Failed
          </span>
        );
      case 'cancelled':
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-outline/15 text-outline border border-outline/20">
            <span className="material-symbols-outlined text-base leading-none">block</span>
            {conclusion === 'cancelled' ? 'Cancelled' : 'Skipped'}
          </span>
        );
      case 'timed_out':
      case 'action_required':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(245,159,0,0.15)] text-[#F5A623] border border-[rgba(245,159,0,0.2)]">
            <span className="material-symbols-outlined text-base leading-none">warning</span>
            {conclusion === 'timed_out' ? 'Timed Out' : 'Action Required'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-outline/15 text-outline border border-outline/20">
            {conclusion || 'Unknown'}
          </span>
        );
    }
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-outline/15 text-outline border border-outline/20">
      {status || 'Pending'}
    </span>
  );
};

export default StatusChip;
