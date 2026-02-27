import axios from 'axios';
import io from 'socket.io-client';

// Use the environment variables, falling back to development defaults if not set
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost/api';
const WS_URL = process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost';

console.log('Using API URL:', API_URL);
console.log('Using WebSocket URL:', WS_URL);

// Axios instance with 429 retry logic (exponential backoff)
const api = axios.create();
api.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (error.response?.status === 429 && (!config._retryCount || config._retryCount < 3)) {
    config._retryCount = (config._retryCount || 0) + 1;
    const retryAfter = error.response.headers['retry-after'];
    const delay = retryAfter ? Number(retryAfter) * 1000 : Math.min(1000 * 2 ** config._retryCount, 15000);
    await new Promise(resolve => setTimeout(resolve, delay));
    return api(config);
  }
  return Promise.reject(error);
});

// Create socket connection with environment-aware configuration
export const socket = io(WS_URL, {
  transports: ['websocket'],
  path: '/socket.io'
});

// API Services
const apiService = {
  // Get all workflow runs
  getWorkflowRuns: async (page = 1, pageSize = 30, search = '', status = 'all') => {
    try {
      const response = await api.get(`${API_URL}/workflow-runs`, {
        params: { page, pageSize, search, status }
      });
      return response.data.data || { data: [], pagination: { total: 0, page: 1, pageSize: 30, totalPages: 1 } };
    } catch (error) {
      console.error('Error fetching workflow runs:', error);
      throw error;
    }
  },

  // Get workflow runs for a specific repository
  getRepoWorkflowRuns: async (repoName, workflowName = null, page = 1, pageSize = 30) => {
    try {
      const params = { page, pageSize };
      if (workflowName) {
        params.workflowName = workflowName;
      }
      const response = await api.get(`${API_URL}/workflow-runs/repo/${repoName}`, { params });
      return response.data.data || { data: [], pagination: { total: 0, page: 1, pageSize: 0, totalPages: 1 } };
    } catch (error) {
      console.error(`Error fetching workflow runs for repo ${repoName}:`, error);
      throw error;
    }
  },

  // Get workflow run by ID
  getWorkflowRunById: async (id) => {
    try {
      const response = await api.get(`${API_URL}/workflow-runs/${id}`);
      return response.data.data;
    } catch (error) {
      console.error(`Error fetching workflow run ${id}:`, error);
      throw error;
    }
  },

  // Sync workflow run
  syncWorkflowRun: async (id) => {
    try {
      const response = await api.post(`${API_URL}/workflow-runs/${id}/sync`);
      return response.data.data;
    } catch (error) {
      console.error(`Error syncing workflow run ${id}:`, error);
      throw error;
    }
  },

  // Sync all workflow runs for a repository
  syncWorkflowRuns: async (repoName) => {
    try {
      const response = await api.post(`${API_URL}/workflow-runs/repo/${repoName}/sync`);
      return response.data.data;
    } catch (error) {
      console.error(`Error syncing workflow runs for repo ${repoName}:`, error);
      throw error;
    }
  },

  // Get workflow statistics
  getWorkflowStats: async () => {
    try {
      const response = await api.get(`${API_URL}/stats`);
      return response.data.data || {};
    } catch (error) {
      console.error('Error fetching workflow stats:', error);
      throw error;
    }
  },

  // Get available organizations
  getOrganizations: async () => {
    try {
      const response = await api.get(`${API_URL}/organizations`);
      return response.data;
    } catch (error) {
      console.error('Error fetching organizations:', error);
      throw error;
    }
  },

  // Sync GitHub data using installation ID
  syncGitHubData: async (installationId, options = { maxWorkflowRuns: 100 }) => {
    try {
      const response = await fetch(`${API_URL}/sync/${encodeURIComponent(String(installationId))}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(options)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to sync GitHub data');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error syncing GitHub data:', error);
      throw error;
    }
  },

  // Get database status
  getDatabaseStatus: async () => {
    try {
      const response = await api.get(`${API_URL}/db/status`);
      return response.data.data || {};
    } catch (error) {
      console.error('Error fetching database status:', error);
      throw error;
    }
  },

  // Get sync history
  getSyncHistory: async () => {
    try {
      const response = await api.get(`${API_URL}/sync/history`);
      return response.data;
    } catch (error) {
      console.error('Error fetching sync history:', error);
      throw error;
    }
  },

  // Get active sync status
  getActiveSync: async () => {
    try {
      const response = await api.get(`${API_URL}/sync/active`);
      return response.data;
    } catch (error) {
      console.error('Error fetching active sync:', error);
      throw error;
    }
  },

  // Get active metrics
  getActiveMetrics: async () => {
    try {
      const response = await api.get(`${API_URL}/workflow-runs/metrics`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching active metrics:', error);
      throw error;
    }
  },
  
  // Get queued workflows
  getQueuedWorkflows: async () => {
    try {
      const response = await api.get(`${API_URL}/workflow-runs/queued`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching queued workflows:', error);
      throw error;
    }
  },
  
  // Create database backup
  async createDatabaseBackup() {
    const response = await api.get(`${API_URL}/database/backup`);
    return response.data;
  },

  // Restore database backup
  async restoreDatabaseBackup(backupData) {
    const response = await api.post(`${API_URL}/database/restore`, backupData);
    return response.data;
  },

  // Get workflow metrics
  getWorkflowMetrics: async () => {
    try {
      const response = await api.get(`${API_URL}/workflow-runs/metrics`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching workflow metrics:', error);
      throw error;
    }
  },

  // Get job metrics
  getJobMetrics: async () => {
    try {
      const response = await api.get(`${API_URL}/workflow-runs/jobs/metrics`);
      return response.data.data;
    } catch (error) {
      console.error('Error fetching job metrics:', error);
      throw error;
    }
  },

  // Get the status of the database
  getDatabaseStatus: async () => {
    try {
      const response = await api.get(`${API_URL}/db/status`);
      return response.data.data || {};
    } catch (error) {
      console.error('Error fetching database status:', error);
      throw error;
    }
  }
};

export default apiService;