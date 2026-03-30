import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import StatusChip from '../../common/components/StatusChip';
import { formatDuration, formatDate } from '../../common/utils/statusHelpers';
import apiService from '../../api/apiService';
import { setupSocketListeners } from '../../api/socketService';

const ITEMS_PER_PAGE = 20;

const WorkflowHistory = () => {
  const { repoName, workflowName } = useParams();
  const navigate = useNavigate();
  const [workflowRuns, setWorkflowRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [syncingRun, setSyncingRun] = useState(null);
  const [deletingRun, setDeletingRun] = useState(null);

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
          borderColor: 'rgba(88, 166, 255, 1)',
          backgroundColor: 'rgba(88, 166, 255, 0.1)',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Successful',
          data: dailyStats.map(stat => stat.successful),
          borderColor: 'rgba(35, 197, 98, 1)',
          backgroundColor: 'rgba(35, 197, 98, 0.1)',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Failed',
          data: dailyStats.map(stat => stat.failed),
          borderColor: 'rgba(248, 81, 73, 1)',
          backgroundColor: 'rgba(248, 81, 73, 0.1)',
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
      legend: {
        position: 'top',
        labels: { color: '#8B949E', boxWidth: 12, padding: 8, font: { size: 11 } }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(240,246,252,0.1)' },
        ticks: { color: '#8B949E', font: { size: 10 } }
      },
      x: {
        grid: { color: 'rgba(240,246,252,0.1)' },
        ticks: { color: '#8B949E', font: { size: 10 } }
      }
    }
  };

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="flex items-center mb-8 bg-primary/10 p-6 rounded-xl border border-primary/20">
        <button
          onClick={() => navigate('/')}
          title="Back to Dashboard"
          className="mr-4 p-2 rounded-lg text-on-surface hover:bg-primary/10 transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">{workflowName}</h1>
          <p className="text-on-surface-variant text-sm mt-0.5">{repoName}</p>
        </div>
      </div>

      {/* Stats + Chart */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-1 space-y-3">
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-base text-primary">schedule</span>
              <span className="text-on-surface-variant text-sm">Average Duration</span>
            </div>
            <p className="text-on-surface text-lg font-semibold">
              {formatDuration(stats?.averageDuration || 0)}
            </p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-base text-primary">trending_up</span>
              <span className="text-on-surface-variant text-sm">Success Rate</span>
            </div>
            <p className="text-on-surface text-lg font-semibold">
              {stats?.successRate.toFixed(1)}%
            </p>
          </div>

          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-base text-primary">speed</span>
              <span className="text-on-surface-variant text-sm">Total Runs</span>
            </div>
            <p className="text-on-surface text-lg font-semibold">{stats?.totalRuns || 0}</p>
          </div>
        </div>

        <div className="md:col-span-3 bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col">
          <h2 className="text-on-surface text-base font-medium mb-4">Activity Trends</h2>
          <div className="flex-1 min-h-[200px]">
            <Line data={stats?.trendsData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Runs Table */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Status</th>
                <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Run #</th>
                <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Branch</th>
                <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Event</th>
                <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Labels</th>
                <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Duration</th>
                <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Started</th>
                <th className="text-left px-4 py-3 text-on-surface-variant font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflowRuns.map((workflow) => (
                <tr
                  key={workflow.run.id}
                  onClick={() => navigate(`/workflow/${workflow.run.id}`)}
                  className="border-b border-outline-variant/50 cursor-pointer hover:bg-primary/5 transition-colors"
                >
                  <td className="px-4 py-3">
                    <StatusChip status={workflow.run.status} conclusion={workflow.run.conclusion} />
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {workflow.run.number ? `#${workflow.run.number}` : '#-'}
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {workflow.run.head_branch || '-'}
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {workflow.run.event || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {workflow.run.labels?.map((label, index) => (
                        <span
                          key={index}
                          className="px-2 py-0.5 bg-surface-container-high text-on-surface rounded-full text-xs"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {formatDuration(workflow.run.created_at, workflow.run.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-on-surface">
                    {formatDate(workflow.run.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(workflow.run.url, '_blank', 'noopener,noreferrer');
                        }}
                        className="px-3 py-1 border border-primary/20 text-primary rounded-lg text-xs hover:border-primary/50 hover:bg-primary/10 transition-colors"
                      >
                        GitHub
                      </button>
                      <button
                        onClick={(e) => handleSyncRun(e, workflow.run.id)}
                        disabled={syncingRun === workflow.run.id}
                        className="px-3 py-1 border border-primary/20 text-primary rounded-lg text-xs hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50 transition-colors"
                      >
                        {syncingRun === workflow.run.id ? (
                          <span className="inline-block w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                        ) : 'Sync'}
                      </button>
                      <button
                        onClick={(e) => handleDeleteRun(e, workflow.run.id)}
                        disabled={deletingRun === workflow.run.id}
                        className="px-3 py-1 border border-error/20 text-error rounded-lg text-xs hover:border-error/50 hover:bg-error/10 disabled:opacity-50 transition-colors"
                      >
                        {deletingRun === workflow.run.id ? (
                          <span className="inline-block w-3 h-3 border border-error border-t-transparent rounded-full animate-spin" />
                        ) : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WorkflowHistory;
