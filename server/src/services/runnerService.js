import { getGitHubClient } from '../utils/githubAuth.js';
import WorkflowRun from '../models/WorkflowRun.js';

// In-memory cache with 2-minute TTL
const cache = {
  data: null,
  fetchedAt: null,
  TTL_MS: 2 * 60 * 1000,
};

const isCacheValid = () =>
  cache.data !== null && cache.fetchedAt !== null && Date.now() - cache.fetchedAt < cache.TTL_MS;

/**
 * Fetch all self-hosted runners across all installations.
 * Org-level runners are fetched per runner group for accurate group names.
 * Repo-level runner fetching is skipped for org installations (org runners
 * are already visible to all repos, and repo-level calls mostly return 403).
 * Results are cached for 5 minutes.
 *
 * All org fetches run in parallel for speed.
 *
 * @returns {Promise<Array>} Flat array of runner objects
 */
export const getAllRunners = async () => {
  if (isCacheValid()) {
    return cache.data;
  }

  const startTime = Date.now();
  const { app, installations } = await getGitHubClient();

  // Process all installations in parallel
  const results = await Promise.allSettled(
    installations.map((installation) => fetchInstallationRunners(installation))
  );

  const runners = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      runners.push(...result.value);
    }
  }

  // Deduplicate by runner id (a runner may appear at both org and repo scope)
  const seen = new Set();
  const unique = runners.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  cache.data = unique;
  cache.fetchedAt = Date.now();
  console.log(`runnerService: fetched ${unique.length} runners from ${installations.length} installations in ${Date.now() - startTime}ms`);

  return unique;
};

/**
 * Fetch runners for a single installation.
 * For orgs: fetch all runners (with busy status), then fetch runner groups
 * to map group IDs to names, and merge the info.
 * For user accounts: fetch repo-level runners.
 */
const fetchInstallationRunners = async (installation) => {
  const runners = [];
  let client;

  try {
    const result = await getGitHubClient(installation.id);
    client = result.app;
  } catch (err) {
    console.error(
      `runnerService: failed to get client for installation ${installation.id}:`,
      err.message
    );
    return runners;
  }

  const account = installation.account;

  if (account.type === 'Organization') {
    try {
      // Two-phase approach:
      // 1. Fetch all runners (raw API) to get accurate busy status
      // 2. Fetch runners per group to get accurate group names
      // Then merge: use group names from phase 2, busy status from phase 1

      const [allRunnersResult, groupMapResult] = await Promise.allSettled([
        client.request('GET /orgs/{org}/actions/runners', {
          org: account.login,
          per_page: 100,
        }),
        fetchRunnerGroupMap(client, account.login),
      ]);

      const groupMap = groupMapResult.status === 'fulfilled' ? groupMapResult.value : new Map();

      // Build a busy status map from the all-runners response
      const busyMap = new Map();
      if (allRunnersResult.status === 'fulfilled') {
        for (const runner of allRunnersResult.value.data.runners) {
          busyMap.set(runner.id, runner.busy ?? false);
          // Debug log for first runner
          if (busyMap.size === 1) {
            console.log(`runnerService: sample runner for ${account.login}: name=${runner.name}, status=${runner.status}, busy=${runner.busy}, runner_group_id=${runner.runner_group_id}`);
          }
        }
      }

      if (groupMap.size > 0) {
        // Fetch runners per group in parallel for accurate group assignment
        const groupResults = await Promise.allSettled(
          [...groupMap.entries()].map(async ([groupId, groupName]) => {
            const { data } = await client.request('GET /orgs/{org}/actions/runner-groups/{runner_group_id}/runners', {
              org: account.login,
              runner_group_id: groupId,
              per_page: 100,
            });
            return data.runners.map((runner) => {
              // Override busy from the all-runners response (more reliable)
              const busy = busyMap.has(runner.id) ? busyMap.get(runner.id) : (runner.busy ?? false);
              return normalizeRunner({ ...runner, busy }, {
                scope: 'org',
                owner: account.login,
                groupName,
              });
            });
          })
        );

        for (const result of groupResults) {
          if (result.status === 'fulfilled') {
            runners.push(...result.value);
          }
        }
      } else if (allRunnersResult.status === 'fulfilled') {
        // Fallback: use all-runners response if groups couldn't be fetched
        for (const runner of allRunnersResult.value.data.runners) {
          runners.push(normalizeRunner(runner, { scope: 'org', owner: account.login }));
        }
      }
    } catch (err) {
      console.error(
        `runnerService: failed to list org runners for ${account.login}:`,
        err.message
      );
    }
    // Skip repo-level fetching for orgs — org runners are already visible
    // to all repos, and repo-level calls mostly return 403.
  } else {
    // User-level: fetch repo-level runners
    try {
      const { data: reposData } = await client.rest.apps.listReposAccessibleToInstallation({
        per_page: 100,
      });

      if (reposData.repositories && reposData.repositories.length > 0) {
        const repoResults = await Promise.allSettled(
          reposData.repositories.map(async (repo) => {
            const { data: runnerData } = await client.rest.actions.listSelfHostedRunnersForRepo({
              owner: repo.owner.login,
              repo: repo.name,
              per_page: 100,
            });
            return runnerData.runners.map((runner) =>
              normalizeRunner(runner, { scope: 'repo', owner: repo.owner.login, repo: repo.name })
            );
          })
        );

        for (const result of repoResults) {
          if (result.status === 'fulfilled') {
            runners.push(...result.value);
          }
        }
      }
    } catch (err) {
      console.error(
        `runnerService: failed to list repos for installation ${installation.id}:`,
        err.message
      );
    }
  }

  return runners;
};

/**
 * Get a single runner by its numeric GitHub runner ID.
 *
 * @param {number|string} runnerId
 * @returns {Promise<Object|null>}
 */
export const getRunnerById = async (runnerId) => {
  const runners = await getAllRunners();
  const id = Number(runnerId);
  return runners.find((r) => r.id === id) ?? null;
};

/**
 * Invalidate the in-memory cache (useful after a status update event).
 */
export const invalidateCache = () => {
  cache.data = null;
  cache.fetchedAt = null;
};

/**
 * Get cache metadata (TTL, age, whether valid).
 */
export const getCacheInfo = () => ({
  ttlMs: cache.TTL_MS,
  cachedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null,
  ageMs: cache.fetchedAt ? Date.now() - cache.fetchedAt : null,
  valid: isCacheValid(),
});

/**
 * Enrich runners with active workflow/job info from the RunWatch database.
 * For busy runners, find the in-progress workflow run whose jobs match the runner name.
 */
export const enrichRunnersWithActiveJobs = async (runners) => {
  const busyRunners = runners.filter((r) => r.status === 'busy');
  if (busyRunners.length === 0) return runners;

  const busyNames = busyRunners.map((r) => r.name);

  try {
    // Find in-progress workflow runs that have jobs assigned to these runners
    const activeRuns = await WorkflowRun.find({
      'run.status': 'in_progress',
      'jobs.runner_name': { $in: busyNames },
    }).lean();

    // Build a map: runner_name → { workflow info, job info, links }
    const runnerJobMap = new Map();
    for (const run of activeRuns) {
      if (!run.jobs) continue;
      for (const job of run.jobs) {
        if (job.runner_name && busyNames.includes(job.runner_name) && job.status === 'in_progress') {
          runnerJobMap.set(job.runner_name, {
            workflowName: run.workflow?.name ?? null,
            workflowRunId: run.run?.id ?? null,
            workflowRunUrl: run.run?.url ?? null,
            jobName: job.name ?? null,
            repository: run.repository?.fullName ?? null,
          });
        }
      }
    }

    // Also check runner_name at the run level (for runs without job details)
    if (runnerJobMap.size < busyRunners.length) {
      const remainingNames = busyNames.filter((n) => !runnerJobMap.has(n));
      if (remainingNames.length > 0) {
        const runLevelMatches = await WorkflowRun.find({
          'run.status': 'in_progress',
          'run.runner_name': { $in: remainingNames },
        }).lean();

        for (const run of runLevelMatches) {
          if (run.run?.runner_name && remainingNames.includes(run.run.runner_name)) {
            runnerJobMap.set(run.run.runner_name, {
              workflowName: run.workflow?.name ?? null,
              workflowRunId: run.run?.id ?? null,
              workflowRunUrl: run.run?.url ?? null,
              jobName: null,
              repository: run.repository?.fullName ?? null,
            });
          }
        }
      }
    }

    // Attach active job info to runners
    return runners.map((r) => {
      if (r.status === 'busy' && runnerJobMap.has(r.name)) {
        return { ...r, activeJob: runnerJobMap.get(r.name) };
      }
      return r;
    });
  } catch (err) {
    console.error('runnerService: failed to enrich runners with active jobs:', err.message);
    return runners;
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch org-level runner groups and return a Map of groupId → groupName.
 * Uses a raw API request to avoid Octokit version issues with the
 * listSelfHostedRunnerGroupsForOrg convenience method.
 * Gracefully returns an empty map if the API call fails.
 */
const fetchRunnerGroupMap = async (client, org) => {
  const map = new Map();
  try {
    const { data } = await client.request('GET /orgs/{org}/actions/runner-groups', {
      org,
      per_page: 100,
    });
    for (const group of data.runner_groups) {
      map.set(group.id, group.name);
    }
    console.log(`runnerService: fetched ${map.size} runner groups for ${org}`);
  } catch (err) {
    console.error(`runnerService: failed to fetch runner groups for ${org}: status=${err.status}, message=${err.message}`);
  }
  return map;
};

/**
 * Normalise a raw GitHub runner object into the shape our API returns.
 */
const normalizeRunner = (runner, context) => {
  // Group name priority:
  // 1. Explicit groupName from context (from per-group fetch)
  // 2. Lookup via groupMap + runner_group_id (legacy path)
  // 3. runner_group_name if API returns it directly
  let groupName = context.groupName ?? null;
  if (!groupName && context.groupMap && runner.runner_group_id) {
    groupName = context.groupMap.get(runner.runner_group_id) ?? null;
  }
  if (!groupName && runner.runner_group_name) {
    groupName = runner.runner_group_name;
  }

  return {
    id: runner.id,
    name: runner.name,
    status: deriveStatus(runner),
    os: runner.os ?? null,
    labels: (runner.labels ?? []).map((l) => l.name),
    runnerGroup: groupName,
    runnerGroupId: runner.runner_group_id ?? null,
    busy: runner.busy ?? false,
    scope: context.scope,
    owner: context.owner,
    repo: context.repo ?? null,
  };
};

/**
 * Map GitHub's status + busy flag to one of: online | busy | idle | offline
 */
const deriveStatus = (runner) => {
  if (runner.status === 'offline') return 'offline';
  if (runner.busy) return 'busy';
  return 'idle';
};
