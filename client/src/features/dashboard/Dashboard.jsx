import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid2,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Paper,
  Stack,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  Pagination,
  FormControl,
  InputLabel,
  ListSubheader,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Book as BookIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  PlayArrow as PlayArrowIcon,
  PendingActions as PendingIcon,
} from '@mui/icons-material';
import apiService from '../../api/apiService';
import { setupSocketListeners, socket, defaultAlertConfig } from '../../api/socketService';
import { formatDuration, formatDate } from '../../common/utils/statusHelpers';
import { keyframes } from '@emotion/react';
import { ToastContainer } from 'react-toastify';

const rotate = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const pulse = keyframes`
  0% { opacity: 0.7; }
  50% { opacity: 1; }
  100% { opacity: 0.7; }
`;

// Alert icon component for long-queued workflows
const AlertIcon = ({ queuedMinutes }) => (
  <Tooltip
    title={`Workflow has been queued for ${queuedMinutes} minutes`}
    arrow
    placement="top"
  >
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        bgcolor: 'rgba(245, 166, 35, 0.2)',
        color: '#F5A623',
        animation: `${pulse} 1.5s ease-in-out infinite`,
        ml: 1,
        '&::before': {
          content: '"⚠️"',
          fontSize: '12px',
        }
      }}
    />
  </Tooltip>
);

const BuildHistoryBadge = ({ run }) => {
  const getColor = () => {
    if (run.status === 'in_progress' || run.status === 'queued' || run.status === 'waiting' || run.status === 'pending') {
      return '#F5A623'; // Orange for active states
    }

    switch (run.conclusion) {
      case 'success':
        return '#23C562';
      case 'failure':
        return '#F85149';
      case 'cancelled':
      case 'skipped':
        return '#8B949E';
      case 'timed_out':
      case 'action_required':
        return '#F5A623';
      case 'neutral':
        return '#58A6FF';
      case 'stale':
        return '#6E7681';
      default:
        // For any other status, show a neutral color
        return '#8B949E';
    }
  };

  const getStatusText = () => {
    // First check the active states
    if (run.status && ['in_progress', 'queued', 'waiting', 'pending', 'requested'].includes(run.status)) {
      return run.status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }
    
    // Then check conclusion for completed states
    if (run.conclusion) {
      return run.conclusion.charAt(0).toUpperCase() + run.conclusion.slice(1);
    }

    // If neither is available, return the current status
    return run.status ? run.status.charAt(0).toUpperCase() + run.status.slice(1) : 'Pending';
  };

  const tooltipContent = (
    <Box>
      <Typography variant="caption" component="div">
        Status: {getStatusText()}
      </Typography>
      <Typography variant="caption" component="div">
        Duration: {formatDuration(run.created_at, run.updated_at)}
      </Typography>
      <Typography variant="caption" component="div">
        {formatDate(run.updated_at)}
      </Typography>
    </Box>
  );

  return (
    <Box 
      sx={{ 
        padding: '2px',
        margin: '2px',
        flexShrink: 0, // Prevent shrinking
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '14px',  // Fixed width
        height: '14px',  // Fixed height
        position: 'relative', // Establish a stacking context
        overflow: 'hidden' // Contain the badge effects
      }}
    >
      <Tooltip 
        title={tooltipContent} 
        arrow 
        placement="top"
      >
        <Box
          onClick={() => window.open(run.url, '_blank', 'noopener,noreferrer')}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: getColor(),
            cursor: 'pointer',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            transition: 'all 0.2s ease',
            ...(run.status === 'in_progress' && {
              '&::before': {
                content: '""',
                position: 'absolute',
                top: '-3px',
                left: '-3px',
                right: '-3px',
                bottom: '-3px',
                border: '2px solid',
                borderColor: 'inherit',
                opacity: 0.6,
                borderRadius: '50%',
                animation: `${rotate} 2s linear infinite, ${pulse} 2s ease-in-out infinite`
              }
            }),
            '&:hover': {
              transform: 'translate(-50%, -50%) scale(1.2)', // Keep centered while scaling
              boxShadow: `0 0 3px ${getColor()}`, // Smaller shadow
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              bottom: '-4px',
              left: '-4px',
              border: '1px solid transparent',
              borderRadius: '50%',
              transition: 'all 0.2s ease',
            },
            '&:hover::after': {
              borderColor: getColor(),
              opacity: 0.4,
            }
          }}
        />
      </Tooltip>
    </Box>
  );
};

const RepositoryIcon = BookIcon;

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'Active States', type: 'group' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Queued', value: 'queued' },
  { label: 'Waiting', value: 'waiting' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completed States', type: 'group' },
  { label: 'Success', value: 'success', isConclusion: true },
  { label: 'Failure', value: 'failure', isConclusion: true },
  { label: 'Cancelled', value: 'cancelled', isConclusion: true },
  { label: 'Timed Out', value: 'timed_out', isConclusion: true },
  { label: 'Skipped', value: 'skipped', isConclusion: true }
];

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
    totalPages: 1
  });
  const [buildMetrics, setBuildMetrics] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [alertConfig, setAlertConfig] = useState(() => {
    const savedConfig = localStorage.getItem('alertConfig');
    return savedConfig ? JSON.parse(savedConfig) : defaultAlertConfig;
  });
  
  // Track long-queued workflows
  const [longQueuedWorkflows, setLongQueuedWorkflows] = useState({});

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

  // Add debouncing for search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500); // 500ms delay

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
      setPagination(prev => ({
        ...prev,
        ...response.pagination
      }));
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

  useEffect(() => {
    // Set up real-time updates with socket.io
    const cleanupListeners = setupSocketListeners({
      onNewWorkflow: (newWorkflow) => {
        setWorkflowRuns(prev => {
          // Only add new workflow if we're on the first page
          if (pagination.page !== 1) return prev;
          
          // Check if workflow already exists
          const exists = prev.some(workflow => workflow.run.id === newWorkflow.run.id);
          if (exists) {
            return prev.map(workflow =>
              workflow.run.id === newWorkflow.run.id ? newWorkflow : workflow
            );
          }
          
          // Add new workflow if we haven't reached page size
          if (prev.length < pagination.pageSize) {
            return [newWorkflow, ...prev];
          }
          
          // Otherwise, just keep current state
          return prev;
        });
        
        // Update total count
        setPagination(prev => ({
          ...prev,
          total: prev.total + 1,
          totalPages: Math.ceil((prev.total + 1) / prev.pageSize)
        }));
      },
      onWorkflowUpdate: (updatedWorkflow) => {
        setWorkflowRuns(prev => {
          if (!prev.some(workflow => workflow.run.id === updatedWorkflow.run.id)) {
            return prev;
          }
          return prev.map(workflow =>
            workflow.run.id === updatedWorkflow.run.id ? updatedWorkflow : workflow
          );
        });
      },
      onJobsUpdate: (workflowWithJobs) => {
        setWorkflowRuns(prev => {
          if (!prev.some(workflow => workflow.run.id === workflowWithJobs.run.id)) {
            return prev;
          }
          return prev.map(workflow =>
            workflow.run.id === workflowWithJobs.run.id ? workflowWithJobs : workflow
          );
        });
      }
    });

    return () => {
      cleanupListeners();
    };
  }, [pagination.page, pagination.pageSize]);

  // Add effect to focus search input when loading completes
  useEffect(() => {
    if (!loading && searchQuery && searchInputRef.current) {
      searchInputRef.current.focus();
      // Place cursor at the end of the text
      const length = searchInputRef.current.value.length;
      searchInputRef.current.setSelectionRange(length, length);
    }
  }, [loading, searchQuery]);

  // Group workflows by organization and repository
  const groupedWorkflows = React.useMemo(() => {
    const groups = {};
    workflowRuns.forEach(workflow => {
      // Extract organization name from repository full name (org/repo)
      const [orgName, repoShortName] = workflow.repository.fullName.split('/');
      const repoKey = workflow.repository.fullName;
      const workflowKey = workflow.workflow.name;
      
      if (!groups[orgName]) {
        groups[orgName] = {
          repositories: {}
        };
      }
      
      if (!groups[orgName].repositories[repoKey]) {
        groups[orgName].repositories[repoKey] = {
          workflows: {},
          repoShortName // Store the short name for display
        };
      }
      
      if (!groups[orgName].repositories[repoKey].workflows[workflowKey]) {
        groups[orgName].repositories[repoKey].workflows[workflowKey] = {
          runs: [],
          history: []
        };
      }
      
      const workflowGroup = groups[orgName].repositories[repoKey].workflows[workflowKey];
      workflowGroup.runs.push(workflow);
      
      // Add to history if completed and not already there
      if (workflow.run.status === 'completed' && 
          !workflowGroup.history.some(h => h.id === workflow.run.id)) {
        workflowGroup.history.unshift({
          id: workflow.run.id,
          conclusion: workflow.run.conclusion
        });
        // Keep only last 5
        if (workflowGroup.history.length > 5) {
          workflowGroup.history.pop();
        }
      }
    });

    // Sort runs within each workflow by date
    Object.values(groups).forEach(org => {
      Object.values(org.repositories).forEach(repo => {
        Object.values(repo.workflows).forEach(workflow => {
          workflow.runs.sort((a, b) => new Date(b.run.created_at) - new Date(a.run.created_at));
        });
      });
    });

    return groups;
  }, [workflowRuns]);

  // Remove client-side filtering since it's now handled by the server
  const paginatedGroupedWorkflows = useMemo(() => ({
    groups: groupedWorkflows,
    totalPages: pagination.totalPages,
    totalRepos: pagination.total
  }), [groupedWorkflows, pagination]);

  const handleClearSearch = () => {
    setSearchQuery('');
    localStorage.removeItem('dashboardSearchQuery');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    localStorage.setItem('dashboardSearchQuery', value);
  };

  const handlePageChange = (_, newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
    window.scrollTo(0, 0);
  };

  const handlePageSizeChange = (event) => {
    const newPageSize = parseInt(event.target.value, 10);
    setPagination(prev => ({
      ...prev,
      pageSize: newPageSize,
      page: 1,
      totalPages: Math.ceil(prev.total / newPageSize)
    }));
  };

  const handleStatusFilterChange = (event) => {
    setStatusFilter(event.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Add function to calculate active and queued builds for each org
  const fetchActiveMetrics = async () => {
    try {
      const metrics = await apiService.getActiveMetrics();
      setBuildMetrics(metrics);
    } catch (err) {
      console.error('Failed to fetch active metrics:', err);
    }
  };

  // Fetch active metrics initially and update them periodically
  useEffect(() => {
    fetchActiveMetrics();
    const interval = setInterval(fetchActiveMetrics, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Enhanced WebSocket update handler
  useEffect(() => {
    const cleanupListeners = setupSocketListeners({
      onNewWorkflow: (newWorkflow) => {
        // Update workflow runs only if on first page
        setWorkflowRuns(prev => {
          if (pagination.page !== 1) return prev;
          const exists = prev.some(workflow => workflow.run.id === newWorkflow.run.id);
          if (exists) {
            return prev.map(workflow =>
              workflow.run.id === newWorkflow.run.id ? newWorkflow : workflow
            );
          }
          if (prev.length < pagination.pageSize) {
            return [newWorkflow, ...prev];
          }
          return prev;
        });

        // Fetch fresh metrics instead of calculating them
        fetchActiveMetrics();
      },
      onWorkflowUpdate: (updatedWorkflow) => {
        setWorkflowRuns(prev => {
          if (!prev.some(workflow => workflow.run.id === updatedWorkflow.run.id)) {
            return prev;
          }
          return prev.map(workflow => {
            if (workflow.run.id === updatedWorkflow.run.id) {
              // If status changed, fetch fresh metrics
              if (workflow.run.status !== updatedWorkflow.run.status) {
                fetchActiveMetrics();
              }
              return updatedWorkflow;
            }
            return workflow;
          });
        });
      },
      onLongQueuedWorkflow: (data) => {
        console.log('Dashboard received long-queued-workflow event:', data);
        
        // Store the long-queued workflow information for alert display
        setLongQueuedWorkflows(prev => ({
          ...prev,
          [data.id]: {
            workflow: data.workflow,
            repository: data.repository,
            queuedMinutes: data.queuedMinutes
          }
        }));
      },
      alertConfig: alertConfig // Pass the alert configuration to socket service
    });

    // Direct listener for long-queued events as a fallback
    socket.on('long-queued-workflow', (data) => {
      console.log('Direct socket listener received long-queued-workflow:', data);
      
      // Store the long-queued workflow information for alert display
      setLongQueuedWorkflows(prev => ({
        ...prev,
        [data.id]: {
          workflow: data.workflow,
          repository: data.repository,
          queuedMinutes: data.queuedMinutes
        }
      }));
    });

    return () => cleanupListeners();
  }, [pagination.page, pagination.pageSize, alertConfig]);

  // Save alert config when it changes
  useEffect(() => {
    localStorage.setItem('alertConfig', JSON.stringify(alertConfig));
  }, [alertConfig]);

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
          onClick={fetchWorkflowRuns}
          startIcon={<RefreshIcon />}
        >
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 6 }}>
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
          Organizations
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              inputRef={searchInputRef}
              size="small"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={handleSearchChange}
              sx={{ width: 250 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={handleClearSearch}
                      sx={{ color: '#8B949E' }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Select
              size="small"
              value={pagination.pageSize}
              onChange={handlePageSizeChange}
              sx={{ 
                minWidth: 100,
                color: '#E6EDF3',
                '.MuiSelect-select': { py: 0.75 },
                '.MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(240, 246, 252, 0.1)'
                }
              }}
            >
              {pageSizeOptions.map(size => (
                <MenuItem key={size} value={size}>
                  {size} per page
                </MenuItem>
              ))}
            </Select>
          </Box>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel sx={{ color: '#8B949E' }}>Status</InputLabel>
            <Select
              value={statusFilter}
              onChange={handleStatusFilterChange}
              label="Status"
              sx={{ 
                color: '#E6EDF3',
                '.MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(240, 246, 252, 0.1)'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(240, 246, 252, 0.2)'
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#58A6FF'
                },
                '.MuiSelect-icon': {
                  color: '#8B949E'
                }
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    bgcolor: '#161B22',
                    border: '1px solid rgba(240, 246, 252, 0.1)',
                    '& .MuiMenuItem-root': {
                      color: '#E6EDF3',
                      '&:hover': {
                        bgcolor: 'rgba(88, 166, 255, 0.1)'
                      },
                      '&.Mui-selected': {
                        bgcolor: 'rgba(88, 166, 255, 0.15)',
                        '&:hover': {
                          bgcolor: 'rgba(88, 166, 255, 0.25)'
                        }
                      }
                    },
                    '& .MuiListSubheader-root': {
                      color: '#8B949E',
                      bgcolor: '#161B22',
                      lineHeight: '32px'
                    }
                  }
                }
              }}
            >
              {STATUS_OPTIONS.map(option => (
                option.type === 'group' ? (
                  <ListSubheader key={option.label}>{option.label}</ListSubheader>
                ) : (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                )
              ))}
            </Select>
          </FormControl>
          <Tooltip title="Refresh">
            <IconButton 
              onClick={fetchWorkflowRuns}
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
      </Box>

      {Object.entries(paginatedGroupedWorkflows.groups).length === 0 ? (
        <Box sx={{
          textAlign: 'center',
          py: 8,
          background: 'rgba(88, 166, 255, 0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(88, 166, 255, 0.1)'
        }}>
          <Typography variant="body1" color="#8B949E">
            {searchQuery 
              ? 'No repositories match your search criteria.'
              : 'No workflow runs found. Waiting for GitHub webhook events...'}
          </Typography>
        </Box>
      ) : (
        <>
          <Stack spacing={4}>
            {Object.entries(paginatedGroupedWorkflows.groups).map(([orgName, orgData]) => (
              <Paper 
                key={orgName} 
                elevation={0}
                sx={{ 
                  overflow: 'hidden',
                  bgcolor: '#161B22',
                  borderRadius: '12px',
                  border: '1px solid rgba(240, 246, 252, 0.1)'
                }}
              >
                {/* Organization Header */}
                <Box sx={{
                  p: 3,
                  borderBottom: '1px solid rgba(240, 246, 252, 0.1)',
                  background: 'linear-gradient(90deg, rgba(88, 166, 255, 0.1) 0%, rgba(88, 166, 255, 0.05) 100%)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <Typography 
                    variant="h5" 
                    sx={{ 
                      color: '#E6EDF3',
                      fontWeight: 600,
                      fontSize: '1.25rem'
                    }}
                  >
                    {orgName}
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Chip
                      icon={<PlayArrowIcon sx={{ fontSize: '1.25rem !important' }} />}
                      label={`${buildMetrics[orgName]?.inProgress || 0} In Progress`}
                      size="small"
                      onClick={() => {
                        setStatusFilter('in_progress');
                        setPagination(prev => ({ ...prev, page: 1 }));
                      }}
                      sx={{ 
                        bgcolor: 'rgba(35, 197, 98, 0.1)', 
                        color: '#23C562',
                        animation: buildMetrics[orgName]?.inProgress ? `${pulse} 2s ease-in-out infinite` : 'none',
                        fontWeight: 500,
                        height: '28px',
                        cursor: 'pointer',
                        '&:hover': {
                          bgcolor: 'rgba(35, 197, 98, 0.2)'
                        },
                        '& .MuiChip-label': {
                          fontSize: '0.875rem',
                          px: 1.5
                        }
                      }}
                    />
                    <Chip
                      icon={<PendingIcon sx={{ fontSize: '1.25rem !important' }} />}
                      label={`${buildMetrics[orgName]?.queued || 0} Queued`}
                      size="small"
                      onClick={() => {
                        setStatusFilter('queued');
                        setPagination(prev => ({ ...prev, page: 1 }));
                      }}
                      sx={{ 
                        bgcolor: 'rgba(245, 166, 35, 0.1)', 
                        color: '#F5A623',
                        animation: buildMetrics[orgName]?.queued ? `${pulse} 2s ease-in-out infinite` : 'none',
                        fontWeight: 500,
                        height: '28px',
                        cursor: 'pointer',
                        '&:hover': {
                          bgcolor: 'rgba(245, 166, 35, 0.2)'
                        },
                        '& .MuiChip-label': {
                          fontSize: '0.875rem',
                          px: 1.5
                        }
                      }}
                    />
                  </Stack>
                </Box>

                {/* Repositories Section */}
                <Box sx={{ p: 3 }}>
                  <Stack spacing={3}>
                    {Object.entries(orgData.repositories).map(([repoKey, repoData]) => (
                      <Paper
                        key={repoKey}
                        elevation={0}
                        sx={{
                          bgcolor: 'rgba(13, 17, 23, 0.3)',
                          borderRadius: '12px',
                          border: '1px solid rgba(240, 246, 252, 0.1)',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Repository Header */}
                        <Box sx={{
                          p: 2.5,
                          borderBottom: '1px solid rgba(240, 246, 252, 0.1)',
                        }}>
                          <Typography 
                            onClick={() => navigate(`/repository/${encodeURIComponent(repoKey)}`)}
                            sx={{ 
                              color: '#E6EDF3',
                              fontWeight: 500,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              '&:hover': {
                                color: '#58A6FF'
                              }
                            }}
                          >
                            <RepositoryIcon sx={{ fontSize: '1.2rem', color: '#58A6FF' }} />
                            {repoData.repoShortName}
                          </Typography>
                        </Box>

                        {/* Workflows */}
                        <Box sx={{ p: 2.5 }}>
                          <Grid2 
                            container 
                            spacing={2}
                            columns={{ xs: 4, sm: 8, md: 12, lg: 16, xl: 40 }}
                            sx={{
                              display: 'grid',
                              gridTemplateColumns: {
                                xs: 'repeat(1, 1fr)',
                                sm: 'repeat(2, 1fr)',
                                md: 'repeat(3, 1fr)',
                                lg: 'repeat(4, 1fr)',
                                xl: 'repeat(6, 1fr)'
                              },
                              gap: 2,
                            }}
                          > 
                            {Object.entries(repoData.workflows).map(([workflowKey, workflowData]) => (
                              <Box
                                key={workflowKey}
                                sx={{ 
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 2,
                                  p: 2,
                                  borderRadius: 1,
                                  bgcolor: 'rgba(13, 17, 23, 0.5)',
                                  border: '1px solid rgba(240, 246, 252, 0.05)',
                                  height: '140px',
                                  width: '100%',
                                  minWidth: '200px',
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  position: 'relative',
                                }}
                              >
                                <Box sx={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  width: '100%',
                                  mb: 1
                                }}>
                                  <Typography 
                                    onClick={() => navigate(`/workflow-history/${encodeURIComponent(repoKey)}/${encodeURIComponent(workflowKey)}`)}
                                    sx={{ 
                                      color: '#E6EDF3', 
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      flex: 1,
                                      minWidth: 0,
                                      display: 'flex',
                                      alignItems: 'center',
                                      '&:hover': {
                                        color: '#58A6FF',
                                      }
                                    }}
                                  >
                                    {workflowKey}
                                    {/* Show alert icon for any workflow run in this workflow that's in the longQueuedWorkflows */}
                                    {workflowData.runs.some(workflow => 
                                      longQueuedWorkflows[workflow.run.id] && 
                                      workflow.workflow.name === workflowKey
                                    ) && (
                                      <AlertIcon 
                                        queuedMinutes={
                                          workflowData.runs
                                            .filter(workflow => 
                                              longQueuedWorkflows[workflow.run.id] && 
                                              workflow.workflow.name === workflowKey
                                            )
                                            .map(workflow => longQueuedWorkflows[workflow.run.id].queuedMinutes)
                                            .reduce((max, minutes) => Math.max(max, minutes), 0)
                                        } 
                                      />
                                    )}
                                  </Typography>
                                </Box>
                                
                                <Box sx={{ 
                                  display: 'flex', 
                                  flexWrap: 'nowrap',
                                  alignItems: 'center',
                                  gap: 0.5,
                                  py: 0.5,
                                  px: 1,
                                  borderRadius: '8px',
                                  border: '1px solid rgba(240, 246, 252, 0.05)',
                                  minHeight: '36px',
                                  height: '36px',
                                  flex: 1,
                                  position: 'relative',
                                  boxSizing: 'border-box',
                                  overflow: 'hidden',
                                  '&:hover': {
                                    borderColor: 'rgba(240, 246, 252, 0.1)'
                                  }
                                }}>
                                  {workflowData.runs.slice(0, 10).reverse().map((workflow, index) => {
                                    const run = {
                                      ...workflow.run,
                                      id: workflow.run.id.toString()
                                    };
                                    return (
                                      <Box
                                        key={workflow.run.id}
                                        sx={{
                                          position: 'relative',
                                          '&::after': index === 0 ? {
                                            content: '""',
                                            position: 'absolute',
                                            top: -12,
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            width: 0,
                                            height: 0,
                                            borderLeft: '4px solid transparent',
                                            borderRight: '4px solid transparent',
                                            borderTop: '4px solid #58A6FF',
                                          } : undefined
                                        }}
                                      >
                                        <BuildHistoryBadge
                                          run={run}
                                        />
                                      </Box>
                                    );
                                  })}
                                </Box>
                              </Box>
                            ))}
                          </Grid2>
                        </Box>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              </Paper>
            ))}
          </Stack>

          {/* Pagination controls */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center',
            mt: 4,
            pt: 4,
            borderTop: '1px solid rgba(240, 246, 252, 0.1)'
          }}>
            <Pagination 
              page={pagination.page}
              count={paginatedGroupedWorkflows.totalPages}
              onChange={handlePageChange}
              color="primary"
              size="large"
              showFirstButton
              showLastButton
              sx={{
                '.MuiPaginationItem-root': {
                  color: '#E6EDF3',
                  '&.Mui-selected': {
                    bgcolor: 'rgba(88, 166, 255, 0.2)',
                    '&:hover': {
                      bgcolor: 'rgba(88, 166, 255, 0.3)'
                    }
                  },
                  '&:hover': {
                    bgcolor: 'rgba(88, 166, 255, 0.1)'
                  }
                }
              }}
            />
          </Box>
          
          <Typography 
            variant="body2" 
            sx={{ 
              textAlign: 'center', 
              mt: 2,
              color: '#8B949E'
            }}
          >
            Showing {Math.min((pagination.page - 1) * pagination.pageSize + 1, paginatedGroupedWorkflows.totalRepos)} - {Math.min(pagination.page * pagination.pageSize, paginatedGroupedWorkflows.totalRepos)} of {paginatedGroupedWorkflows.totalRepos} repositories
          </Typography>
        </>
      )}
    </Box>
  );
};

export default Dashboard;