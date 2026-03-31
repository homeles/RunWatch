import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { formatDuration } from '../../common/utils/statusHelpers';
import apiService from '../../api/apiService';
import { setupSocketListeners } from '../../api/socketService';

const RepositoryView = () => {
  const { repoName } = useParams();
  const navigate = useNavigate();
  const [repository, setRepository] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const calculateRepoStats = (runs) => {
    if (!runs.length) return null;

    const workflowStats = {};
    let totalRuns = 0;
    let successfulRuns = 0;
    let failedRuns = 0;
    let totalDuration = 0;
    let durationCount = 0;

    const allWorkflows = runs[0]?.repository?.workflows || [];
    allWorkflows.forEach(workflow => {
      workflowStats[workflow.name] = {
        total: 0,
        successful: 0,
        failed: 0,
        durations: [],
        lastRun: null,
        path: workflow.path,
        state: workflow.state,
        lastSyncedAt: workflow.lastSyncedAt
      };
    });

    runs.forEach(run => {
      const workflowName = run.workflow.name;
      if (!workflowStats[workflowName]) {
        workflowStats[workflowName] = {
          total: 0,
          successful: 0,
          failed: 0,
          durations: [],
          lastRun: null,
          path: run.workflow.path,
          state: 'active'
        };
      }

      const s = workflowStats[workflowName];

      // Skip 'skipped' and 'cancelled' runs from stats — they aren't real failures
      const conclusion = run.run.conclusion;
      if (conclusion === 'skipped' || conclusion === 'cancelled') {
        // Still track last run date but don't count in success/failure stats
        if (!s.lastRun || new Date(run.run.created_at) > new Date(s.lastRun)) {
          s.lastRun = run.run.created_at;
        }
        return;
      }

      s.total++;
      totalRuns++;

      if (conclusion === 'success') { s.successful++; successfulRuns++; }
      if (conclusion === 'failure') { s.failed++; failedRuns++; }

      const start = new Date(run.run.created_at);
      const end = new Date(run.run.updated_at);
      const duration = end - start;
      if (duration > 0) {
        s.durations.push(duration);
        totalDuration += duration;
        durationCount++;
      }

      if (!s.lastRun || new Date(run.run.created_at) > new Date(s.lastRun)) {
        s.lastRun = run.run.created_at;
      }
    });

    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return d.toISOString().split('T')[0];
    });

    const activityTrends = {
      labels: last30Days.map(date => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      datasets: [{
        label: 'Total Runs',
        data: last30Days.map(date => runs.filter(run => run.run.created_at.startsWith(date)).length),
        borderColor: 'rgba(88, 166, 255, 1)',
        backgroundColor: 'rgba(88, 166, 255, 0.1)',
        tension: 0.4,
        fill: true,
      }]
    };

    const workflowComparison = {
      labels: Object.keys(workflowStats),
      datasets: [
        {
          label: 'Success Rate (%)',
          data: Object.values(workflowStats).map(s =>
            s.total ? (s.successful / s.total * 100).toFixed(1) : 0
          ),
          backgroundColor: 'rgba(35, 197, 98, 0.6)',
          borderColor: 'rgba(35, 197, 98, 1)',
          borderWidth: 1,
        },
        {
          label: 'Average Duration (minutes)',
          data: Object.values(workflowStats).map(s => {
            const avg = s.durations.length
              ? s.durations.reduce((a, c) => a + c, 0) / s.durations.length
              : 0;
            return (avg / (1000 * 60)).toFixed(1);
          }),
          backgroundColor: 'rgba(88, 166, 255, 0.6)',
          borderColor: 'rgba(88, 166, 255, 1)',
          borderWidth: 1,
        },
      ],
    };

    // Calculate p95 duration
    const allDurations = [];
    Object.values(workflowStats).forEach(s => {
      allDurations.push(...s.durations);
    });
    allDurations.sort((a, b) => a - b);
    const p95Duration = allDurations.length > 0
      ? allDurations[Math.floor(allDurations.length * 0.95)]
      : 0;

    // Calculate failure trend (last 7d vs prior 7d)
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
    let recentFails = 0, recentTotal = 0, priorFails = 0, priorTotal = 0;
    runs.forEach(run => {
      const conclusion = run.run.conclusion;
      if (conclusion === 'skipped' || conclusion === 'cancelled') return;
      const created = new Date(run.run.created_at);
      if (created >= sevenDaysAgo) {
        recentTotal++;
        if (conclusion === 'failure') recentFails++;
      } else if (created >= fourteenDaysAgo) {
        priorTotal++;
        if (conclusion === 'failure') priorFails++;
      }
    });
    const recentFailRate = recentTotal ? (recentFails / recentTotal * 100) : 0;
    const priorFailRate = priorTotal ? (priorFails / priorTotal * 100) : 0;
    // trend: 'improving' if failure rate dropped, 'worsening' if increased, 'stable' otherwise
    const failureTrend = recentFailRate < priorFailRate - 5 ? 'improving'
      : recentFailRate > priorFailRate + 5 ? 'worsening' : 'stable';

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      avgDuration: durationCount ? totalDuration / durationCount : 0,
      successRate: totalRuns ? (successfulRuns / totalRuns * 100) : 0,
      p95Duration,
      failureTrend,
      recentFailRate,
      workflowStats,
      activityTrends,
      workflowComparison,
    };
  };

  const fetchRepositoryData = async () => {
    try {
      setLoading(true);
      const response = await apiService.getRepoWorkflowRuns(decodeURIComponent(repoName));
      const repoWorkflows = response.data;
      if (repoWorkflows.length > 0) {
        setRepository(repoWorkflows[0].repository);
        setStats(calculateRepoStats(repoWorkflows));
        setError(null);
      } else {
        setError('Repository not found');
      }
    } catch (err) {
      setError('Failed to fetch repository data. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositoryData();
    const cleanupListeners = setupSocketListeners({
      onWorkflowUpdate: (updatedWorkflow) => {
        if (updatedWorkflow.repository.fullName === decodeURIComponent(repoName)) {
          fetchRepositoryData();
        }
      }
    });
    return () => { cleanupListeners(); };
  }, [repoName]);

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      await apiService.syncWorkflowRuns(decodeURIComponent(repoName));
      await fetchRepositoryData();
      setError(null);
    } catch (err) {
      setError('Failed to sync workflow runs. Please try again later.');
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const navigateToWorkflowHistory = (workflowName) => {
    const encodedRepoName = encodeURIComponent(repoName);
    const encodedWorkflowName = encodeURIComponent(workflowName);
    navigate(`/workflow-history/${encodedRepoName}/${encodedWorkflowName}`);
  };

  const getWorkflowBorderColor = (successRate) => {
    if (successRate >= 80) return 'bg-secondary';
    if (successRate >= 50) return 'bg-tertiary';
    return 'bg-error';
  };

  const getWorkflowSuccessColor = (successRate) => {
    if (successRate >= 80) return 'text-secondary';
    if (successRate >= 50) return 'text-tertiary';
    return 'text-error';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !repository) {
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
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(240,246,252,0.1)' }, ticks: { color: '#8B949E' } },
      x: { grid: { color: 'rgba(240,246,252,0.1)' }, ticks: { color: '#8B949E', maxTicksLimit: 10 } }
    }
  };

  const [orgName, repoShortName] = repository.fullName.includes('/')
    ? repository.fullName.split('/', 2)
    : ['', repository.fullName];

  // Derived stats for Workflow Stats panel
  const successRatePct = stats.successRate.toFixed(1);
  const p95Formatted = formatDuration(stats.p95Duration);
  const failureTrendLabel = stats.failureTrend === 'improving' ? '↓ Improving'
    : stats.failureTrend === 'worsening' ? '↑ Worsening' : '→ Stable';
  const failureTrendColor = stats.failureTrend === 'improving' ? 'text-secondary'
    : stats.failureTrend === 'worsening' ? 'text-error' : 'text-outline';

  return (
    <div className="pb-12">
      {/* Breadcrumb & Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
        <div className="space-y-2">
          <nav className="flex items-center gap-2 text-outline font-medium uppercase text-[0.7rem] tracking-widest">
            <button
              className="cursor-pointer hover:text-on-surface transition-colors"
              onClick={() => navigate('/')}
            >
              Dashboard
            </button>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <button
              className="cursor-pointer hover:text-on-surface transition-colors"
              onClick={() => navigate(`/?org=${encodeURIComponent(orgName)}`)}
            >
              {orgName}
            </button>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-on-surface">{repoShortName}</span>
          </nav>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight text-on-surface">{repoShortName || repository.fullName}</h1>
            <span className="bg-secondary-container/20 text-secondary border border-secondary/20 px-2 py-0.5 rounded text-[0.65rem] font-bold uppercase tracking-widest">
              Active
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-bright transition-all text-sm font-medium border border-outline-variant/10 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">sync</span>
            {syncing ? 'Syncing...' : 'Sync All'}
          </button>
          <button
            onClick={() => window.open(repository.url, '_blank', 'noopener,noreferrer')}
            className="px-5 py-2 rounded-lg font-bold text-sm text-on-primary-fixed shadow-lg active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, #a2c9ff 0%, #58a6ff 100%)' }}
          >
            View Repository
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/5">
          <p className="text-outline text-xs font-bold uppercase tracking-widest mb-2">Total Runs</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tighter text-on-surface">{stats.totalRuns}</span>
          </div>
        </div>

        <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/5">
          <p className="text-outline text-xs font-bold uppercase tracking-widest mb-2">Success Rate</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tighter text-secondary">{successRatePct}%</span>
            <div className="flex-1 h-1 bg-surface-container-highest rounded-full overflow-hidden ml-4">
              <div className="bg-secondary h-full" style={{ width: `${successRatePct}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/5">
          <p className="text-outline text-xs font-bold uppercase tracking-widest mb-2">Failed Runs</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tighter text-error">{stats.failedRuns}</span>
          </div>
        </div>

        <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/5">
          <p className="text-outline text-xs font-bold uppercase tracking-widest mb-2">Avg. Duration</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tighter text-on-surface">{formatDuration(stats.avgDuration)}</span>
            <span className="material-symbols-outlined text-primary text-lg">timer</span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-12">
        {/* Activity Trend - spans 3 cols */}
        <div className="lg:col-span-3 bg-surface-container p-8 rounded-xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-on-surface">30-Day Activity Trends</h3>
              <p className="text-sm text-outline">Frequency of CI/CD executions and build density</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary inline-block" />
              <span className="text-[0.65rem] font-bold uppercase text-outline">Runs / Day</span>
            </div>
          </div>
          <div className="h-48">
            <Line data={stats.activityTrends} options={chartOptions} />
          </div>
        </div>

        {/* Workflow Stats */}
        <div className="bg-surface-container p-8 rounded-xl">
          <h3 className="text-sm font-bold text-on-surface mb-6 uppercase tracking-widest">Workflow Stats</h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-[0.65rem] font-bold text-outline mb-2 uppercase">
                <span>Success Rate</span>
                <span className="text-secondary">{successRatePct}%</span>
              </div>
              <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
                <div className="bg-secondary h-full" style={{ width: `${successRatePct}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[0.65rem] font-bold text-outline mb-2 uppercase">
                <span>Failure Trend (7d)</span>
                <span className={failureTrendColor}>{failureTrendLabel}</span>
              </div>
              <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
                <div className={`h-full ${stats.failureTrend === 'worsening' ? 'bg-error' : stats.failureTrend === 'improving' ? 'bg-secondary' : 'bg-primary'}`} style={{ width: `${Math.min(stats.recentFailRate, 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[0.65rem] font-bold text-outline mb-2 uppercase">
                <span>p95 Duration</span>
                <span className="text-tertiary">{p95Formatted}</span>
              </div>
              <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
                <div className="bg-tertiary h-full" style={{ width: `${Math.min((stats.p95Duration / (1000 * 60 * 10)) * 100, 100)}%` }} />
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-outline-variant/10">
            <p className="text-[0.65rem] text-outline leading-relaxed italic">
              "{successRatePct}% success rate across {Object.keys(stats.workflowStats).length} workflows. p95 duration is {p95Formatted}. Failure trend: {failureTrendLabel.toLowerCase()}."
            </p>
          </div>
        </div>
      </div>

      {/* Workflow List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-on-surface">Active Workflows</h2>
          <div className="flex gap-4 items-center">
            <span className="text-xs text-outline font-medium">{Object.keys(stats.workflowStats).length} Results</span>
          </div>
        </div>
        <div className="space-y-2">
          {Object.entries(stats.workflowStats).map(([name, workflowStat]) => {
            const wfSuccessRate = workflowStat.total
              ? (workflowStat.successful / workflowStat.total * 100)
              : 0;
            const avgDur = workflowStat.durations.length
              ? workflowStat.durations.reduce((a, c) => a + c, 0) / workflowStat.durations.length
              : 0;
            const borderColor = getWorkflowBorderColor(wfSuccessRate);
            const successColor = getWorkflowSuccessColor(wfSuccessRate);
            const filePath = workflowStat.path
              ? workflowStat.path.split('/').pop()
              : name;

            return (
              <div
                key={name}
                className="flex items-center gap-6 bg-surface-container-low hover:bg-surface-container transition-all px-6 py-4 rounded-lg group"
              >
                <div className={`w-1 h-8 ${borderColor} rounded-full flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <h4
                    onClick={() => navigateToWorkflowHistory(name)}
                    className="text-on-surface font-semibold text-sm group-hover:text-primary transition-colors cursor-pointer"
                  >
                    {name}
                  </h4>
                  <p className="text-outline text-xs mt-0.5">{filePath}</p>
                </div>
                <div className="flex flex-col items-end min-w-[100px]">
                  <span className={`${successColor} text-xs font-bold`}>
                    {wfSuccessRate.toFixed(1)}%
                  </span>
                  <span className="text-outline-variant text-[0.65rem] uppercase">Success</span>
                </div>
                <div className="flex flex-col items-end min-w-[80px]">
                  <span className="text-on-surface text-xs font-bold">{workflowStat.total}</span>
                  <span className="text-outline-variant text-[0.65rem] uppercase">Runs</span>
                </div>
                <div className="flex flex-col items-end min-w-[80px]">
                  <span className="text-on-surface text-xs font-bold">{formatDuration(avgDur)}</span>
                  <span className="text-outline-variant text-[0.65rem] uppercase">Dur</span>
                </div>
                <button className="p-2 text-outline hover:text-on-surface transition-colors flex-shrink-0">
                  <span className="material-symbols-outlined">more_vert</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <section className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 md:col-span-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest text-outline mb-1">Queue Health</h4>
            <p className="text-2xl font-bold text-on-surface">
              Stable <span className="text-secondary text-sm font-medium ml-2">(-1.2s latency)</span>
            </p>
            <div className="mt-4 flex gap-1">
              {[40, 60, 30, 70, 50, 80, 100, 60, 40, 90].map((opacity, i) => (
                <div
                  key={i}
                  className={`w-4 h-8 rounded-sm ${i === 6 ? 'bg-primary' : 'bg-secondary'}`}
                  style={{ opacity: opacity / 100 }}
                />
              ))}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[0.65rem] font-bold text-outline-variant uppercase mb-2">Next Scheduled Run</p>
            <p className="text-lg font-mono text-on-surface">04:00 UTC</p>
            <p className="text-xs text-outline mt-1">Daily Automated Suite</p>
          </div>
        </div>
        <div className="bg-surface-container p-6 rounded-xl border border-outline-variant/10 flex flex-col justify-center items-center text-center">
          <span
            className="material-symbols-outlined text-4xl text-primary mb-2"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            analytics
          </span>
          <h4 className="text-sm font-bold text-on-surface uppercase tracking-widest">Full Report</h4>
          <p className="text-xs text-outline mt-1 mb-4 px-4">
            Download comprehensive PDF analysis of this repository's CI velocity.
          </p>
          <button className="w-full py-2 bg-surface-container-high hover:bg-surface-bright rounded text-[0.65rem] font-bold uppercase tracking-wider transition-all">
            Download .PDF
          </button>
        </div>
      </section>
    </div>
  );
};

export default RepositoryView;
