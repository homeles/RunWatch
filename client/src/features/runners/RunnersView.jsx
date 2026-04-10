import React, { useState, useEffect, useMemo, useRef } from 'react';
import apiService from '../../api/apiService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'Idle', value: 'idle' },
  { label: 'Busy', value: 'busy' },
  { label: 'Offline', value: 'offline' },
];

const statusMeta = (status) => {
  switch (status) {
    case 'idle':
      return { dot: 'bg-secondary', text: 'text-secondary', label: 'Idle' };
    case 'busy':
      return { dot: 'bg-primary animate-pulse', text: 'text-primary', label: 'Busy' };
    case 'offline':
      return { dot: 'bg-error', text: 'text-error', label: 'Offline' };
    default:
      return { dot: 'bg-outline-variant', text: 'text-outline', label: status };
  }
};

const osIcon = (os) => {
  if (!os) return 'computer';
  const lower = os.toLowerCase();
  if (lower.includes('win')) return 'window';
  if (lower.includes('mac') || lower.includes('darwin')) return 'laptop_mac';
  return 'terminal';
};

// ─── RunnerCard ────────────────────────────────────────────────────────────────

const RunnerCard = ({ runner }) => {
  const meta = statusMeta(runner.status);

  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-4 flex flex-col gap-3 hover:bg-surface-container-high transition-all">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="material-symbols-outlined text-on-surface-variant flex-shrink-0"
            style={{ fontSize: '18px' }}
          >
            {osIcon(runner.os)}
          </span>
          <span className="font-semibold text-sm text-on-surface truncate" title={runner.name}>
            {runner.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
          <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
        </div>
      </div>

      {/* Scope */}
      <div className="flex items-center gap-1.5 text-[11px] text-outline">
        <span
          className="material-symbols-outlined leading-none"
          style={{ fontSize: '13px' }}
        >
          {runner.scope === 'org' ? 'corporate_fare' : 'source'}
        </span>
        <span className="truncate">
          {runner.scope === 'org' ? runner.owner : `${runner.owner}/${runner.repo}`}
        </span>
      </div>

      {/* Runner group */}
      {runner.runnerGroup && (
        <div className="flex items-center gap-1.5 text-[11px] text-outline">
          <span
            className="material-symbols-outlined leading-none"
            style={{ fontSize: '13px' }}
          >
            group_work
          </span>
          <span className="truncate">{runner.runnerGroup}</span>
        </div>
      )}

      {/* Labels */}
      {runner.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {runner.labels.map((label) => (
            <span
              key={label}
              className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-medium text-primary/80"
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── RunnerGroup ──────────────────────────────────────────────────────────────

const RunnerGroup = ({ groupName, runners }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-6">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 mb-3 group w-full text-left"
      >
        <span
          className={`material-symbols-outlined text-outline transition-transform ${
            collapsed ? '-rotate-90' : ''
          }`}
          style={{ fontSize: '16px' }}
        >
          expand_more
        </span>
        <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant group-hover:text-on-surface transition-colors">
          {groupName || 'Default'}
        </span>
        <span className="ml-1 text-[10px] font-semibold text-outline">({runners.length})</span>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {runners.map((runner) => (
            <RunnerCard key={runner.id} runner={runner} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── RunnersView ──────────────────────────────────────────────────────────────

const RunnersView = () => {
  const [runners, setRunners] = useState([]);
  const [summary, setSummary] = useState({ total: 0, online: 0, busy: 0, offline: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('');
  const [runnersAvailable, setRunnersAvailable] = useState(null); // null = checking
  const intervalRef = useRef(null);

  const fetchRunners = async () => {
    try {
      const filters = {};
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (labelFilter) filters.label = labelFilter;

      const data = await apiService.getRunners(filters);
      setRunners(data.runners ?? []);
      setSummary(data.summary ?? { total: 0, online: 0, busy: 0, offline: 0 });
      setError(null);
    } catch (err) {
      setError('Failed to fetch runners. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Permission check on mount
  useEffect(() => {
    apiService.getRunnersStatus().then((status) => {
      setRunnersAvailable(status.available === true);
    });
  }, []);

  // Initial fetch + auto-refresh every 30 seconds (only when available)
  useEffect(() => {
    if (!runnersAvailable) return;
    setLoading(true);
    fetchRunners();
    intervalRef.current = setInterval(fetchRunners, 30000);
    return () => clearInterval(intervalRef.current);
  }, [statusFilter, labelFilter, runnersAvailable]);

  // Client-side name search filter
  const filteredRunners = useMemo(() => {
    if (!searchQuery) return runners;
    const q = searchQuery.toLowerCase();
    return runners.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.owner.toLowerCase().includes(q) ||
        (r.repo && r.repo.toLowerCase().includes(q))
    );
  }, [runners, searchQuery]);

  // Group by runner group name
  const groupedByGroup = useMemo(() => {
    const groups = {};
    for (const runner of filteredRunners) {
      const key = runner.runnerGroup || '';
      if (!groups[key]) groups[key] = [];
      groups[key].push(runner);
    }
    return groups;
  }, [filteredRunners]);

  const groupEntries = Object.entries(groupedByGroup).sort(([a], [b]) => a.localeCompare(b));

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (runnersAvailable === null) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!runnersAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] px-8 text-center">
        <span
          className="material-symbols-outlined text-outline mb-4"
          style={{ fontSize: '48px' }}
        >
          lock
        </span>
        <h2 className="text-xl font-bold text-on-surface mb-2">Self-Hosted Runners Not Available</h2>
        <p className="text-sm text-outline max-w-md mb-6">
          This feature requires the GitHub App to have the{' '}
          <span className="font-semibold text-on-surface-variant">Self-hosted runners (Read)</span>{' '}
          organization permission. Please contact your GitHub organization admin to update the app
          permissions.
        </p>
        <a
          href="https://docs.github.com/en/apps/maintaining-github-apps/editing-a-github-apps-permissions"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary text-sm rounded-lg hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
          GitHub App Permissions Docs
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 text-center">
        <p className="text-error text-sm">{error}</p>
        <button
          onClick={() => { setLoading(true); fetchRunners(); }}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary text-sm rounded-lg hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3 border-b border-outline-variant/10">
        {/* Search */}
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-outline material-symbols-outlined leading-none"
            style={{ fontSize: '16px' }}
          >
            search
          </span>
          <input
            type="text"
            placeholder="Search runners..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-surface-container-highest rounded-lg pl-9 pr-8 py-1.5 w-56 text-xs text-on-surface border-none outline-none focus:ring-1 focus:ring-primary/40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface material-symbols-outlined leading-none"
              style={{ fontSize: '14px' }}
            >
              close
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-container-highest rounded-lg px-3 py-1.5 text-xs text-on-surface-variant border-none outline-none focus:ring-1 focus:ring-primary/40"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Label filter */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter by label..."
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="bg-surface-container-highest rounded-lg px-3 py-1.5 w-40 text-xs text-on-surface-variant border-none outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>

          {/* Manual refresh */}
          <button
            onClick={() => { setLoading(true); fetchRunners(); }}
            title="Refresh"
            className="p-1.5 text-on-surface-variant hover:text-primary material-symbols-outlined transition-colors leading-none"
            style={{ fontSize: '18px' }}
          >
            refresh
          </button>
        </div>
      </div>

      {/* Summary stats bar */}
      <div className="px-6 py-5 flex items-center gap-4 flex-wrap sticky top-0 bg-surface z-40">
        <h2 className="text-2xl font-extrabold tracking-tighter text-on-surface">Runners</h2>
        <div className="h-6 w-px bg-outline-variant/20 mx-1" />

        {/* Total */}
        <div className="flex items-center gap-2 bg-surface-container border border-outline-variant/20 rounded-full pl-2 pr-3 py-1">
          <span
            className="material-symbols-outlined text-on-surface-variant leading-none"
            style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
          >
            precision_manufacturing
          </span>
          <span className="text-xs font-bold text-on-surface">{summary.total}</span>
          <span className="text-[10px] uppercase font-bold text-on-surface-variant/70 tracking-tighter">
            Total
          </span>
        </div>

        {/* Idle/Online */}
        <div className="flex items-center gap-2 bg-secondary/10 border border-secondary/20 rounded-full pl-2 pr-3 py-1">
          <span className="w-2 h-2 rounded-full bg-secondary" />
          <span className="text-xs font-bold text-secondary">{summary.online}</span>
          <span className="text-[10px] uppercase font-bold text-secondary/70 tracking-tighter">
            Idle
          </span>
        </div>

        {/* Busy */}
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full pl-2 pr-3 py-1">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-bold text-primary">{summary.busy}</span>
          <span className="text-[10px] uppercase font-bold text-primary/70 tracking-tighter">
            Busy
          </span>
        </div>

        {/* Offline */}
        <div className="flex items-center gap-2 bg-error/10 border border-error/20 rounded-full pl-2 pr-3 py-1">
          <span className="w-2 h-2 rounded-full bg-error" />
          <span className="text-xs font-bold text-error">{summary.offline}</span>
          <span className="text-[10px] uppercase font-bold text-error/70 tracking-tighter">
            Offline
          </span>
        </div>
      </div>

      {/* Runner groups */}
      <div className="px-6">
        {filteredRunners.length === 0 ? (
          <div className="text-center py-16 bg-primary/5 border border-primary/10 rounded-xl">
            <span
              className="material-symbols-outlined text-outline mb-3 block"
              style={{ fontSize: '40px' }}
            >
              precision_manufacturing
            </span>
            <p className="text-outline text-sm">
              {runners.length === 0
                ? 'No self-hosted runners found across your installations.'
                : 'No runners match your current filters.'}
            </p>
          </div>
        ) : (
          groupEntries.map(([groupName, groupRunners]) => (
            <RunnerGroup
              key={groupName || '__default__'}
              groupName={groupName}
              runners={groupRunners}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default RunnersView;
