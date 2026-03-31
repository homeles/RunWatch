import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';
import apiService from '../../api/apiService';
import { formatDuration } from '../../common/utils/statusHelpers';
import { useNavigate } from 'react-router-dom';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  ChartTooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

const RepositoryStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const processStats = (data) => {
    const orgStats = {};
    data.repoStats?.forEach(repo => {
      const [orgName] = repo._id.split('/');
      if (!orgStats[orgName]) {
        orgStats[orgName] = {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          repositories: [],
          avgDuration: 0,
          durations: []
        };
      }
      orgStats[orgName].repositories.push(repo);
      orgStats[orgName].totalRuns += repo.totalRuns;
      orgStats[orgName].successfulRuns += repo.successfulRuns;
      orgStats[orgName].failedRuns += repo.failedRuns;
      if (repo.avgDuration) {
        orgStats[orgName].durations.push(repo.avgDuration);
      }
    });

    Object.values(orgStats).forEach(org => {
      org.avgDuration = org.durations.length
        ? org.durations.reduce((acc, curr) => acc + curr, 0) / org.durations.length
        : 0;
    });

    return { ...data, orgStats };
  };

  const prepareOrgChartData = (orgStats) => {
    if (!orgStats) return null;
    const orgLabels = Object.keys(orgStats);
    const successData = orgLabels.map(org => orgStats[org].successfulRuns);
    const failureData = orgLabels.map(org => orgStats[org].failedRuns);
    const successRates = orgLabels.map(org =>
      orgStats[org].totalRuns ? (orgStats[org].successfulRuns / orgStats[org].totalRuns * 100).toFixed(1) : 0
    );

    return {
      overview: {
        labels: orgLabels,
        datasets: [
          {
            label: 'Successful Runs',
            data: successData,
            backgroundColor: 'rgba(103, 223, 112, 0.6)',
            borderColor: 'rgba(103, 223, 112, 1)',
            borderWidth: 1,
          },
          {
            label: 'Failed Runs',
            data: failureData,
            backgroundColor: 'rgba(255, 180, 171, 0.6)',
            borderColor: 'rgba(255, 180, 171, 1)',
            borderWidth: 1,
          }
        ]
      },
      successRates: {
        labels: orgLabels,
        datasets: [{
          label: 'Success Rate (%)',
          data: successRates,
          backgroundColor: 'rgba(162, 201, 255, 0.6)',
          borderColor: 'rgba(162, 201, 255, 1)',
          borderWidth: 1,
        }]
      }
    };
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await apiService.getWorkflowStats();
      const processedData = processStats(data);
      setStats(processedData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch workflow statistics. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const trendData = React.useMemo(() => {
    if (!stats?.recentRuns) return { labels: [], datasets: [] };
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(today.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });
    const timeLabels = days.map(date =>
      new Date(date).toLocaleDateString('en-US', { weekday: 'short' })
    );
    const recentRuns = stats.recentRuns || [];
    const counts = days.map(date =>
      recentRuns.filter(r => r.run?.created_at?.startsWith(date)).length
    );
    return {
      labels: timeLabels,
      datasets: [{
        label: 'Workflow Activity',
        data: counts,
        borderColor: 'rgba(162, 201, 255, 1)',
        backgroundColor: 'rgba(162, 201, 255, 0.15)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: 'rgba(162, 201, 255, 1)',
        pointRadius: 3,
      }],
    };
  }, [stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mt-8 text-center">
        <p className="text-error">{error || 'Statistics not available'}</p>
        <button
          onClick={fetchStats}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm hover:bg-primary/20"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          Retry
        </button>
      </div>
    );
  }

  const chartScales = {
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(65,71,82,0.4)' },
      ticks: { color: '#8b919d' },
      border: { color: 'rgba(65,71,82,0.4)' },
    },
    x: {
      grid: { display: false },
      ticks: { color: '#8b919d' },
      border: { color: 'rgba(65,71,82,0.4)' },
    },
  };

  const globalSuccessRate = (() => {
    if (!stats.orgStats) return null;
    const totalSuccess = Object.values(stats.orgStats).reduce((a, o) => a + o.successfulRuns, 0);
    const totalRuns = Object.values(stats.orgStats).reduce((a, o) => a + o.totalRuns, 0);
    return totalRuns ? (totalSuccess / totalRuns * 100).toFixed(1) : null;
  })();

  return (
    <div className="pb-12">
      {/* Header */}
      <header className="mb-10">
        <h2 className="text-3xl font-extrabold tracking-tight text-on-surface mb-2">Statistics</h2>
        <p className="text-outline text-sm">
          System-wide performance metrics and velocity analysis for CI/CD pipelines.
        </p>
      </header>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* Total Organizations */}
        <div className="bg-surface-container-low p-6 rounded-lg relative overflow-hidden border-l-4 border-primary">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-outline tracking-widest uppercase mb-1">Total Organizations</p>
              <h3 className="text-4xl font-black text-on-surface tracking-tighter">
                {stats.orgStats ? Object.keys(stats.orgStats).length : 0}
              </h3>
            </div>
            <span className="material-symbols-outlined text-primary/20 text-4xl">corporate_fare</span>
          </div>
          <div className="mt-4 flex items-center text-xs text-secondary font-medium">
            <span className="material-symbols-outlined text-xs mr-1">trending_up</span>
            <span>Stable enterprise context</span>
          </div>
        </div>

        {/* Total Repositories */}
        <div className="bg-surface-container-low p-6 rounded-lg relative overflow-hidden border-l-4 border-secondary">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-outline tracking-widest uppercase mb-1">Total Repositories</p>
              <h3 className="text-4xl font-black text-on-surface tracking-tighter">
                {stats.repoStats?.length || 0}
              </h3>
            </div>
            <span className="material-symbols-outlined text-secondary/20 text-4xl">folder_zip</span>
          </div>
          <div className="mt-4 flex items-center text-xs text-primary font-medium">
            <span className="material-symbols-outlined text-xs mr-1">add</span>
            <span>Active repositories</span>
          </div>
        </div>

        {/* Total Workflow Runs */}
        <div className="bg-surface-container-low p-6 rounded-lg relative overflow-hidden border-l-4 border-tertiary">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-outline tracking-widest uppercase mb-1">Total Workflow Runs</p>
              <h3 className="text-4xl font-black text-on-surface tracking-tighter">
                {(stats.totalRuns || 0).toLocaleString()}
              </h3>
            </div>
            <span className="material-symbols-outlined text-tertiary/20 text-4xl">rocket_launch</span>
          </div>
          <div className="mt-4 flex items-center text-xs text-secondary font-medium">
            <span className="material-symbols-outlined text-xs mr-1">insights</span>
            <span>
              {globalSuccessRate ? `${globalSuccessRate}% success rate avg` : 'No run data yet'}
            </span>
          </div>
        </div>
      </div>

      {/* Organization Overview Chart */}
      <section className="bg-surface-container mb-10 rounded-lg p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h4 className="text-lg font-bold text-on-surface">Organization Overview</h4>
            <p className="text-xs text-outline uppercase tracking-widest mt-1">Aggregate Health &amp; Reliability Index</p>
          </div>
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-secondary inline-block"></span>
              <span className="text-xs text-outline font-semibold uppercase">Success</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-error inline-block"></span>
              <span className="text-xs text-outline font-semibold uppercase">Failure</span>
            </div>
            <button
              onClick={fetchStats}
              title="Refresh"
              className="text-outline hover:text-primary transition-colors ml-2"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
            </button>
          </div>
        </div>
        <div className="h-[300px]">
          <Bar
            data={prepareOrgChartData(stats.orgStats)?.overview}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#1c2026', titleColor: '#dfe2eb', bodyColor: '#8b919d' },
              },
              scales: chartScales,
            }}
          />
        </div>
      </section>

      {/* Dual Column: Success Rates + Weekly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        {/* Success Rates by Organization — horizontal progress bars */}
        <div className="bg-surface-container-low p-8 rounded-lg">
          <h4 className="text-sm font-bold text-outline uppercase tracking-[0.2em] mb-8">
            Success Rates by Organization
          </h4>
          <div className="space-y-6">
            {stats.orgStats && Object.entries(stats.orgStats).map(([orgName, orgData]) => {
              const rate = orgData.totalRuns
                ? (orgData.successfulRuns / orgData.totalRuns * 100)
                : 0;
              const isLow = rate < 70;
              return (
                <div key={orgName} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-bold text-on-surface">{orgName}</span>
                    <span className={`text-xs font-mono ${isLow ? 'text-error' : 'text-secondary'}`}>
                      {rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className={`h-full ${isLow ? 'bg-error' : 'bg-secondary'}`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Weekly Activity Trend */}
        <div className="bg-surface-container-low p-8 rounded-lg">
          <h4 className="text-sm font-bold text-outline uppercase tracking-[0.2em] mb-8">
            Weekly Activity Trend
          </h4>
          <div className="h-[200px]">
            <Line
              data={trendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { backgroundColor: '#1c2026', titleColor: '#dfe2eb', bodyColor: '#8b919d' },
                },
                scales: chartScales,
              }}
            />
          </div>
        </div>
      </div>

      {/* Repository Breakdown Table */}
      <section className="bg-surface-container rounded-lg overflow-hidden border border-outline-variant/10">
        <div className="px-8 py-6 border-b border-outline-variant/10 flex justify-between items-center">
          <div>
            <h4 className="text-lg font-bold text-on-surface">Repository Breakdown</h4>
            <p className="text-xs text-outline uppercase tracking-widest mt-0.5">Performance Granularity</p>
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="bg-surface-container-low/50">
            <tr>
              <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">
                Repository Name
              </th>
              <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">
                Success Rate
              </th>
              <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest text-center">
                Total Runs
              </th>
              <th className="px-8 py-4 text-[10px] font-bold text-outline uppercase tracking-widest text-right">
                Avg Duration
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {stats.repoStats?.map((repo) => {
              const rate = repo.totalRuns
                ? (repo.successfulRuns / repo.totalRuns * 100)
                : 0;
              const isLow = rate < 70;
              const repoShortName = repo._id.includes('/')
                ? repo._id.split('/')[1]
                : repo._id;
              return (
                <tr
                  key={repo._id}
                  onClick={() => navigate(`/repository/${encodeURIComponent(repo._id)}`)}
                  className="hover:bg-surface-container-high transition-colors group cursor-pointer"
                >
                  <td className="px-8 py-5">
                    <div className="flex items-center">
                      <span className="material-symbols-outlined text-outline text-lg mr-3">code</span>
                      <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                        {repoShortName}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center space-x-3">
                      <span className={`text-sm font-mono ${isLow ? 'text-error' : 'text-secondary'}`}>
                        {rate.toFixed(1)}%
                      </span>
                      <div className="w-16 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                        <div
                          className={`h-full ${isLow ? 'bg-error' : 'bg-secondary'}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center text-sm font-mono text-outline">
                    {repo.totalRuns}
                  </td>
                  <td className="px-8 py-5 text-right text-sm font-mono text-on-surface">
                    {formatDuration(repo.avgDuration)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default RepositoryStats;
