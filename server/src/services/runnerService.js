import { getGitHubClient } from '../utils/githubAuth.js';
import WorkflowRun from '../models/WorkflowRun.js';

// In-memory cache with 60-second TTL
const cache = {
  data: null,
  fetchedAt: null,
  TTL_MS: 60 * 1000,
};

const isCacheValid = () =>
  cache.data !== null && cache.fetchedAt !== null && Date.now() - cache.fetchedAt < cache.TTL_MS;

/**
 * Fetch all self-hosted runners across all installations (org + repo level).
 * Results are cached for 60 seconds to avoid hammering the GitHub API.
 *
 * @returns {Promise<Array>} Flat array of runner objects
 */
export const getAllRunners = async () => {
  if (isCacheValid()) {
    return cache.data;
  }

  const { app, installations } = await getGitHubClient();
  const runners = [];

  for (const installation of installations) {
    let client;
    try {
      const result = await getGitHubClient(installation.id);
      client = result.app;
    } catch (err) {
      console.error(
        `runnerService: failed to get client for installation ${installation.id}:`,
        err.message
      );
      continue;
    }

    const account = installation.account;

    // Org-level runners
    if (account.type === 'Organization') {
      try {
        // Strategy: fetch runner groups, then fetch runners per group.
        // This gives us accurate group names without relying on runner_group_id
        // in the runner object (which some Octokit/API versions may not return).
        const groupMap = await fetchRunnerGroupMap(client, account.login);

        if (groupMap.size > 0) {
          // Fetch runners per group for accurate group assignment
          for (const [groupId, groupName] of groupMap) {
            try {
              const { data } = await client.request('GET /orgs/{org}/actions/runner-groups/{runner_group_id}/runners', {
                org: account.login,
                runner_group_id: groupId,
                per_page: 100,
              });
              for (const runner of data.runners) {
                runners.push(normalizeRunner(runner, {
                  scope: 'org',
                  owner: account.login,
                  groupName,
                }));
              }
            } catch (err) {
              console.error(
                `runnerService: failed to list runners for group ${groupName} (${groupId}) in ${account.login}:`,
                err.message
              );
            }
          }
        } else {
          // Fallback: fetch all runners if group fetch failed
          const { data } = await client.rest.actions.listSelfHostedRunnersForOrg({
            org: account.login,
            per_page: 100,
          });
          for (const runner of data.runners) {
            runners.push(normalizeRunner(runner, {
              scope: 'org',
              owner: account.login,
            }));
          }
        }
      } catch (err) {
        console.error(
          `runnerService: failed to list org runners for ${account.login}:`,
          err.message
        );
      }
    }

    // Repo-level runners — list repos for this installation then fetch runners per repo
    try {
      let page = 1;
      while (true) {
        const { data: reposData } = await client.rest.apps.listReposAccessibleToInstallation({
          per_page: 100,
          page,
        });
        if (!reposData.repositories || reposData.repositories.length === 0) break;

        for (const repo of reposData.repositories) {
          try {
            const { data: runnerData } =
              await client.rest.actions.listSelfHostedRunnersForRepo({
                owner: repo.owner.login,
                repo: repo.name,
                per_page: 100,
              });
            for (const runner of runnerData.runners) {
              runners.push(
                normalizeRunner(runner, {
                  scope: 'repo',
                  owner: repo.owner.login,
                  repo: repo.name,
                })
              );
            }
          } catch (err) {
            // Skip repos where the app lacks runner read permission
            if (err.status !== 403 && err.status !== 404) {
              console.error(
                `runnerService: failed to list repo runners for ${repo.full_name}:`,
                err.message
              );
            }
          }
        }

        if (reposData.repositories.length < 100) break;
        page++;
      }
    } catch (err) {
      console.error(
        `runnerService: failed to list repos for installation ${installation.id}:`,
        err.message
      );
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

  return unique;
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
