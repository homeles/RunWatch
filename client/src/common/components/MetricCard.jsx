import React from 'react';

const MetricCard = ({ label, value, icon, accentColor = '#a2c9ff', trend }) => {
  return (
    <div
      className="bg-surface-container-low rounded-lg p-4 flex items-start gap-4"
      style={{ borderLeft: `4px solid ${accentColor}` }}
    >
      {icon && (
        <span className="material-symbols-outlined text-[22px] mt-0.5" style={{ color: accentColor }}>
          {icon}
        </span>
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-medium">{label}</span>
        <span className="text-2xl font-extrabold tracking-tighter text-on-surface leading-tight">{value}</span>
        {trend != null && (
          <span className="text-[10px] text-on-surface-variant mt-0.5">{trend}</span>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
