import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Button,
  Stack,
  Chip,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
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
      const dayRuns = runs.filter(run => 
        run.run.created_at.startsWith(date)
      );
      
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
    e.stopPropagation(); // Prevent row click
    try {
      setSyncingRun(runId);
      await apiService.syncWorkflowRun(runId);
      // No need to manually update the UI since we have socket updates
    } catch (error) {
      console.error('Error syncing workflow run:', error);
    } finally {
      setSyncingRun(null);
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

    // Set up socket listeners for real-time updates
    const cleanupListeners = setupSocketListeners({
      onWorkflowUpdate: (updatedWorkflow) => {
        // Compare with the decoded workflowName since that's what we get from useParams
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
        // Compare with the decoded workflowName since that's what we get from useParams
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
      }
    });

    return () => cleanupListeners();
  }, [repoName, workflowName]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography color="error">{error}</Typography>
        <Button 
          variant="contained" 
          sx={{ mt: 2 }} 
          onClick={() => navigate('/')}
          startIcon={<BackIcon />}
        >
          Back to Dashboard
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 6 }}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        mb: 4,
        background: 'linear-gradient(90deg, rgba(88, 166, 255, 0.1) 0%, rgba(88, 166, 255, 0.05) 100%)',
        p: 3,
        borderRadius: '12px',
        border: '1px solid rgba(88, 166, 255, 0.2)'
      }}>
        <Tooltip title="Back to Dashboard">
          <IconButton onClick={() => navigate('/')} sx={{ mr: 2, color: '#E6EDF3' }}>
            <BackIcon />
          </IconButton>
        </Tooltip>
        <Box>
          <Typography variant="h4" component="h1" sx={{
            fontWeight: 600,
            fontSize: '1.75rem',
            color: '#E6EDF3'
          }}>
            {workflowName}
          </Typography>
          <Typography variant="subtitle1" sx={{ color: '#8B949E' }}>
            {repoName}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={2}>
        {/* Left side metrics */}
        <Grid item xs={12} md={4}>
          <Stack spacing={2}>
            <Card sx={{ bgcolor: '#161B22', border: '1px solid rgba(240, 246, 252, 0.1)' }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                  <ScheduleIcon sx={{ color: '#58A6FF', mr: 1, fontSize: '1rem' }} />
                  <Typography sx={{ color: '#8B949E', fontSize: '0.875rem' }}>Average Duration</Typography>
                </Box>
                <Typography variant="h6" sx={{ color: '#E6EDF3', fontSize: '1.1rem' }}>
                  {formatDuration(stats?.averageDuration || 0)}
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ bgcolor: '#161B22', border: '1px solid rgba(240, 246, 252, 0.1)' }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                  <TrendingUpIcon sx={{ color: '#58A6FF', mr: 1, fontSize: '1rem' }} />
                  <Typography sx={{ color: '#8B949E', fontSize: '0.875rem' }}>Success Rate</Typography>
                </Box>
                <Typography variant="h6" sx={{ color: '#E6EDF3', fontSize: '1.1rem' }}>
                  {stats?.successRate.toFixed(1)}%
                </Typography>
              </CardContent>
            </Card>

            <Card sx={{ bgcolor: '#161B22', border: '1px solid rgba(240, 246, 252, 0.1)' }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                  <SpeedIcon sx={{ color: '#58A6FF', mr: 1, fontSize: '1rem' }} />
                  <Typography sx={{ color: '#8B949E', fontSize: '0.875rem' }}>Total Runs</Typography>
                </Box>
                <Typography variant="h6" sx={{ color: '#E6EDF3', fontSize: '1.1rem' }}>
                  {stats?.totalRuns || 0}
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        {/* Right side activity chart */}
        <Grid item xs={12} md={8}>
          <Paper elevation={0} sx={{ 
            p: 2,
            height: '100%',
            bgcolor: '#161B22',
            borderRadius: '12px',
            border: '1px solid rgba(240, 246, 252, 0.1)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <Typography variant="h6" sx={{ color: '#E6EDF3', mb: 2, fontSize: '1rem' }}>
              Activity Trends
            </Typography>
            <Box sx={{ flex: 1, minHeight: 200 }}>
              <Line
                data={stats?.trendsData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: {
                    intersect: false,
                    mode: 'index'
                  },
                  plugins: {
                    legend: {
                      position: 'top',
                      labels: {
                        color: '#8B949E',
                        boxWidth: 12,
                        padding: 8,
                        font: {
                          size: 11
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      grid: {
                        color: 'rgba(240, 246, 252, 0.1)'
                      },
                      ticks: {
                        color: '#8B949E',
                        font: {
                          size: 10
                        }
                      }
                    },
                    x: {
                      grid: {
                        color: 'rgba(240, 246, 252, 0.1)'
                      },
                      ticks: {
                        color: '#8B949E',
                        font: {
                          size: 10
                        }
                      }
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Workflow Runs Table */}
        <Grid item xs={12}>
          <Paper elevation={0} sx={{ 
            bgcolor: '#161B22',
            borderRadius: '12px',
            border: '1px solid rgba(240, 246, 252, 0.1)'
          }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: '#8B949E' }}>Status</TableCell>
                    <TableCell sx={{ color: '#8B949E' }}>Run #</TableCell>
                    <TableCell sx={{ color: '#8B949E' }}>Branch</TableCell>
                    <TableCell sx={{ color: '#8B949E' }}>Event</TableCell>
                    <TableCell sx={{ color: '#8B949E' }}>Labels</TableCell>
                    <TableCell sx={{ color: '#8B949E' }}>Duration</TableCell>
                    <TableCell sx={{ color: '#8B949E' }}>Started</TableCell>
                    <TableCell sx={{ color: '#8B949E' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {workflowRuns.map((workflow) => (
                    <TableRow 
                      key={workflow.run.id} 
                      hover
                      onClick={() => navigate(`/workflow/${workflow.run.id}`)}
                      sx={{ 
                        cursor: 'pointer',
                        '&:hover': {
                          bgcolor: 'rgba(88, 166, 255, 0.05)'
                        }
                      }}
                    >
                      <TableCell>
                        <StatusChip 
                          status={workflow.run.status}
                          conclusion={workflow.run.conclusion}
                        />
                      </TableCell>
                      <TableCell sx={{ color: '#E6EDF3' }}>
                        {workflow.run.number ? `#${workflow.run.number}` : '#-'}
                      </TableCell>
                      <TableCell sx={{ color: '#E6EDF3' }}>
                        {workflow.run.head_branch || '-'}
                      </TableCell>
                      <TableCell sx={{ color: '#E6EDF3' }}>
                        {workflow.run.event || '-'}
                      </TableCell>
                      <TableCell>
                        {workflow.run.labels?.map((label, index) => (
                          <Chip
                            key={index}
                            label={label}
                            size="small"
                            sx={{
                              m: 0.5,
                              bgcolor: '#21262D',
                              color: '#E6EDF3',
                              borderRadius: '12px',
                              '& .MuiChip-label': {
                                fontSize: '0.75rem'
                              }
                            }}
                          />
                        ))}
                      </TableCell>
                      <TableCell sx={{ color: '#E6EDF3' }}>
                        {formatDuration(workflow.run.created_at, workflow.run.updated_at)}
                      </TableCell>
                      <TableCell sx={{ color: '#E6EDF3' }}>
                        {formatDate(workflow.run.created_at)}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(workflow.run.url, '_blank', 'noopener,noreferrer');
                            }}
                            sx={{ 
                              borderColor: 'rgba(88, 166, 255, 0.2)',
                              color: '#58A6FF',
                              '&:hover': {
                                borderColor: 'rgba(88, 166, 255, 0.5)',
                                bgcolor: 'rgba(88, 166, 255, 0.1)'
                              }
                            }}
                          >
                            View on GitHub
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={(e) => handleSyncRun(e, workflow.run.id)}
                            disabled={syncingRun === workflow.run.id}
                            sx={{ 
                              borderColor: 'rgba(88, 166, 255, 0.2)',
                              color: '#58A6FF',
                              '&:hover': {
                                borderColor: 'rgba(88, 166, 255, 0.5)',
                                bgcolor: 'rgba(88, 166, 255, 0.1)'
                              }
                            }}
                          >
                            {syncingRun === workflow.run.id ? (
                              <CircularProgress size={16} sx={{ color: '#58A6FF' }} />
                            ) : (
                              'Sync'
                            )}
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default WorkflowHistory;