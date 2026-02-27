import mongoose from 'mongoose';
import crypto from 'crypto';
import WorkflowRun from '../models/WorkflowRun.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import * as workflowService from '../services/workflowService.js';

// Middleware: restrict backup/restore endpoints to requests bearing a valid ADMIN_API_TOKEN.
// IP-based allowlists are unreliable behind Docker/Nginx (backend sees the proxy's private IP,
// not the originating client IP). A pre-shared token provides explicit, portable access control.
//
// Usage: set ADMIN_API_TOKEN to a long random secret in your .env file.
// Pass it as: Authorization: Bearer <token>   OR   X-Admin-Token: <token>
export const requireAdminToken = (req, res, next) => {
  const adminToken = process.env.ADMIN_API_TOKEN;

  if (!adminToken) {
    // If no token is configured, fail closed — never allow access.
    return res.status(503).json({ error: 'Admin access is not configured on this server.' });
  }

  const authHeader = req.headers['authorization'] || '';
  const tokenHeader = req.headers['x-admin-token'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const provided = bearerToken || tokenHeader;

  if (!provided) {
    return res.status(401).json({ error: 'Unauthorized: valid admin token required.' });
  }

  // Use constant-time comparison to prevent timing attacks.
  // Hash both tokens to a fixed length (SHA-256) first to eliminate length-based timing leaks.
  try {
    const adminHash = crypto.createHash('sha256').update(adminToken).digest();
    const providedHash = crypto.createHash('sha256').update(provided).digest();

    if (!crypto.timingSafeEqual(adminHash, providedHash)) {
      return res.status(401).json({ error: 'Unauthorized: valid admin token required.' });
    }
  } catch {
    return res.status(401).json({ error: 'Unauthorized: valid admin token required.' });
  }

  next();
};

// Keep legacy alias for any existing route references — points to the new token-based guard.
export const requireLocalhost = requireAdminToken;

export const handleWorkflowRun = async (req, res) => {
  try {
    const workflowRun = await workflowService.processWorkflowRun(req.body);
    req.io.emit('workflowUpdate', workflowRun);
    return successResponse(res, workflowRun, 'Workflow run processed successfully');
  } catch (error) {
    return errorResponse(res, 'Error processing workflow run', 500, error);
  }
};

export const getAllWorkflowRuns = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 30));
    const searchQuery = req.query.search ? String(req.query.search).slice(0, 100) : '';
    const status = req.query.status || 'all';
    const skip = (page - 1) * pageSize;

    // Build the query with search and status filters
    let query = {};
    if (searchQuery) {
      // Escape regex special characters to prevent ReDoS
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query['repository.fullName'] = { $regex: escaped, $options: 'i' };
    }

    // Add status filter
    if (status !== 'all') {
      if (['in_progress', 'queued', 'waiting', 'pending'].includes(status)) {
        query['run.status'] = status;
      } else {
        // For conclusion statuses (success, failure, etc.)
        query['run.status'] = 'completed';
        query['run.conclusion'] = status;
      }
    }

    // First get distinct repositories with filters
    const distinctRepos = await WorkflowRun.distinct('repository.fullName', query);
    const totalCount = distinctRepos.length;

    // Get the paginated repositories
    const paginatedRepos = distinctRepos.slice(skip, skip + pageSize);

    // Then get workflow runs for these repositories.
    // Exclude the repository.fullName search regex from the final query — it was already
    // used to derive paginatedRepos above. Including both $in and $regex on the same field
    // would create conflicting conditions.
    const { 'repository.fullName': _repoFilter, ...nonRepoFilters } = query;
    const hasNonRepoFilters = Object.keys(nonRepoFilters).length > 0;
    const finalQuery = hasNonRepoFilters
      ? { $and: [{ 'repository.fullName': { $in: paginatedRepos } }, nonRepoFilters] }
      : { 'repository.fullName': { $in: paginatedRepos } };

    const workflowRuns = await WorkflowRun.find(finalQuery).sort({ 'run.created_at': -1 });

    return successResponse(res, {
      data: workflowRuns,
      pagination: {
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    return errorResponse(res, 'Error retrieving workflow runs', 500, error);
  }
};

export const getRepoWorkflowRuns = async (req, res) => {
  try {
    const repoPath = req.params[0];
    const { workflowName } = req.query; // Get workflowName from query params

    if (!repoPath) {
      return errorResponse(res, 'Repository name is required', 400);
    }

    // First get the repository document to get all workflows
    const repoDoc = await WorkflowRun.findOne({ 'repository.fullName': repoPath });
    
    if (!repoDoc) {
      return successResponse(res, {
        data: [],
        pagination: { total: 0, page: 1, pageSize: 0, totalPages: 1 }
      });
    }

    // Get all runs with workflow name filter if provided
    const query = { 'repository.fullName': repoPath };
    if (workflowName) {
      query['workflow.name'] = workflowName;
    }

    const runs = await WorkflowRun.find(query).sort({ 'run.created_at': -1 });

    // Attach the full workflows list to each run
    const runsWithWorkflows = runs.map(run => ({
      ...run.toObject(),
      repository: {
        ...run.repository,
        workflows: repoDoc.repository.workflows || []
      }
    }));

    // If we have no runs but have workflows and a specific workflow was requested
    if (runs.length === 0 && workflowName && repoDoc.repository.workflows?.length > 0) {
      const requestedWorkflow = repoDoc.repository.workflows.find(w => w.name === workflowName);
      if (requestedWorkflow) {
        runsWithWorkflows.push({
          repository: {
            ...repoDoc.repository,
            workflows: repoDoc.repository.workflows
          },
          workflow: {
            id: requestedWorkflow.id,
            name: requestedWorkflow.name,
            path: requestedWorkflow.path
          }
        });
      }
    }

    return successResponse(res, {
      data: runsWithWorkflows,
      pagination: {
        total: runs.length,
        page: 1,
        pageSize: runs.length,
        totalPages: 1
      }
    });
  } catch (error) {
    return errorResponse(res, 'Error retrieving repository workflow runs', 500, error);
  }
};

export const getWorkflowStats = async (req, res) => {
  try {
    const stats = await workflowService.calculateWorkflowStats();
    return successResponse(res, stats);
  } catch (error) {
    return errorResponse(res, 'Error retrieving workflow statistics', 500, error);
  }
};

export const updateWorkflowJobs = async (req, res) => {
  try {
    const { runId } = req.params;
    const { jobs } = req.body;
    const updatedRun = await workflowService.updateWorkflowJobs(runId, jobs);
    req.io.emit('workflowJobsUpdate', updatedRun);
    return successResponse(res, updatedRun, 'Workflow jobs updated successfully');
  } catch (error) {
    return errorResponse(res, 'Error updating workflow jobs', 500, error);
  }
};

export const getDatabaseStatus = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const stats = await db.stats();
    const lastWorkflowRun = await WorkflowRun.findOne().sort({ 'run.updated_at': -1 });
    const totalWorkflows = await WorkflowRun.countDocuments();

    const status = {
      totalWorkflows,
      lastUpdated: {
        run: lastWorkflowRun
      },
      storageSize: stats.storageSize,
      dataSize: stats.dataSize,
      collections: stats.collections,
      indexes: stats.indexes,
      avgObjSize: stats.avgObjSize,
      ok: stats.ok
    };

    return successResponse(res, status);
  } catch (error) {
    return errorResponse(res, 'Error retrieving database status', 500, error);
  }
};

export const getWorkflowRunById = async (req, res) => {
  try {
    const { id } = req.params;
    const workflowRun = await WorkflowRun.findOne({ 'run.id': parseInt(id) });
    
    if (!workflowRun) {
      return errorResponse(res, 'Workflow run not found', 404);
    }

    return successResponse(res, workflowRun);
  } catch (error) {
    return errorResponse(res, 'Error retrieving workflow run', 500, error);
  }
};

export const syncWorkflowRun = async (req, res) => {
  try {
    const { id } = req.params;
    const workflowRun = await workflowService.syncWorkflowRun(parseInt(id));
    req.io.emit('workflowUpdate', workflowRun);
    return successResponse(res, workflowRun);
  } catch (error) {
    return errorResponse(res, 'Error syncing workflow run', 500, error);
  }
};

export const syncRepositoryWorkflowRuns = async (req, res) => {
  try {
    const repoPath = req.params[0];
    if (!repoPath) {
      return errorResponse(res, 'Repository name is required', 400);
    }

    const workflowRuns = await workflowService.syncRepositoryWorkflowRuns(repoPath);

    // After sync is complete, emit updates for each workflow run
    if (req.io) {
      workflowRuns.forEach(run => {
        req.io.emit('workflowUpdate', run);
      });
    }

    return successResponse(res, workflowRuns);
  } catch (error) {
    return errorResponse(res, 'Error syncing repository workflow runs', 500, error);
  }
};

export const getActiveMetrics = async (req, res) => {
  try {
    console.log('Getting active workflow metrics...');
    const metrics = await workflowService.getActiveWorkflowMetrics();
    console.log('Metrics response:', metrics);
    return successResponse(res, metrics);
  } catch (error) {
    console.error('Error retrieving active workflow metrics:', error);
    return errorResponse(res, 'Error retrieving active workflow metrics', 500, error);
  }
};

export const createBackup = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.collections();
    const backup = {};

    for (const collection of collections) {
      const documents = await collection.find({}).toArray();
      backup[collection.collectionName] = documents;
    }

    return successResponse(res, backup);
  } catch (error) {
    return errorResponse(res, 'Error creating database backup', 500, error);
  }
};

export const restoreBackup = async (req, res) => {
  try {
    const backupData = req.body.data || req.body;
    const db = mongoose.connection.db;
    
    // Validate backup data structure
    if (!backupData || typeof backupData !== 'object') {
      return errorResponse(res, 'Invalid backup data', 400);
    }

    // Store restore statistics
    const stats = {
      collectionsProcessed: 0,
      documentsRestored: 0,
      errors: []
    };

    // Drop existing collections and restore from backup
    for (const [collectionName, documents] of Object.entries(backupData)) {
      if (Array.isArray(documents)) {
        try {
          // Drop existing collection
          try {
            await db.collection(collectionName).drop();
          } catch (err) {
            // Collection might not exist, continue
          }

          // Restore documents if there are any
          if (documents.length > 0) {
            await db.collection(collectionName).insertMany(documents);
            stats.collectionsProcessed++;
            stats.documentsRestored += documents.length;
          }
        } catch (error) {
          stats.errors.push({
            collection: collectionName,
            error: error.message
          });
        }
      }
    }

    // Get updated database stats
    const dbStats = await db.stats();
    
    return successResponse(res, { 
      message: 'Database restored successfully',
      stats: {
        ...stats,
        databaseSize: dbStats.dataSize,
        totalCollections: dbStats.collections
      }
    });
  } catch (error) {
    return errorResponse(res, 'Error restoring database backup', 500, error);
  }
};

export const getQueuedWorkflows = async (req, res) => {
  try {
    console.log('Fetching queued workflows...');
    const queuedWorkflows = await WorkflowRun.find({
      'run.status': { $in: ['queued', 'waiting', 'pending'] },
      'run.conclusion': null
    }).sort({ 'run.created_at': -1 });
    
    console.log(`Found ${queuedWorkflows.length} queued workflows`);
    
    return successResponse(res, queuedWorkflows);
  } catch (error) {
    console.error('Error fetching queued workflows:', error);
    return errorResponse(res, 'Error fetching queued workflows', 500, error);
  }
};

export const getJobMetrics = async (req, res) => {
  try {
    const metrics = await workflowService.getJobMetrics();
    return successResponse(res, metrics, 'Active job metrics retrieved successfully');
  } catch (error) {
    console.error('Error getting active job metrics:', error);
    return errorResponse(res, 'Failed to get active job metrics');
  }
};