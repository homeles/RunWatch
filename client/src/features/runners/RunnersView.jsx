import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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

const RunnerCard = ({ runner, onLabelClick, onStatusClick }) => {
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
        <button
          onClick={() => onStatusClick && onStatusClick(runner.status)}
          className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          title={`Filter by ${meta.label}`}
        >
          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
          <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
        </button>
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

      {/* Active job (when busy) */}
      {runner.status === 'busy' && runner.activeJob && (
        <div className="flex flex-col gap-1.5 bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11px] text-primary/80">
            <span
              className="material-symbols-outlined leading-none"
              style={{ fontSize: '13px' }}
            >
              play_circle
            </span>
            <span className="font-semibold truncate">{runner.activeJob.workflowName || 'Workflow'}</span>
            {runner.activeJob.jobName && (
              <span className="text-primary/50 truncate">/ {runner.activeJob.jobName}</span>
            )}
          </div>
          {runner.activeJob.repository && (
            <div className="text-[10px] text-primary/50 truncate ml-[21px]">{runner.activeJob.repository}</div>
          )}
          <div className="flex items-center gap-2 ml-[21px]">
            {runner.activeJob.workflowRunId && (
              <a
                href={`/workflow/${runner.activeJob.workflowRunId}`}
                className="text-[10px] font-medium text-primary hover:text-primary/80 hover:underline transition-colors"
                title="View in RunWatch"
              >
                RunWatch →
              </a>
            )}
            {runner.activeJob.workflowRunUrl && (
              <a
                href={runner.activeJob.workflowRunUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-medium text-primary/60 hover:text-primary/80 hover:underline transition-colors flex items-center gap-0.5"
                title="View on GitHub"
              >
                GitHub
                <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>open_in_new</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Labels */}
      {runner.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {runner.labels.map((label) => (
            <button
              key={label}
              onClick={() => onLabelClick && onLabelClick(label)}
              className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-medium text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors cursor-pointer"
              title={`Filter by "${label}"`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── RunnerGroup ──────────────────────────────────────────────────────────────

const RunnerGroup = ({ groupName, runners, onLabelClick, onStatusClick }) => {
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
            <RunnerCard key={runner.id} runner={runner} onLabelClick={onLabelClick} onStatusClick={onStatusClick} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── OrgSection ───────────────────────────────────────────────────────────────

const OrgSection = ({ orgName, runners, onLabelClick, onStatusClick }) => {
  const [collapsed, setCollapsed] = useState(false);

  // Group runners by runner group within this org
  const groupedByGroup = useMemo(() => {
    const groups = {};
    for (const runner of runners) {
      const key = runner.runnerGroup || '';
      if (!groups[key]) groups[key] = [];
      groups[key].push(runner);
    }
    return groups;
  }, [runners]);

  const groupEntries = Object.entries(groupedByGroup).sort(([a], [b]) => a.localeCompare(b));

  // Org-level stats
  const orgStats = useMemo(() => ({
    total: runners.length,
    idle: runners.filter((r) => r.status === 'idle').length,
    busy: runners.filter((r) => r.status === 'busy').length,
    offline: runners.filter((r) => r.status === 'offline').length,
  }), [runners]);

  return (
    <div className="mb-8">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-3 mb-4 group w-full text-left"
      >
        <span
          className={`material-symbols-outlined text-on-surface-variant transition-transform ${
            collapsed ? '-rotate-90' : ''
          }`}
          style={{ fontSize: '18px' }}
        >
          expand_more
        </span>
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>
          corporate_fare
        </span>
        <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
          {orgName}
        </span>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-[10px] font-semibold text-on-surface-variant/60">{orgStats.total} runners</span>
          {orgStats.idle > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              <span className="text-[10px] font-semibold text-secondary">{orgStats.idle}</span>
            </span>
          )}
          {orgStats.busy > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-[10px] font-semibold text-primary">{orgStats.busy}</span>
            </span>
          )}
          {orgStats.offline > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-error" />
              <span className="text-[10px] font-semibold text-error">{orgStats.offline}</span>
            </span>
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="ml-6 border-l border-outline-variant/10 pl-4">
          {groupEntries.map(([groupName, groupRunners]) => (
            <RunnerGroup
              key={groupName || '__default__'}
              groupName={groupName}
              runners={groupRunners}
              onLabelClick={onLabelClick}
              onStatusClick={onStatusClick}
            />
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
  const [totalSummary, setTotalSummary] = useState({ total: 0, online: 0, busy: 0, offline: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('');
  const [runnersAvailable, setRunnersAvailable] = useState(null); // null = checking
  const [cacheInfo, setCacheInfo] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef(null);

  const fetchRunners = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      // Always fetch ALL runners (no status filter on server)
      // so we can compute accurate total counts
      const data = await apiService.getRunners({});
      const allRunners = data.runners ?? [];
      const allSummary = data.summary ?? { total: 0, online: 0, busy: 0, offline: 0 };
      setTotalSummary(allSummary);
      setRunners(allRunners);
      setSummary(allSummary);
      setCacheInfo(data.cache ?? null);
      setError(null);
    } catch (err) {
      setError('Failed to fetch runners. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      await apiService.invalidateRunnerCache();
    } catch (err) {
      console.error('Failed to invalidate cache:', err);
    }
    await fetchRunners(false);
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
    fetchRunners(true); // Show spinner only on initial load
    intervalRef.current = setInterval(() => fetchRunners(false), 30000); // Silent refresh
    return () => clearInterval(intervalRef.current);
  }, [runnersAvailable]);

  // Client-side filtering (search, status, label)
  const filteredRunners = useMemo(() => {
    let result = runners;

    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.owner.toLowerCase().includes(q) ||
          (r.repo && r.repo.toLowerCase().includes(q))
      );
    }

    if (labelFilter) {
      const lf = labelFilter.toLowerCase();
      result = result.filter((r) =>
        r.labels.some((l) => l.toLowerCase().includes(lf))
      );
    }

    return result;
  }, [runners, searchQuery, labelFilter, statusFilter]);

  const handleLabelClick = useCallback((label) => {
    setLabelFilter(label);
  }, []);

  const handleStatusClick = useCallback((status) => {
    setStatusFilter((prev) => (prev === status ? 'all' : status));
  }, []);

  // Group by org
  const groupedByOrg = useMemo(() => {
    const orgs = {};
    for (const runner of filteredRunners) {
      const key = runner.owner || 'Unknown';
      if (!orgs[key]) orgs[key] = [];
      orgs[key].push(runner);
    }
    return orgs;
  }, [filteredRunners]);

  const orgEntries = Object.entries(groupedByOrg).sort(([a], [b]) => a.localeCompare(b));

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
          onClick={() => { fetchRunners(true); }}
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
        {/* Left: Search + Cache info + Refresh */}
        <div className="flex items-center gap-3">
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

          {/* Divider */}
          <div className="h-5 w-px bg-outline-variant/20" />

          {/* Cache info + Force refresh */}
          {cacheInfo && cacheInfo.cachedAt && (
            <span className="text-[10px] text-on-surface-variant/40" title={`Cache TTL: ${Math.round(cacheInfo.ttlMs / 1000)}s`}>
              {cacheInfo.ageMs != null
                ? `Cached ${Math.round(cacheInfo.ageMs / 1000)}s ago`
                : 'Fresh'}
            </span>
          )}
          <button
            onClick={handleForceRefresh}
            disabled={refreshing}
            title="Force refresh (bypass cache)"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              refreshing
                ? 'bg-primary/10 text-primary'
                : 'bg-surface-container-highest text-on-surface-variant hover:text-primary hover:bg-primary/10'
            }`}
          >
            <span
              className={`material-symbols-outlined leading-none ${refreshing ? 'animate-spin' : ''}`}
              style={{ fontSize: '14px' }}
            >
              refresh
            </span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Right: Filters */}
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
              className="bg-surface-container-highest rounded-lg px-3 py-1.5 w-40 text-xs text-on-surface border-none outline-none focus:ring-1 focus:ring-primary/40"
            />
            {labelFilter && (
              <button
                onClick={() => setLabelFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface material-symbols-outlined leading-none"
                style={{ fontSize: '14px' }}
              >
                close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary stats bar */}
      <div className="px-6 py-5 flex items-center gap-4 flex-wrap sticky top-0 bg-surface z-40">
        <h2 className="text-2xl font-extrabold tracking-tighter text-on-surface">Runners</h2>
        <div className="h-6 w-px bg-outline-variant/20 mx-1" />

        {/* Total */}
        <button
          onClick={() => setStatusFilter('all')}
          className={`flex items-center gap-2 bg-surface-container border rounded-full pl-2 pr-3 py-1 transition-all cursor-pointer hover:bg-surface-container-high ${
            statusFilter === 'all' ? 'border-on-surface/40 ring-1 ring-on-surface/20' : 'border-outline-variant/20'
          }`}
          title="Show all runners"
        >
          <span
            className="material-symbols-outlined text-on-surface-variant leading-none"
            style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
          >
            precision_manufacturing
          </span>
          <span className="text-xs font-bold text-on-surface">{totalSummary.total}</span>
          <span className="text-[10px] uppercase font-bold text-on-surface-variant/70 tracking-tighter">
            Total
          </span>
        </button>

        {/* Idle/Online */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'idle' ? 'all' : 'idle')}
          className={`flex items-center gap-2 bg-secondary/10 border rounded-full pl-2 pr-3 py-1 transition-all cursor-pointer hover:bg-secondary/20 ${
            statusFilter === 'idle' ? 'border-secondary/60 ring-1 ring-secondary/30' : 'border-secondary/20'
          }`}
          title="Filter by Idle"
        >
          <span className="w-2 h-2 rounded-full bg-secondary" />
          <span className="text-xs font-bold text-secondary">{totalSummary.online}</span>
          <span className="text-[10px] uppercase font-bold text-secondary/70 tracking-tighter">
            Idle
          </span>
        </button>

        {/* Busy */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'busy' ? 'all' : 'busy')}
          className={`flex items-center gap-2 bg-primary/10 border rounded-full pl-2 pr-3 py-1 transition-all cursor-pointer hover:bg-primary/20 ${
            statusFilter === 'busy' ? 'border-primary/60 ring-1 ring-primary/30' : 'border-primary/20'
          }`}
          title="Filter by Busy"
        >
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-bold text-primary">{totalSummary.busy}</span>
          <span className="text-[10px] uppercase font-bold text-primary/70 tracking-tighter">
            Busy
          </span>
        </button>

        {/* Offline */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}
          className={`flex items-center gap-2 bg-error/10 border rounded-full pl-2 pr-3 py-1 transition-all cursor-pointer hover:bg-error/20 ${
            statusFilter === 'offline' ? 'border-error/60 ring-1 ring-error/30' : 'border-error/20'
          }`}
          title="Filter by Offline"
        >
          <span className="w-2 h-2 rounded-full bg-error" />
          <span className="text-xs font-bold text-error">{totalSummary.offline}</span>
          <span className="text-[10px] uppercase font-bold text-error/70 tracking-tighter">
            Offline
          </span>
        </button>
      </div>

      {/* Runners grouped by org */}
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
          orgEntries.map(([orgName, orgRunners]) => (
            <OrgSection
              key={orgName}
              orgName={orgName}
              runners={orgRunners}
              onLabelClick={handleLabelClick}
              onStatusClick={handleStatusClick}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default RunnersView;
