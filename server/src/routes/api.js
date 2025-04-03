import express from 'express';
import * as workflowController from '../controllers/workflowController.js';
import { syncGitHubData, getAvailableOrganizations, getSyncHistory } from '../services/syncService.js';
import { validateGitHubConfig } from '../utils/githubAuth.js';
import SyncHistory from '../models/SyncHistory.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Ngrok verification endpoint - responds to any request
router.get('/ngrok-verify', (req, res) => {
  res.status(200).json({ message: 'Ngrok verification successful', timestamp: new Date().toISOString() });
});

// Get all workflow runs
router.get('/workflow-runs', workflowController.getAllWorkflowRuns);

// Get workflow runs for a specific repository
router.get('/workflow-runs/repo/*', workflowController.getRepoWorkflowRuns);

// Sync all workflow runs for a repository
router.post('/workflow-runs/repo/*/sync', workflowController.syncRepositoryWorkflowRuns);

// Get workflow statistics
router.get('/stats', workflowController.getWorkflowStats);

// Get active workflow metrics
router.get('/workflow-runs/metrics', workflowController.getActiveMetrics);

// Get queued workflows
router.get('/workflow-runs/queued', workflowController.getQueuedWorkflows);

// Get workflow run by ID
router.get('/workflow-runs/:id', workflowController.getWorkflowRunById);

// Sync workflow run
router.post('/workflow-runs/:id/sync', workflowController.syncWorkflowRun);

// Update job information for a workflow run
router.post('/workflow-runs/:runId/jobs', workflowController.updateWorkflowJobs);

// Database status endpoint
router.get('/db/status', workflowController.getDatabaseStatus);

// Database backup routes
router.get('/database/backup', workflowController.createBackup);
router.post('/database/restore', workflowController.restoreBackup);

// Get available organizations
router.get('/organizations', async (req, res) => {
    try {
        validateGitHubConfig();
        const organizations = await getAvailableOrganizations();
        res.json({
            success: true,
            data: organizations
        });
    } catch (error) {
        console.error('Error fetching organizations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch organizations',
            error: error.message
        });
    }
});

// Get sync history
router.get('/sync/history', async (req, res) => {
    try {
        const history = await getSyncHistory();
        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Error fetching sync history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sync history',
            error: error.message
        });
    }
});

// Get active sync status
router.get('/sync/active', async (req, res) => {
    try {
        const activeSync = await SyncHistory.findOne({
            status: { $in: ['in_progress', 'paused'] }
        }).sort({ startedAt: -1 });
        
        res.json({
            success: true,
            data: activeSync
        });
    } catch (error) {
        console.error('Error fetching active sync:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active sync status',
            error: error.message
        });
    }
});

// Sync endpoint using installation ID
router.post('/sync/:installationId', async (req, res) => {
    try {
        validateGitHubConfig();
        const { installationId } = req.params;
        const { maxWorkflowRuns = 100 } = req.body;
        
        const results = await syncGitHubData(installationId, req.io, { maxWorkflowRuns });
        
        res.json({
            success: true,
            message: 'GitHub data sync completed successfully',
            results
        });
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync GitHub data',
            error: error.message
        });
    }
});

export default router;