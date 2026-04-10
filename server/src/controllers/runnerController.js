import { successResponse, errorResponse } from '../utils/responseHandler.js';
import * as runnerService from '../services/runnerService.js';
import { getGitHubClient } from '../utils/githubAuth.js';

// Sanitize external values before embedding in log messages to prevent log injection.
const sanitizeLog = (v) => (v == null ? '' : String(v).replace(/[\r\n\t\x00-\x1F\x7F]/g, ' '));

const VALID_STATUSES = new Set(['all', 'online', 'busy', 'idle', 'offline']);

// Permission check cache (5-minute TTL)
const permissionCache = { result: null, fetchedAt: null, TTL_MS: 5 * 60 * 1000 };

/**
 * GET /runners/status
 * Checks whether the GitHub App has the Self-hosted runners (Read) permission.
 * Result is cached for 5 minutes.
 */
export const checkRunnersStatus = async (req, res) => {
  if (
    permissionCache.result !== null &&
    permissionCache.fetchedAt !== null &&
    Date.now() - permissionCache.fetchedAt < permissionCache.TTL_MS
  ) {
    return successResponse(res, permissionCache.result, 'Runner permission status');
  }

  try {
    const { installations } = await getGitHubClient();

    if (!installations || installations.length === 0) {
      const result = { available: false, reason: 'No GitHub App installations found' };
      permissionCache.result = result;
      permissionCache.fetchedAt = Date.now();
      return successResponse(res, result, 'Runner permission status');
    }

    const installation = installations[0];
    const account = installation.account;

    let client;
    try {
      const r = await getGitHubClient(installation.id);
      client = r.app;
    } catch {
      const result = { available: false, reason: 'Failed to authenticate with GitHub App' };
      permissionCache.result = result;
      permissionCache.fetchedAt = Date.now();
      return successResponse(res, result, 'Runner permission status');
    }

    if (account.type === 'Organization') {
      await client.rest.actions.listSelfHostedRunnersForOrg({ org: account.login, per_page: 1 });
    } else {
      const { data: reposData } = await client.rest.apps.listReposAccessibleToInstallation({ per_page: 1 });
      if (reposData.repositories && reposData.repositories.length > 0) {
        const repo = reposData.repositories[0];
        await client.rest.actions.listSelfHostedRunnersForRepo({
          owner: repo.owner.login,
          repo: repo.name,
          per_page: 1,
        });
      }
    }

    const result = { available: true, reason: 'Self-hosted runners permission granted' };
    permissionCache.result = result;
    permissionCache.fetchedAt = Date.now();
    return successResponse(res, result, 'Runner permission status');
  } catch (err) {
    let result;
    if (err.status === 403) {
      result = { available: false, reason: 'GitHub App lacks Self-hosted runners (Read) permission' };
    } else if (err.status === 404) {
      result = { available: false, reason: 'Runners API not accessible for this installation' };
    } else {
      result = { available: false, reason: 'Unable to verify runner permissions' };
    }
    permissionCache.result = result;
    permissionCache.fetchedAt = Date.now();
    return successResponse(res, result, 'Runner permission status');
  }
};

/**
 * GET /runners
 * Query params: status (all|online|busy|idle|offline), label, group
 */
export const listRunners = async (req, res) => {
  try {
    const { status = 'all', label = '', group = '' } = req.query;

    if (!VALID_STATUSES.has(status)) {
      return errorResponse(res, `Invalid status filter: ${sanitizeLog(status)}`, 400);
    }

    let runners = await runnerService.getAllRunners();

    if (status !== 'all') {
      runners = runners.filter((r) => r.status === status);
    }

    if (label) {
      const labelFilter = String(label).slice(0, 100).toLowerCase();
      runners = runners.filter((r) =>
        r.labels.some((l) => l.toLowerCase().includes(labelFilter))
      );
    }

    if (group) {
      const groupFilter = String(group).slice(0, 100).toLowerCase();
      runners = runners.filter(
        (r) => r.runnerGroup && r.runnerGroup.toLowerCase().includes(groupFilter)
      );
    }

    const summary = {
      total: runners.length,
      online: runners.filter((r) => r.status === 'idle').length,
      busy: runners.filter((r) => r.status === 'busy').length,
      offline: runners.filter((r) => r.status === 'offline').length,
    };

    return successResponse(res, { runners, summary }, 'Runners fetched successfully');
  } catch (error) {
    console.error('runnerController.listRunners error:', error);
    return errorResponse(res, 'Failed to fetch runners', 500, error);
  }
};

/**
 * GET /runners/:runnerId
 */
export const getRunner = async (req, res) => {
  try {
    const { runnerId } = req.params;

    if (!/^\d+$/.test(runnerId)) {
      return errorResponse(res, 'Invalid runner ID', 400);
    }

    const runner = await runnerService.getRunnerById(runnerId);

    if (!runner) {
      return errorResponse(res, 'Runner not found', 404);
    }

    return successResponse(res, runner, 'Runner fetched successfully');
  } catch (error) {
    console.error('runnerController.getRunner error:', sanitizeLog(req.params?.runnerId), error);
    return errorResponse(res, 'Failed to fetch runner', 500, error);
  }
};
