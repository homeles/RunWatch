import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiService from '../../api/apiService';
import { setupSocketListeners, socket, defaultAlertConfig } from '../../api/socketService';
import { formatDuration, formatDate } from '../../common/utils/statusHelpers';
import { ToastContainer } from 'react-toastify';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const getDotClass = (run) => {
  const activeStatuses = ['in_progress', 'queued', 'waiting', 'pending', 'requested'];
  if (activeStatuses.includes(run.status)) {
    return run.status === 'in_progress' ? 'bg-primary animate-pulse' : 'bg-tertiary animate-pulse';
  }
  switch (run.conclusion) {
    case 'success': return 'bg-secondary';
    case 'failure': return 'bg-error';
    case 'cancelled':
    case 'skipped': return 'bg-outline-variant';
    case 'timed_out':
    case 'action_required':
    case 'neutral': return 'bg-tertiary';
    default: return 'bg-outline-variant';
  }
};

const CARD_BORDER_COLORS = ['border-secondary', 'border-primary', 'border-tertiary', 'border-error'];

// Compute success-rate-based border color for a repo card
const getRepoBorderColor = (repoData) => {
  let total = 0;
  let success = 0;
  Object.values(repoData.workflows).forEach((wf) => {
    wf.runs.forEach((r) => {
      if (r.run.status === 'completed') {
        total++;
        if (r.run.conclusion === 'success') success++;
      }
    });
  });
  if (total === 0) return 'border-outline-variant'; // no completed runs
  const rate = (success / total) * 100;
  if (rate >= 80) return 'border-secondary';
  if (rate >= 50) return 'border-tertiary';
  return 'border-error';
};

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Queued', value: 'queued' },
  { label: 'Waiting', value: 'waiting' },
  { label: 'Pending', value: 'pending' },
  { label: 'Success', value: 'success', isConclusion: true },
  { label: 'Failure', value: 'failure', isConclusion: true },
  { label: 'Cancelled', value: 'cancelled', isConclusion: true },
  { label: 'Timed Out', value: 'timed_out', isConclusion: true },
  { label: 'Skipped', value: 'skipped', isConclusion: true },
];

// ─── RepoCard ─────────────────────────────────────────────────────────────────

const RepoCard = ({ repoKey, repoData, borderColor, navigate, longQueuedWorkflows }) => {
  const [expanded, setExpanded] = useState(false);
  const workflowEntries = Object.entries(repoData.workflows);
  const visibleLimit = 5;
  const hasExtra = workflowEntries.length > visibleLimit;
  const visibleWorkflows = expanded ? workflowEntries : workflowEntries.slice(0, visibleLimit);
  const hiddenCount = workflowEntries.length - visibleLimit;

  return (
    <div
      className={`repo-card bg-surface-container p-4 rounded-xl border-l-4 ${borderColor} hover:bg-surface-container-high transition-all group flex flex-col h-fit min-h-[160px]`}
    >
      {/* Repo header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h4
          className="font-bold text-on-surface truncate tracking-tight group-hover:text-primary transition-colors text-xs cursor-pointer"
          onClick={() => navigate(`/repository/${encodeURIComponent(repoKey)}`)}
        >
          {repoData.repoShortName}
        </h4>
        <a
          href={`https://github.com/${repoKey}`}
          target="_blank"
          rel="noopener noreferrer"
          className="material-symbols-outlined text-outline group-hover:text-on-surface transition-colors"
          style={{ fontSize: '14px' }}
        >
          open_in_new
        </a>
      </div>

      {/* Workflow rows */}
      <div className="flex-grow space-y-1">
        {visibleWorkflows.map(([workflowKey, workflowData]) => {
          const latestRun = workflowData.runs[0];
          const longQueuedRuns = workflowData.runs.filter(
            (w) => longQueuedWorkflows[w.run.id] && w.workflow.name === workflowKey
          );
          const isLongQueued = longQueuedRuns.length > 0;
          const maxQueuedMinutes = isLongQueued
            ? longQueuedRuns.reduce(
                (max, w) => Math.max(max, longQueuedWorkflows[w.run.id].queuedMinutes),
                0
              )
            : 0;

          return (
            <div key={workflowKey} className="space-y-1 py-1.5 border-b border-outline-variant/5 last:border-0">
              <div className="flex items-center justify-between">
                <span
                  className="text-[9px] font-semibold text-outline truncate cursor-pointer hover:text-primary transition-colors"
                  onClick={() =>
                    navigate(
                      `/workflow-history/${encodeURIComponent(repoKey)}/${encodeURIComponent(workflowKey)}`
                    )
                  }
                >
                  {workflowKey}
                  {isLongQueued && (
                    <span
                      title={`Workflow has been queued for ${maxQueuedMinutes} minutes`}
                      className="ml-1"
                    >
                      ⚠️
                    </span>
                  )}
                </span>
                <span className="text-[8px] text-outline/40 flex-shrink-0 ml-1">
                  {latestRun ? timeAgo(latestRun.run.updated_at) : ''}
                </span>
              </div>
              <div className="flex gap-1">
                {workflowData.runs.slice(0, 10).map((workflow) => (
                  <div key={workflow.run.id} className="relative group/dot flex items-center justify-center">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${getDotClass(workflow.run)} cursor-pointer`}
                      title={`Status: ${workflow.run.conclusion || workflow.run.status}\nDuration: ${formatDuration(workflow.run.created_at, workflow.run.updated_at)}\n${formatDate(workflow.run.updated_at)}`}
                      onClick={() => window.open(workflow.run.url, '_blank', 'noopener,noreferrer')}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand/collapse for >5 workflows */}
      {hasExtra && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 pt-1 border-t border-outline-variant/10 flex items-center justify-between text-[8px] font-bold text-primary/60 hover:text-primary uppercase tracking-tighter flex-shrink-0 w-full transition-colors"
        >
          <span>{expanded ? 'SHOW LESS' : `+ ${hiddenCount} WORKFLOWS`}</span>
          <span
            className={`material-symbols-outlined transition-transform ${expanded ? 'rotate-180' : ''}`}
            style={{ fontSize: '10px' }}
          >
            expand_more
          </span>
        </button>
      )}
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const searchInputRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [workflowRuns, setWorkflowRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState(() => {
    const saved = localStorage.getItem('dashboardSearchQuery');
    return saved || '';
  });
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [pagination, setPagination] = useState({
    total: 0,
    page: parseInt(searchParams.get('page') || '1', 10),
    pageSize: parseInt(localStorage.getItem('dashboardPageSize') || '30', 10),
    totalPages: 1,
  });
  const [buildMetrics, setBuildMetrics] = useState({});
  const [jobMetrics, setJobMetrics] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [alertConfig, setAlertConfig] = useState(() => {
    const savedConfig = localStorage.getItem('alertConfig');
    return savedConfig ? JSON.parse(savedConfig) : defaultAlertConfig;
  });
  const [longQueuedWorkflows, setLongQueuedWorkflows] = useState({});
  const [activeOrg, setActiveOrg] = useState(() => searchParams.get('org') || null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const pageSizeOptions = [30, 50, 100];
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('dashboardPageSize', pagination.pageSize.toString());
  }, [pagination.pageSize]);

  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('page', pagination.page.toString());
    setSearchParams(newSearchParams);
  }, [pagination.page, setSearchParams]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchWorkflowRuns = async () => {
    try {
      setLoading(true);
      const response = await apiService.getWorkflowRuns(
        pagination.page,
        pagination.pageSize,
        debouncedSearchQuery,
        statusFilter
      );
      setWorkflowRuns(response.data);
      setPagination((prev) => ({ ...prev, ...response.pagination }));
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError('Failed to fetch workflow runs. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflowRuns();
  }, [pagination.page, pagination.pageSize, debouncedSearchQuery, statusFilter]);

  // Basic socket listeners (new/update/jobs)
  useEffect(() => {
    const cleanupListeners = setupSocketListeners({
      onNewWorkflow: (newWorkflow) => {
        setWorkflowRuns((prev) => {
          if (pagination.page !== 1) return prev;
          const exists = prev.some((workflow) => workflow.run.id === newWorkflow.run.id);
          if (exists) {
            return prev.map((workflow) =>
              workflow.run.id === newWorkflow.run.id ? newWorkflow : workflow
            );
          }
          if (prev.length < pagination.pageSize) {
            return [newWorkflow, ...prev];
          }
          return prev;
        });
        setPagination((prev) => ({
          ...prev,
          total: prev.total + 1,
          totalPages: Math.ceil((prev.total + 1) / prev.pageSize),
        }));
      },
      onWorkflowUpdate: (updatedWorkflow) => {
        setWorkflowRuns((prev) => {
          if (!prev.some((workflow) => workflow.run.id === updatedWorkflow.run.id)) return prev;
          return prev.map((workflow) =>
            workflow.run.id === updatedWorkflow.run.id ? updatedWorkflow : workflow
          );
        });
      },
      onJobsUpdate: (workflowWithJobs) => {
        setWorkflowRuns((prev) => {
          if (!prev.some((workflow) => workflow.run.id === workflowWithJobs.run.id)) return prev;
          return prev.map((workflow) =>
            workflow.run.id === workflowWithJobs.run.id ? workflowWithJobs : workflow
          );
        });
      },
    });
    return () => cleanupListeners();
  }, [pagination.page, pagination.pageSize]);

  // Focus search input when loading completes
  useEffect(() => {
    if (!loading && searchQuery && searchInputRef.current) {
      searchInputRef.current.focus();
      const length = searchInputRef.current.value.length;
      searchInputRef.current.setSelectionRange(length, length);
    }
  }, [loading, searchQuery]);

  // Group workflows by org → repo → workflow name
  const groupedWorkflows = useMemo(() => {
    const groups = {};
    workflowRuns.forEach((workflow) => {
      const [orgName, repoShortName] = workflow.repository.fullName.split('/');
      const repoKey = workflow.repository.fullName;
      const workflowKey = workflow.workflow.name;

      if (!groups[orgName]) {
        groups[orgName] = { repositories: {} };
      }
      if (!groups[orgName].repositories[repoKey]) {
        groups[orgName].repositories[repoKey] = { workflows: {}, repoShortName };
      }
      if (!groups[orgName].repositories[repoKey].workflows[workflowKey]) {
        groups[orgName].repositories[repoKey].workflows[workflowKey] = { runs: [], history: [] };
      }

      const workflowGroup = groups[orgName].repositories[repoKey].workflows[workflowKey];
      workflowGroup.runs.push(workflow);

      if (
        workflow.run.status === 'completed' &&
        !workflowGroup.history.some((h) => h.id === workflow.run.id)
      ) {
        workflowGroup.history.unshift({ id: workflow.run.id, conclusion: workflow.run.conclusion });
        if (workflowGroup.history.length > 5) workflowGroup.history.pop();
      }
    });

    Object.values(groups).forEach((org) => {
      Object.values(org.repositories).forEach((repo) => {
        Object.values(repo.workflows).forEach((workflow) => {
          workflow.runs.sort((a, b) => new Date(b.run.created_at) - new Date(a.run.created_at));
        });
      });
    });

    return groups;
  }, [workflowRuns]);

  const paginatedGroupedWorkflows = useMemo(
    () => ({
      groups: groupedWorkflows,
      totalPages: pagination.totalPages,
      totalRepos: pagination.total,
    }),
    [groupedWorkflows, pagination]
  );

  const handleClearSearch = () => {
    setSearchQuery('');
    localStorage.removeItem('dashboardSearchQuery');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    localStorage.setItem('dashboardSearchQuery', value);
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
    window.scrollTo(0, 0);
  };

  const handlePageSizeChange = (e) => {
    const newPageSize = parseInt(e.target.value, 10);
    setPagination((prev) => ({
      ...prev,
      pageSize: newPageSize,
      page: 1,
      totalPages: Math.ceil(prev.total / newPageSize),
    }));
  };

  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Metrics fetching
  const fetchMetrics = async () => {
    try {
      const [workflowMetrics, jobMetricsData] = await Promise.all([
        apiService.getWorkflowMetrics(),
        apiService.getJobMetrics(),
      ]);
      setBuildMetrics(workflowMetrics);
      setJobMetrics(jobMetricsData);
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
    }
  };

  const metricsTimerRef = useRef(null);
  const debouncedFetchMetrics = () => {
    if (metricsTimerRef.current) clearTimeout(metricsTimerRef.current);
    metricsTimerRef.current = setTimeout(fetchMetrics, 2000);
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => {
      clearInterval(interval);
      if (metricsTimerRef.current) clearTimeout(metricsTimerRef.current);
    };
  }, []);

  // Enhanced socket listeners (metrics + long-queued alerts)
  useEffect(() => {
    const cleanupListeners = setupSocketListeners({
      onNewWorkflow: (newWorkflow) => {
        setWorkflowRuns((prev) => {
          if (pagination.page !== 1) return prev;
          const exists = prev.some((workflow) => workflow.run.id === newWorkflow.run.id);
          if (exists) {
            return prev.map((workflow) =>
              workflow.run.id === newWorkflow.run.id ? newWorkflow : workflow
            );
          }
          if (prev.length < pagination.pageSize) {
            return [newWorkflow, ...prev];
          }
          return prev;
        });
        debouncedFetchMetrics();
      },
      onWorkflowUpdate: (updatedWorkflow) => {
        setWorkflowRuns((prev) => {
          if (!prev.some((workflow) => workflow.run.id === updatedWorkflow.run.id)) return prev;
          return prev.map((workflow) => {
            if (workflow.run.id === updatedWorkflow.run.id) {
              if (workflow.run.status !== updatedWorkflow.run.status) {
                debouncedFetchMetrics();
              }
              return updatedWorkflow;
            }
            return workflow;
          });
        });
      },
      onLongQueuedWorkflow: (data) => {
        console.log('Dashboard received long-queued-workflow event:', data);
        setLongQueuedWorkflows((prev) => ({
          ...prev,
          [data.id]: {
            workflow: data.workflow,
            repository: data.repository,
            queuedMinutes: data.queuedMinutes,
          },
        }));
      },
      alertConfig: alertConfig,
    });

    // Direct listener as fallback
    socket.on('long-queued-workflow', (data) => {
      console.log('Direct socket listener received long-queued-workflow:', data);
      setLongQueuedWorkflows((prev) => ({
        ...prev,
        [data.id]: {
          workflow: data.workflow,
          repository: data.repository,
          queuedMinutes: data.queuedMinutes,
        },
      }));
    });

    return () => cleanupListeners();
  }, [pagination.page, pagination.pageSize, alertConfig]);

  useEffect(() => {
    localStorage.setItem('alertConfig', JSON.stringify(alertConfig));
  }, [alertConfig]);

  // ─── Derived state ────────────────────────────────────────────────────────────

  const orgNames = Object.keys(paginatedGroupedWorkflows.groups);
  const currentOrg =
    activeOrg && orgNames.includes(activeOrg) ? activeOrg : orgNames[0] ?? null;
  const currentOrgData = currentOrg ? paginatedGroupedWorkflows.groups[currentOrg] : null;

  const generatePages = (current, total) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push('...');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i);
    }
    if (current < total - 2) pages.push('...');
    if (total > 1) pages.push(total);
    return pages;
  };

  const lastUpdatedText = lastUpdated ? timeAgo(lastUpdated.toISOString()) : null;

  // ─── Render ───────────────────────────────────────────────────────────────────

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
          onClick={fetchWorkflowRuns}
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
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />

      {/* Toolbar: search + filters */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-outline-variant/10">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-outline material-symbols-outlined leading-none" style={{ fontSize: '16px' }}>
            search
          </span>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search repositories..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="bg-surface-container-highest rounded-lg pl-9 pr-8 py-1.5 w-56 text-xs text-on-surface border-none outline-none focus:ring-1 focus:ring-primary/40"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface material-symbols-outlined leading-none"
              style={{ fontSize: '14px' }}
            >
              close
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={pagination.pageSize}
            onChange={handlePageSizeChange}
            className="bg-surface-container-highest rounded-lg px-3 py-1.5 text-xs text-on-surface-variant border-none outline-none focus:ring-1 focus:ring-primary/40"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={handleStatusFilterChange}
            className="bg-surface-container-highest rounded-lg px-3 py-1.5 text-xs text-on-surface-variant border-none outline-none focus:ring-1 focus:ring-primary/40"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            onClick={fetchWorkflowRuns}
            title="Refresh"
            className="p-1.5 text-on-surface-variant hover:text-primary material-symbols-outlined transition-colors leading-none"
            style={{ fontSize: '18px' }}
          >
            refresh
          </button>
        </div>
      </div>

      {/* Org Tabs */}
      {orgNames.length > 0 && (
        <div className="px-6 mt-4 border-b border-outline-variant/10">
          <div className="flex gap-8">
            {orgNames.map((org) => (
              <button
                key={org}
                onClick={() => setActiveOrg(org)}
                className={`pb-3 border-b-2 text-xs tracking-tight transition-colors ${
                  org === currentOrg
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-on-surface-variant font-medium hover:text-on-surface'
                }`}
              >
                {org}
              </button>
            ))}
          </div>
        </div>
      )}

      {orgNames.length === 0 ? (
        <div className="text-center py-16 mx-6 mt-6 bg-primary/5 border border-primary/10 rounded-xl">
          <p className="text-outline text-sm">
            {searchQuery
              ? 'No repositories match your search criteria.'
              : 'No workflow runs found. Waiting for GitHub webhook events...'}
          </p>
        </div>
      ) : (
        <>
          {/* Org Header + Metric Chips */}
          {currentOrg && (
            <div className="px-6 py-5 flex items-center justify-between sticky top-0 bg-surface z-40">
              <div className="flex items-center gap-4 flex-wrap">
                <h2 className="text-2xl font-extrabold tracking-tighter text-on-surface">
                  {currentOrg}
                </h2>
                <div className="h-6 w-px bg-outline-variant/20 mx-1" />
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Workflows Running */}
                  <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full pl-2 pr-3 py-1">
                    <span
                      className="material-symbols-outlined text-primary leading-none"
                      style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
                    >
                      play_arrow
                    </span>
                    <span className="text-xs font-bold text-primary">
                      {buildMetrics[currentOrg]?.inProgress || 0}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-primary/70 tracking-tighter">
                      Workflows Running
                    </span>
                  </div>
                  {/* Workflows Queued */}
                  <div className="flex items-center gap-2 bg-tertiary/10 border border-tertiary/20 rounded-full pl-2 pr-3 py-1">
                    <span
                      className="material-symbols-outlined text-tertiary leading-none"
                      style={{ fontSize: '14px' }}
                    >
                      pending
                    </span>
                    <span className="text-xs font-bold text-tertiary">
                      {buildMetrics[currentOrg]?.queued || 0}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-tertiary/70 tracking-tighter">
                      Workflows Queued
                    </span>
                  </div>
                  {/* Jobs Running */}
                  <div className="flex items-center gap-2 bg-secondary/10 border border-secondary/20 rounded-full pl-2 pr-3 py-1">
                    <span
                      className="material-symbols-outlined text-secondary leading-none"
                      style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
                    >
                      play_arrow
                    </span>
                    <span className="text-xs font-bold text-secondary">
                      {jobMetrics[currentOrg]?.inProgress || 0}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-secondary/70 tracking-tighter">
                      Jobs Running
                    </span>
                  </div>
                  {/* Jobs Queued */}
                  <div className="flex items-center gap-2 bg-[#9c27b0]/10 border border-[#9c27b0]/20 rounded-full pl-2 pr-3 py-1">
                    <span
                      className="material-symbols-outlined text-[#d1c4e9] leading-none"
                      style={{ fontSize: '14px' }}
                    >
                      pending
                    </span>
                    <span className="text-xs font-bold text-[#d1c4e9]">
                      {jobMetrics[currentOrg]?.queued || 0}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-[#d1c4e9]/70 tracking-tighter">
                      Jobs Queued
                    </span>
                  </div>
                </div>
              </div>
              {lastUpdatedText && (
                <span className="text-[11px] text-on-surface-variant font-medium">
                  Last updated: {lastUpdatedText}
                </span>
              )}
            </div>
          )}

          {/* Repo Grid */}
          {currentOrgData && (
            <div className="px-6 pb-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {Object.entries(currentOrgData.repositories).map(([repoKey, repoData], idx) => (
                <RepoCard
                  key={repoKey}
                  repoKey={repoKey}
                  repoData={repoData}
                  borderColor={getRepoBorderColor(repoData)}
                  navigate={navigate}
                  longQueuedWorkflows={longQueuedWorkflows}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {paginatedGroupedWorkflows.totalPages > 1 && (
            <div className="px-6 py-4 border-t border-outline-variant/5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-on-surface-variant">
                Showing{' '}
                {Math.min(
                  (pagination.page - 1) * pagination.pageSize + 1,
                  paginatedGroupedWorkflows.totalRepos
                )}
                –
                {Math.min(
                  pagination.page * pagination.pageSize,
                  paginatedGroupedWorkflows.totalRepos
                )}{' '}
                of{' '}
                <span className="text-on-surface">{paginatedGroupedWorkflows.totalRepos}</span>{' '}
                repositories
              </span>
              <div className="flex items-center gap-1">
                {generatePages(pagination.page, paginatedGroupedWorkflows.totalPages).map(
                  (p, i) =>
                    p === '...' ? (
                      <span
                        key={`ellipsis-${i}`}
                        className="px-1 text-on-surface-variant/40 text-xs"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => handlePageChange(p)}
                        className={`w-7 h-7 flex items-center justify-center rounded text-xs font-medium transition-colors ${
                          p === pagination.page
                            ? 'bg-primary text-on-primary-fixed font-bold'
                            : 'hover:bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        {p}
                      </button>
                    )
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
