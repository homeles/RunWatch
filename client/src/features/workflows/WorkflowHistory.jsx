import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import StatusChip from '../../common/components/StatusChip';
import { formatDuration, formatDate } from '../../common/utils/statusHelpers';
import apiService from '../../api/apiService';
import { setupSocketListeners } from '../../api/socketService';

const WorkflowHistory = () => {
  const { repoName, workflowName } = useParams();
  const navigate = useNavigate();
  const [workflowRuns, setWorkflowRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [syncingRun, setSyncingRun] = useState(null);
  const [deletingRun, setDeletingRun] = useState(null);
  const [filter, setFilter] = useState('all');

  const calculateStats = (runs) => {
    if (!runs.length) return null;

    const completedRuns = runs.filter(run => run.run?.status === 'completed');
    const successfulRuns = runs.filter(run => run.run?.conclusion === 'success');
    const failedRuns = runs.filter(run => run.run?.conclusion === 'failure');

    const durations = completedRuns
      .map(run => {
        if (!run.run) return null;
        const start = new Date(run.run.created_at);
        const end = new Date(run.run.updated_at);
        const duration = end - start;
        return duration >= 0 ? duration : null;
      })
      .filter(Boolean);

    const avgDuration = durations.length
      ? Math.floor(durations.reduce((acc, curr) => acc + curr, 0) / durations.length)
      : 0;

    const successRate = completedRuns.length
      ? (successfulRuns.length / completedRuns.length) * 100
      : 0;

    return {
      totalRuns: runs.filter(run => run.run).length,
      successfulRuns: successfulRuns.length,
      failedRuns: failedRuns.length,
      averageDuration: avgDuration,
      successRate,
      lastRun: runs[0]?.run?.updated_at,
      trendsData: generateTrendsData(runs.filter(run => run.run)),
    };
  };

  const generateTrendsData = (runs) => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    const dailyStats = last7Days.map(date => {
      const dayRuns = runs.filter(run => run.run.created_at.startsWith(date));
      return {
        date,
        total: dayRuns.length,
        successful: dayRuns.filter(run => run.run.conclusion === 'success').length,
        failed: dayRuns.filter(run => run.run.conclusion === 'failure').length,
      };
    });

    return {
      labels: dailyStats.map(stat => new Date(stat.date).toLocaleDateString('en-US', { weekday: 'short' })),
      datasets: [
        {
          label: 'Total Runs',
          data: dailyStats.map(stat => stat.total),
          borderColor: 'rgba(162, 201, 255, 1)',
          backgroundColor: 'rgba(162, 201, 255, 0.1)',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Successful',
          data: dailyStats.map(stat => stat.successful),
          borderColor: 'rgba(103, 223, 112, 1)',
          backgroundColor: 'rgba(103, 223, 112, 0.1)',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Failed',
          data: dailyStats.map(stat => stat.failed),
          borderColor: 'rgba(255, 180, 171, 1)',
          backgroundColor: 'rgba(255, 180, 171, 0.1)',
          tension: 0.4,
          fill: true,
        },
      ],
    };
  };

  const handleSyncRun = async (e, runId) => {
    e.stopPropagation();
    try {
      setSyncingRun(runId);
      await apiService.syncWorkflowRun(runId);
    } catch (error) {
      console.error('Error syncing workflow run:', error);
    } finally {
      setSyncingRun(null);
    }
  };

  const handleDeleteRun = async (e, runId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this workflow run record?')) return;
    try {
      setDeletingRun(runId);
      await apiService.deleteWorkflowRun(runId);
      setWorkflowRuns(prev => {
        const updated = prev.filter(w => w.run.id !== runId);
        setStats(calculateStats(updated));
        return updated;
      });
    } catch (error) {
      console.error('Error deleting workflow run:', error);
    } finally {
      setDeletingRun(null);
    }
  };

  const fetchWorkflowHistory = async () => {
    try {
      setLoading(true);
      const response = await apiService.getRepoWorkflowRuns(
        decodeURIComponent(repoName),
        decodeURIComponent(workflowName)
      );
      setWorkflowRuns(response.data);
      setStats(calculateStats(response.data));
      setError(null);
    } catch (err) {
      setError('Failed to fetch workflow history. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflowHistory();

    const cleanupListeners = setupSocketListeners({
      onWorkflowUpdate: (updatedWorkflow) => {
        if (updatedWorkflow.workflow.name === decodeURIComponent(workflowName) &&
            updatedWorkflow.repository.fullName === decodeURIComponent(repoName)) {
          setWorkflowRuns(prev => {
            const updated = prev.map(workflow =>
              workflow.run?.id === updatedWorkflow.run.id ? updatedWorkflow : workflow
            );
            setStats(calculateStats(updated));
            return updated;
          });
        }
      },
      onJobsUpdate: (workflowWithJobs) => {
        if (workflowWithJobs.workflow.name === decodeURIComponent(workflowName) &&
            workflowWithJobs.repository.fullName === decodeURIComponent(repoName)) {
          setWorkflowRuns(prev => {
            const updated = prev.map(workflow =>
              workflow.run.id === workflowWithJobs.run.id ? workflowWithJobs : workflow
            );
            setStats(calculateStats(updated));
            return updated;
          });
        }
      },
      onWorkflowDeleted: ({ runId }) => {
        setWorkflowRuns(prev => {
          const updated = prev.filter(w => w.run.id !== runId);
          setStats(calculateStats(updated));
          return updated;
        });
      }
    });

    return () => cleanupListeners();
  }, [repoName, workflowName]);

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
        <p className="text-error">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm hover:bg-primary/20"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(65, 71, 82, 0.3)' },
        ticks: { color: '#8b919d', font: { size: 10 } },
      },
      x: {
        grid: { color: 'rgba(65, 71, 82, 0.3)' },
        ticks: { color: '#8b919d', font: { size: 10 } },
      },
    },
  };

  const repoParts = decodeURIComponent(repoName).split('/');
  const org = repoParts[0];
  const repo = repoParts.slice(1).join('/');
  const decodedWorkflow = decodeURIComponent(workflowName);

  const filteredRuns = workflowRuns.filter(w => {
    if (!w.run) return false;
    if (filter === 'success') return w.run.conclusion === 'success';
    if (filter === 'failure') return w.run.conclusion === 'failure';
    return true;
  });

  return (
    <div className="pb-12">
      {/* Hero Header */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 mb-8 border-b border-outline-variant/10">
        <div className="space-y-3">
          <nav className="flex items-center gap-2 text-sm text-outline font-medium flex-wrap">
            <button
              onClick={() => navigate('/')}
              className="hover:text-on-surface transition-colors"
            >
              Dashboard
            </button>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span>{org}</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span>{repo}</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-on-surface font-semibold">{decodedWorkflow}</span>
          </nav>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '1.75rem' }}>terminal</span>
            <h1 className="text-3xl font-extrabold tracking-tighter text-on-surface">{decodedWorkflow}</h1>
          </div>
        </div>
        <div className="flex gap-10 items-end shrink-0">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-outline mb-1 font-bold">Avg Duration</span>
            <div className="text-2xl font-mono font-bold text-on-surface">
              {formatDuration(stats?.averageDuration || 0)}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-outline mb-1 font-bold">Success Rate</span>
            <div className="text-2xl font-mono font-bold text-secondary">
              {stats?.successRate?.toFixed(1) ?? '0.0'}%
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-outline mb-1 font-bold">Total Runs</span>
            <div className="text-2xl font-mono font-bold text-primary">
              {stats?.totalRuns ?? 0}
            </div>
          </div>
        </div>
      </section>

      {/* Chart + Controls Grid */}
      <div className="grid grid-cols-12 gap-8 mb-8">
        {/* Activity Chart */}
        <div className="col-span-12 lg:col-span-8 bg-surface-container-low p-6 rounded-xl border border-outline-variant/5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none select-none">
            <span className="material-symbols-outlined" style={{ fontSize: '6rem' }}>show_chart</span>
          </div>
          <div className="flex items-center justify-between mb-6 relative z-10">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">insights</span>
              Activity Trends
            </h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-outline">
                <span className="w-3 h-3 rounded-full bg-primary" style={{ boxShadow: '0 0 8px rgba(162,201,255,0.4)' }}></span>
                Total
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-outline">
                <span className="w-3 h-3 rounded-full bg-secondary" style={{ boxShadow: '0 0 8px rgba(103,223,112,0.4)' }}></span>
                Success
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-outline">
                <span className="w-3 h-3 rounded-full bg-error" style={{ boxShadow: '0 0 8px rgba(255,180,171,0.4)' }}></span>
                Failed
              </div>
            </div>
          </div>
          <div className="h-48 relative z-10">
            {stats?.trendsData && <Line data={stats.trendsData} options={chartOptions} />}
          </div>
        </div>

        {/* Quick Controls */}
        <div className="col-span-12 lg:col-span-4 bg-surface-container-low p-6 rounded-xl border border-outline-variant/5 shadow-2xl space-y-6">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">bolt</span>
            Quick Controls
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => window.open(`https://github.com/${decodeURIComponent(repoName)}/actions`, '_blank', 'noopener,noreferrer')}
              className="flex flex-col items-center justify-center p-4 bg-surface-container rounded-lg border border-outline-variant/10 hover:bg-surface-container-high transition-colors group"
            >
              <span className="material-symbols-outlined text-primary mb-2 group-hover:scale-110 transition-transform">open_in_new</span>
              <span className="text-xs font-bold text-on-surface">View on GitHub</span>
            </button>
            <button
              onClick={fetchWorkflowHistory}
              className="flex flex-col items-center justify-center p-4 bg-surface-container rounded-lg border border-outline-variant/10 hover:bg-surface-container-high transition-colors group"
            >
              <span className="material-symbols-outlined text-secondary mb-2 group-hover:scale-110 transition-transform">sync</span>
              <span className="text-xs font-bold text-on-surface">Refresh</span>
            </button>
          </div>
          <div className="p-4 bg-surface-container-lowest rounded-lg border-l-4 border-primary">
            <p className="text-[10px] uppercase tracking-widest text-outline mb-1 font-bold">Last Run</p>
            <p className="text-sm font-bold text-on-surface">
              {stats?.lastRun ? formatDate(stats.lastRun) : '—'}
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-outline font-bold">Summary</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Successful</span>
              <span className="text-xs font-mono font-bold text-secondary">{stats?.successfulRuns ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-on-surface-variant">Failed</span>
              <span className="text-xs font-mono font-bold text-error">{stats?.failedRuns ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Runs Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-3">
              <span className="material-symbols-outlined">list_alt</span>
              Recent Workflow Runs
            </h3>
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full border border-primary/20">
              {stats?.totalRuns ?? 0} TOTAL
            </span>
          </div>
          <div className="flex bg-surface-container p-0.5 rounded border border-outline-variant/10">
            {['all', 'success', 'failure'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-sm text-[10px] font-bold capitalize transition-colors ${
                  filter === f
                    ? 'bg-surface-container-high text-primary'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                {f === 'all' ? 'All' : f === 'success' ? 'Success' : 'Failure'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden bg-surface-container-low rounded-lg border border-outline-variant/10 shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container text-outline text-[9px] font-extrabold uppercase tracking-widest border-b border-outline-variant/10">
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Run #</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Labels</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-outline text-sm">
                    No runs found
                  </td>
                </tr>
              ) : (
                filteredRuns.map((workflow) => (
                  <tr
                    key={workflow.run.id}
                    onClick={() => navigate(`/workflow/${workflow.run.id}`)}
                    className="hover:bg-surface-container/50 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {workflow.run.conclusion === 'success' ? (
                          <>
                            <span
                              className="material-symbols-outlined text-secondary text-lg"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              check_circle
                            </span>
                            <span className="text-[11px] font-bold text-secondary">Success</span>
                          </>
                        ) : workflow.run.conclusion === 'failure' ? (
                          <>
                            <span
                              className="material-symbols-outlined text-error text-lg"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              cancel
                            </span>
                            <span className="text-[11px] font-bold text-error">Failed</span>
                          </>
                        ) : (
                          <StatusChip status={workflow.run.status} conclusion={workflow.run.conclusion} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] font-bold text-on-surface">
                      {workflow.run.number ? `#${workflow.run.number}` : '#-'}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-outline">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="material-symbols-outlined text-xs">account_tree</span>
                        {workflow.run.head_branch || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-outline font-mono">
                      {workflow.run.event || '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {workflow.run.labels?.map((label, index) => (
                          <span
                            key={index}
                            className="px-1.5 py-0.5 bg-surface-container-highest text-[8px] font-bold rounded text-on-surface-variant border border-outline-variant/10"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-on-surface">
                      {formatDuration(workflow.run.created_at, workflow.run.updated_at)}
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-outline">
                      {formatDate(workflow.run.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(workflow.run.url, '_blank', 'noopener,noreferrer');
                          }}
                          title="View on GitHub"
                          className="p-1 hover:bg-surface-container-highest rounded transition-colors text-outline hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-xs">open_in_new</span>
                        </button>
                        <button
                          onClick={(e) => handleSyncRun(e, workflow.run.id)}
                          disabled={syncingRun === workflow.run.id}
                          title="Sync"
                          className="p-1 hover:bg-surface-container-highest rounded transition-colors text-outline hover:text-on-surface disabled:opacity-50"
                        >
                          {syncingRun === workflow.run.id ? (
                            <span className="inline-block w-3 h-3 border border-outline border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span className="material-symbols-outlined text-xs">sync</span>
                          )}
                        </button>
                        <button
                          onClick={(e) => handleDeleteRun(e, workflow.run.id)}
                          disabled={deletingRun === workflow.run.id}
                          title="Delete"
                          className="p-1 hover:bg-surface-container-highest rounded transition-colors text-outline hover:text-error disabled:opacity-50"
                        >
                          {deletingRun === workflow.run.id ? (
                            <span className="inline-block w-3 h-3 border border-error border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span className="material-symbols-outlined text-xs">delete</span>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WorkflowHistory;
