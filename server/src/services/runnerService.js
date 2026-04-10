import { getGitHubClient } from '../utils/githubAuth.js';

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
        // Fetch runner groups first to map group IDs to names
        const groupMap = await fetchRunnerGroupMap(client, account.login);

        const { data } = await client.rest.actions.listSelfHostedRunnersForOrg({
          org: account.login,
          per_page: 100,
        });
        for (const runner of data.runners) {
          runners.push(normalizeRunner(runner, {
            scope: 'org',
            owner: account.login,
            groupMap,
          }));
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch org-level runner groups and return a Map of groupId → groupName.
 * Gracefully returns an empty map if the API call fails (e.g. missing permission).
 */
const fetchRunnerGroupMap = async (client, org) => {
  const map = new Map();
  try {
    const { data } = await client.rest.actions.listSelfHostedRunnerGroupsForOrg({
      org,
      per_page: 100,
    });
    for (const group of data.runner_groups) {
      map.set(group.id, group.name);
    }
  } catch (err) {
    console.error(`runnerService: failed to fetch runner groups for ${org}:`, err.message);
  }
  return map;
};

/**
 * Normalise a raw GitHub runner object into the shape our API returns.
 */
const normalizeRunner = (runner, context) => {
  // Resolve runner group name: use the groupMap (from org-level fetch) if available,
  // fall back to runner_group_name if the API ever includes it.
  let groupName = null;
  if (context.groupMap && runner.runner_group_id) {
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
