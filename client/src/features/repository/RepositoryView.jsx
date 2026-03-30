import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Line, Bar } from 'react-chartjs-2';
import { formatDuration, formatDate } from '../../common/utils/statusHelpers';
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
      s.total++;
      totalRuns++;

      if (run.run.conclusion === 'success') { s.successful++; successfulRuns++; }
      if (run.run.conclusion === 'failure') { s.failed++; failedRuns++; }

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

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      avgDuration: durationCount ? totalDuration / durationCount : 0,
      successRate: totalRuns ? (successfulRuns / totalRuns * 100) : 0,
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

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top', labels: { color: '#8B949E', boxHeight: 8, padding: 8 } } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(240,246,252,0.1)' }, ticks: { color: '#8B949E' } },
      x: { grid: { color: 'rgba(240,246,252,0.1)' }, ticks: { color: '#8B949E' } }
    }
  };

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="flex items-center mb-6 bg-primary/10 p-6 rounded-xl border border-primary/20">
        <button
          onClick={() => navigate('/')}
          title="Back to Dashboard"
          className="mr-4 p-2 rounded-lg text-on-surface hover:bg-primary/10 transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-2xl">hub</span>
            {repository.fullName}
          </h1>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="mr-2 inline-flex items-center gap-2 px-4 py-2 border border-primary/20 text-primary rounded-xl text-sm hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50 transition-colors"
        >
          <span className="material-symbols-outlined text-base">schedule</span>
          {syncing ? 'Syncing...' : 'Sync All'}
        </button>
        <button
          onClick={() => window.open(repository.url, '_blank', 'noopener,noreferrer')}
          className="inline-flex items-center gap-2 px-4 py-2 border border-primary/20 text-primary rounded-xl text-sm hover:border-primary/50 hover:bg-primary/10 transition-colors"
        >
          <span className="material-symbols-outlined text-base">open_in_new</span>
          View Repository
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-base text-primary">assessment</span>
            <span className="text-on-surface-variant text-sm">Total Runs</span>
          </div>
          <p className="text-on-surface text-lg font-semibold">{stats.totalRuns}</p>
        </div>

        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-base text-secondary">trending_up</span>
            <span className="text-on-surface-variant text-sm">Success Rate</span>
          </div>
          <p className="text-on-surface text-lg font-semibold">{stats.successRate.toFixed(1)}%</p>
        </div>

        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-base text-error">bug_report</span>
            <span className="text-on-surface-variant text-sm">Failed Runs</span>
          </div>
          <p className="text-on-surface text-lg font-semibold">{stats.failedRuns}</p>
        </div>

        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-base text-primary">access_time</span>
            <span className="text-on-surface-variant text-sm">Avg. Duration</span>
          </div>
          <p className="text-on-surface text-lg font-semibold">{formatDuration(stats.avgDuration)}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col">
          <h2 className="text-on-surface text-base font-medium mb-4">30-Day Activity Trends</h2>
          <div className="flex-1 min-h-[250px]">
            <Line data={stats.activityTrends} options={chartOptions} />
          </div>
        </div>

        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col">
          <h2 className="text-on-surface text-base font-medium mb-4">Workflow Comparison</h2>
          <div className="flex-1 min-h-[250px]">
            <Bar data={stats.workflowComparison} options={barOptions} />
          </div>
        </div>
      </div>

      {/* Workflow List */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
        <h2 className="text-on-surface text-base font-medium mb-4">
          Workflows ({Object.keys(stats.workflowStats).length})
        </h2>
        <div className="space-y-3">
          {Object.entries(stats.workflowStats).map(([name, workflowStat]) => (
            <div
              key={name}
              className="bg-surface/30 border border-outline-variant rounded-xl p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    onClick={() => navigateToWorkflowHistory(name)}
                    className="text-on-surface font-medium cursor-pointer hover:text-primary transition-colors"
                  >
                    {name}
                  </p>
                  <p className="text-on-surface-variant text-sm mt-0.5">
                    Last run: {formatDate(workflowStat.lastRun)}
                  </p>
                </div>
                <div className="flex gap-6">
                  <div>
                    <p className="text-on-surface-variant text-xs">Success Rate</p>
                    <p className="text-secondary font-medium">
                      {workflowStat.total ? (workflowStat.successful / workflowStat.total * 100).toFixed(1) : 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-xs">Total Runs</p>
                    <p className="text-on-surface font-medium">{workflowStat.total}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant text-xs">Avg. Duration</p>
                    <p className="text-on-surface font-medium">
                      {formatDuration(workflowStat.durations.length
                        ? workflowStat.durations.reduce((a, c) => a + c, 0) / workflowStat.durations.length
                        : 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RepositoryView;
