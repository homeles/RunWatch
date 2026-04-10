import { successResponse, errorResponse } from '../utils/responseHandler.js';
import * as runnerService from '../services/runnerService.js';

// Sanitize external values before embedding in log messages to prevent log injection.
const sanitizeLog = (v) => (v == null ? '' : String(v).replace(/[\r\n\t\x00-\x1F\x7F]/g, ' '));

const VALID_STATUSES = new Set(['all', 'online', 'busy', 'idle', 'offline']);

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
