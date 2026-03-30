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
            backgroundColor: 'rgba(35, 197, 98, 0.6)',
            borderColor: 'rgba(35, 197, 98, 1)',
            borderWidth: 1,
          },
          {
            label: 'Failed Runs',
            data: failureData,
            backgroundColor: 'rgba(248, 81, 73, 0.6)',
            borderColor: 'rgba(248, 81, 73, 1)',
            borderWidth: 1,
          }
        ]
      },
      successRates: {
        labels: orgLabels,
        datasets: [{
          label: 'Success Rate (%)',
          data: successRates,
          backgroundColor: 'rgba(88, 166, 255, 0.6)',
          borderColor: 'rgba(88, 166, 255, 1)',
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
        borderColor: 'rgba(88, 166, 255, 1)',
        backgroundColor: 'rgba(88, 166, 255, 0.5)',
        tension: 0.4,
        fill: true,
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
    y: { beginAtZero: true, grid: { color: 'rgba(240,246,252,0.1)' }, ticks: { color: '#8B949E' } },
    x: { grid: { color: 'rgba(240,246,252,0.1)' }, ticks: { color: '#8B949E' } }
  };

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 bg-primary/10 p-6 rounded-xl border border-primary/20">
        <h1 className="text-2xl font-semibold text-on-surface">Organization Statistics</h1>
        <button
          onClick={fetchStats}
          title="Refresh"
          className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
          <p className="text-on-surface-variant text-sm mb-2">Total Organizations</p>
          <p className="text-on-surface text-4xl font-bold">
            {stats.orgStats ? Object.keys(stats.orgStats).length : 0}
          </p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
          <p className="text-on-surface-variant text-sm mb-2">Total Repositories</p>
          <p className="text-on-surface text-4xl font-bold">{stats.repoStats?.length || 0}</p>
        </div>
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
          <p className="text-on-surface-variant text-sm mb-2">Total Workflow Runs</p>
          <p className="text-on-surface text-4xl font-bold">{stats.totalRuns || 0}</p>
        </div>
      </div>

      {/* Organization Overview Chart */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 mb-6">
        <h2 className="text-on-surface text-base font-medium mb-6">Organization Overview</h2>
        <div className="h-[400px]">
          <Bar
            data={prepareOrgChartData(stats.orgStats)?.overview}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'top', labels: { color: '#8B949E' } } },
              scales: chartScales
            }}
          />
        </div>
      </div>

      {/* Success Rates + Weekly Trend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
          <h2 className="text-on-surface text-base font-medium mb-6">Success Rates by Organization</h2>
          <div className="h-[300px]">
            <Bar
              data={prepareOrgChartData(stats.orgStats)?.successRates}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(240,246,252,0.1)' },
                    ticks: { color: '#8B949E', callback: (value) => `${value}%` }
                  },
                  x: chartScales.x
                }
              }}
            />
          </div>
        </div>

        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
          <h2 className="text-on-surface text-base font-medium mb-6">Weekly Activity Trend</h2>
          <div className="h-[300px]">
            <Line
              data={trendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: chartScales
              }}
            />
          </div>
        </div>
      </div>

      {/* Organization Details */}
      {stats.orgStats && Object.entries(stats.orgStats).map(([orgName, orgData]) => (
        <div
          key={orgName}
          className="bg-surface-container-low border border-outline-variant rounded-xl p-6 mb-6"
        >
          <h2 className="text-on-surface text-base font-medium mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">hub</span>
            {orgName}
          </h2>

          {/* Org Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-surface/30 border border-outline-variant rounded-xl p-4">
              <p className="text-on-surface-variant text-xs mb-1">Success Rate</p>
              <p className="text-secondary font-semibold text-lg">
                {orgData.totalRuns ? (orgData.successfulRuns / orgData.totalRuns * 100).toFixed(1) : 0}%
              </p>
            </div>
            <div className="bg-surface/30 border border-outline-variant rounded-xl p-4">
              <p className="text-on-surface-variant text-xs mb-1">Total Runs</p>
              <p className="text-on-surface font-semibold text-lg">{orgData.totalRuns}</p>
            </div>
            <div className="bg-surface/30 border border-outline-variant rounded-xl p-4">
              <p className="text-on-surface-variant text-xs mb-1">Repositories</p>
              <p className="text-on-surface font-semibold text-lg">{orgData.repositories.length}</p>
            </div>
            <div className="bg-surface/30 border border-outline-variant rounded-xl p-4">
              <p className="text-on-surface-variant text-xs mb-1">Avg Duration</p>
              <p className="text-on-surface font-semibold text-lg">{formatDuration(orgData.avgDuration)}</p>
            </div>
          </div>

          {/* Repository List */}
          <div className="space-y-3">
            {orgData.repositories.map((repo) => (
              <div
                key={repo._id}
                className="bg-surface/30 border border-outline-variant rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <p
                    onClick={() => navigate(`/repository/${encodeURIComponent(repo._id)}`)}
                    className="text-on-surface font-medium cursor-pointer hover:text-primary transition-colors"
                  >
                    {repo._id.split('/')[1]}
                  </p>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-on-surface-variant text-xs">Success Rate</p>
                      <p className="text-secondary font-medium">
                        {repo.totalRuns ? (repo.successfulRuns / repo.totalRuns * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant text-xs">Total Runs</p>
                      <p className="text-on-surface font-medium">{repo.totalRuns}</p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant text-xs">Avg. Duration</p>
                      <p className="text-on-surface font-medium">{formatDuration(repo.avgDuration)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default RepositoryStats;
