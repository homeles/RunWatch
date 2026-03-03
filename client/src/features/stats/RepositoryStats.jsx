import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Button,
  IconButton,
  Tooltip,
  Stack,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  Check as SuccessIcon,
  Close as FailureIcon,
  GitHub as GitHubIcon,
} from '@mui/icons-material';
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

// Register ChartJS components
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
    // Group by organization
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

    // Calculate average durations for each org
    Object.values(orgStats).forEach(org => {
      org.avgDuration = org.durations.length 
        ? org.durations.reduce((acc, curr) => acc + curr, 0) / org.durations.length 
        : 0;
    });

    return {
      ...data,
      orgStats
    };
  };

  // Prepare chart data for organizations
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !stats) {
    return (
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography color="error">{error || 'Statistics not available'}</Typography>
        <Button 
          variant="contained" 
          color="primary" 
          sx={{ mt: 2 }} 
          onClick={fetchStats}
          startIcon={<RefreshIcon />}
        >
          Retry
        </Button>
      </Box>
    );
  }

  // Prepare chart data
  const successRateData = {
    labels: ['Successful', 'Failed'],
    datasets: [
      {
        data: [stats.successfulRuns, stats.failedRuns],
        backgroundColor: [
          'rgba(35, 197, 98, 0.6)',
          'rgba(248, 81, 73, 0.6)',
        ],
        borderColor: [
          'rgba(35, 197, 98, 1)',
          'rgba(248, 81, 73, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  // Repository stats chart data
  const repoLabels = stats.repoStats?.map(repo => repo._id) || [];
  const repoSuccessData = stats.repoStats?.map(repo => repo.successfulRuns) || [];
  const repoFailureData = stats.repoStats?.map(repo => repo.failedRuns) || [];

  const repoStatsData = {
    labels: repoLabels,
    datasets: [
      {
        label: 'Successful Runs',
        data: repoSuccessData,
        backgroundColor: 'rgba(35, 197, 98, 0.6)',
        borderColor: 'rgba(35, 197, 98, 1)',
        borderWidth: 1,
      },
      {
        label: 'Failed Runs',
        data: repoFailureData,
        backgroundColor: 'rgba(248, 81, 73, 0.6)',
        borderColor: 'rgba(248, 81, 73, 1)',
        borderWidth: 1,
      },
    ],
  };

  // Recent activity trend — uses actual run dates from recentRuns
  const trendData = React.useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(today.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    const timeLabels = days.map(date =>
      new Date(date).toLocaleDateString('en-US', { weekday: 'short' })
    );

    // Count runs per day from recentRuns (if available) — otherwise zeros
    const recentRuns = stats.recentRuns || [];
    const counts = days.map(date =>
      recentRuns.filter(r => r.run?.created_at?.startsWith(date)).length
    );

    return {
      labels: timeLabels,
      datasets: [
        {
          label: 'Workflow Activity',
          data: counts,
          borderColor: 'rgba(88, 166, 255, 1)',
          backgroundColor: 'rgba(88, 166, 255, 0.5)',
          tension: 0.4,
          fill: true,
        }
      ],
    };
  }, [stats.recentRuns]);

  return (
    <Box sx={{ pb: 6 }}>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        mb: 4, 
        alignItems: 'center',
        background: 'linear-gradient(90deg, rgba(88, 166, 255, 0.1) 0%, rgba(88, 166, 255, 0.05) 100%)',
        p: 3,
        borderRadius: '12px',
        border: '1px solid rgba(88, 166, 255, 0.2)'
      }}>
        <Typography variant="h4" component="h1" sx={{
          fontWeight: 600,
          fontSize: '1.75rem',
          color: '#E6EDF3'
        }}>
          Organization Statistics
        </Typography>
        <Tooltip title="Refresh">
          <IconButton 
            onClick={fetchStats}
            sx={{ 
              color: '#58A6FF',
              '&:hover': {
                bgcolor: 'rgba(88, 166, 255, 0.1)'
              }
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Grid container spacing={3}>
        {/* Overall Stats Cards */}
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#161B22', border: '1px solid rgba(240, 246, 252, 0.1)' }}>
            <CardContent>
              <Typography sx={{ color: '#8B949E' }} gutterBottom>
                Total Organizations
              </Typography>
              <Typography variant="h3" sx={{ color: '#E6EDF3' }}>
                {stats.orgStats ? Object.keys(stats.orgStats).length : 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#161B22', border: '1px solid rgba(240, 246, 252, 0.1)' }}>
            <CardContent>
              <Typography sx={{ color: '#8B949E' }} gutterBottom>
                Total Repositories
              </Typography>
              <Typography variant="h3" sx={{ color: '#E6EDF3' }}>
                {stats.repoStats?.length || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#161B22', border: '1px solid rgba(240, 246, 252, 0.1)' }}>
            <CardContent>
              <Typography sx={{ color: '#8B949E' }} gutterBottom>
                Total Workflow Runs
              </Typography>
              <Typography variant="h3" sx={{ color: '#E6EDF3' }}>
                {stats.totalRuns || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Organization Overview Chart */}
        <Grid item xs={12}>
          <Paper elevation={0} sx={{ 
            p: 3,
            bgcolor: '#161B22',
            borderRadius: '12px',
            border: '1px solid rgba(240, 246, 252, 0.1)'
          }}>
            <Typography variant="h6" sx={{ color: '#E6EDF3', mb: 3 }}>
              Organization Overview
            </Typography>
            <Box sx={{ height: 400 }}>
              <Bar
                data={prepareOrgChartData(stats.orgStats)?.overview}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top',
                      labels: { color: '#8B949E' }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      grid: { color: 'rgba(240, 246, 252, 0.1)' },
                      ticks: { color: '#8B949E' }
                    },
                    x: {
                      grid: { color: 'rgba(240, 246, 252, 0.1)' },
                      ticks: { color: '#8B949E' }
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Success Rates by Organization */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ 
            p: 3,
            bgcolor: '#161B22',
            borderRadius: '12px',
            border: '1px solid rgba(240, 246, 252, 0.1)'
          }}>
            <Typography variant="h6" sx={{ color: '#E6EDF3', mb: 3 }}>
              Success Rates by Organization
            </Typography>
            <Box sx={{ height: 300 }}>
              <Bar
                data={prepareOrgChartData(stats.orgStats)?.successRates}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      max: 100,
                      grid: { color: 'rgba(240, 246, 252, 0.1)' },
                      ticks: { 
                        color: '#8B949E',
                        callback: (value) => `${value}%`
                      }
                    },
                    x: {
                      grid: { color: 'rgba(240, 246, 252, 0.1)' },
                      ticks: { color: '#8B949E' }
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Weekly Activity Trend */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ 
            p: 3,
            bgcolor: '#161B22',
            borderRadius: '12px',
            border: '1px solid rgba(240, 246, 252, 0.1)'
          }}>
            <Typography variant="h6" sx={{ color: '#E6EDF3', mb: 3 }}>
              Weekly Activity Trend
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line
                data={trendData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      grid: { color: 'rgba(240, 246, 252, 0.1)' },
                      ticks: { color: '#8B949E' }
                    },
                    x: {
                      grid: { color: 'rgba(240, 246, 252, 0.1)' },
                      ticks: { color: '#8B949E' }
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Organization Details */}
        {stats.orgStats && Object.entries(stats.orgStats).map(([orgName, orgData]) => (
          <Grid item xs={12} key={orgName}>
            <Paper elevation={0} sx={{ 
              p: 3,
              bgcolor: '#161B22',
              borderRadius: '12px',
              border: '1px solid rgba(240, 246, 252, 0.1)'
            }}>
              <Typography variant="h6" sx={{ 
                color: '#E6EDF3', 
                mb: 3,
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}>
                <GitHubIcon sx={{ color: '#58A6FF' }} />
                {orgName}
              </Typography>

              {/* Organization Summary Cards */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} md={3}>
                  <Card sx={{ bgcolor: 'rgba(13, 17, 23, 0.3)', border: '1px solid rgba(240, 246, 252, 0.1)' }}>
                    <CardContent>
                      <Typography sx={{ color: '#8B949E' }} gutterBottom>
                        Success Rate
                      </Typography>
                      <Typography variant="h6" sx={{ color: '#23C562' }}>
                        {orgData.totalRuns ? (orgData.successfulRuns / orgData.totalRuns * 100).toFixed(1) : 0}%
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Card sx={{ bgcolor: 'rgba(13, 17, 23, 0.3)', border: '1px solid rgba(240, 246, 252, 0.1)' }}>
                    <CardContent>
                      <Typography sx={{ color: '#8B949E' }} gutterBottom>
                        Total Runs
                      </Typography>
                      <Typography variant="h6" sx={{ color: '#E6EDF3' }}>
                        {orgData.totalRuns}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Card sx={{ bgcolor: 'rgba(13, 17, 23, 0.3)', border: '1px solid rgba(240, 246, 252, 0.1)' }}>
                    <CardContent>
                      <Typography sx={{ color: '#8B949E' }} gutterBottom>
                        Repositories
                      </Typography>
                      <Typography variant="h6" sx={{ color: '#E6EDF3' }}>
                        {orgData.repositories.length}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Card sx={{ bgcolor: 'rgba(13, 17, 23, 0.3)', border: '1px solid rgba(240, 246, 252, 0.1)' }}>
                    <CardContent>
                      <Typography sx={{ color: '#8B949E' }} gutterBottom>
                        Avg Duration
                      </Typography>
                      <Typography variant="h6" sx={{ color: '#E6EDF3' }}>
                        {formatDuration(orgData.avgDuration)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Repository List */}
              <Stack spacing={2}>
                {orgData.repositories.map((repo) => (
                  <Paper
                    key={repo._id}
                    elevation={0}
                    sx={{
                      p: 2.5,
                      bgcolor: 'rgba(13, 17, 23, 0.3)',
                      border: '1px solid rgba(240, 246, 252, 0.1)',
                      borderRadius: '8px',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography 
                          onClick={() => navigate(`/repository/${encodeURIComponent(repo._id)}`)}
                          sx={{ 
                            color: '#E6EDF3',
                            fontWeight: 500,
                            cursor: 'pointer',
                            '&:hover': {
                              color: '#58A6FF',
                            }
                          }}
                        >
                          {repo._id.split('/')[1]}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 3 }}>
                        <Box>
                          <Typography variant="body2" sx={{ color: '#8B949E' }}>Success Rate</Typography>
                          <Typography sx={{ color: '#23C562' }}>
                            {repo.totalRuns ? (repo.successfulRuns / repo.totalRuns * 100).toFixed(1) : 0}%
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="body2" sx={{ color: '#8B949E' }}>Total Runs</Typography>
                          <Typography sx={{ color: '#E6EDF3' }}>
                            {repo.totalRuns}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="body2" sx={{ color: '#8B949E' }}>Avg. Duration</Typography>
                          <Typography sx={{ color: '#E6EDF3' }}>
                            {formatDuration(repo.avgDuration)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default RepositoryStats;