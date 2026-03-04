// Mock API Service for RunWatch Demo Mode
// Drop-in replacement for apiService — returns mock data with simulated latency

import { allRuns, repos, computeWorkflowMetrics, computeJobMetrics, computeStats } from './mockData';

const delay = (ms = 300) => new Promise(r => setTimeout(r, ms + Math.random() * 200));

const mockApiService = {
  getWorkflowRuns: async (page = 1, pageSize = 30, search = '', status = 'all') => {
    await delay();
    let filtered = [...allRuns];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(r =>
        r.repository.fullName.toLowerCase().includes(q) ||
        r.workflow.name.toLowerCase().includes(q) ||
        r.run.head_branch?.toLowerCase().includes(q)
      );
    }
    if (status !== 'all') {
      filtered = filtered.filter(r => r.run.status === status || r.run.conclusion === status);
    }
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);
    return {
      data,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  },

  getRepoWorkflowRuns: async (repoName, workflowName = null, page = 1, pageSize = 30) => {
    await delay();
    let filtered = allRuns.filter(r => r.repository.fullName === repoName);
    if (workflowName) {
      filtered = filtered.filter(r => r.workflow.name === workflowName);
    }
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);
    return {
      data,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  },

  getWorkflowRunById: async (id) => {
    await delay();
    return allRuns.find(r => r.run.id === parseInt(id)) || null;
  },

  syncWorkflowRun: async (id) => {
    await delay(800);
    // Simulate a sync — just return the same run
    return allRuns.find(r => r.run.id === parseInt(id)) || null;
  },

  deleteWorkflowRun: async (id) => {
    await delay(400);
    return { deleted: true, runId: id };
  },

  syncWorkflowRuns: async (repoName) => {
    await delay(1500);
    return allRuns.filter(r => r.repository.fullName === repoName).slice(0, 10);
  },

  getWorkflowStats: async () => {
    await delay();
    return computeStats();
  },

  getOrganizations: async () => {
    await delay();
    return {
      success: true,
      data: [
        {
          id: 1,
          account: { login: 'acme-corp', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
          app_slug: 'runwatch-demo',
        },
      ],
    };
  },

  syncGitHubData: async (installationId, options = {}) => {
    await delay(2000);
    return { success: true, message: 'Demo mode — sync simulated', synced: 0 };
  },

  getDatabaseStatus: async () => {
    await delay();
    return {
      status: 'connected',
      collections: {
        workflowRuns: allRuns.length,
        repositories: repos.length,
      },
      dbSize: '24.5 MB',
    };
  },

  getSyncHistory: async () => {
    await delay();
    return {
      success: true,
      data: [
        { _id: 'sync_1', startedAt: new Date(Date.now() - 3600000).toISOString(), completedAt: new Date(Date.now() - 3500000).toISOString(), status: 'completed', runsProcessed: 45 },
        { _id: 'sync_2', startedAt: new Date(Date.now() - 86400000).toISOString(), completedAt: new Date(Date.now() - 86300000).toISOString(), status: 'completed', runsProcessed: 120 },
      ],
    };
  },

  getActiveSync: async () => {
    await delay();
    return { success: true, data: null };
  },

  getActiveMetrics: async () => {
    await delay();
    return computeWorkflowMetrics();
  },

  getQueuedWorkflows: async () => {
    await delay();
    return allRuns.filter(r => r.run.status === 'queued');
  },

  async createDatabaseBackup(adminToken) {
    await delay(500);
    return { success: true, data: { backup: 'demo-backup-data', timestamp: new Date().toISOString() } };
  },

  async restoreDatabaseBackup(backupData, adminToken) {
    await delay(1000);
    return { success: true, message: 'Demo mode — restore simulated' };
  },

  getWorkflowMetrics: async () => {
    await delay();
    return computeWorkflowMetrics();
  },

  getJobMetrics: async () => {
    await delay();
    return computeJobMetrics();
  },
};

export default mockApiService;
