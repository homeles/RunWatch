# RunWatch code review and backlog (2026-11-25)

This document records a full read of the codebase at `f66b8ba` (main) and a backlog for the next round of work. The backlog draws on GitHub platform changes from 2024 to November 2026.

## 1. What RunWatch is

RunWatch is a self-hosted, real-time dashboard for GitHub Actions. It runs as a GitHub App and receives `workflow_run` and `workflow_job` webhooks. It stores runs and jobs in MongoDB and pushes changes to a React UI over Socket.IO. It also polls the REST API for history and for self-hosted runners.

```
GitHub ──webhooks──▶ server.js (/api/webhooks/github, HMAC verify)
                        │
                        ▼
                  workflowService ──▶ MongoDB (WorkflowRun, SyncHistory)
                        │                     ▲
                        ▼                     │
                   Socket.IO ──▶ React client ─┘ REST (/api/*)
GitHub REST ◀── syncService / runnerService (Octokit, GitHub App installation tokens)
```

| Area | Files | Notes |
|---|---|---|
| Ingest | `server.js`, `src/middleware/github.js` | Reads the raw body, then checks `X-Hub-Signature-256` with `timingSafeEqual`. Handles `workflow_run`, `workflow_job` and `ping`. |
| Data model | `src/models/WorkflowRun.js` | One document per run, with `jobs[]` and `steps[]` embedded. It also stores a per-repo `repository.workflows` list. There are no indexes. |
| Run/job logic | `src/services/workflowService.js` | Upserts runs. Merges job events into the parent run. Calculates stats, active metrics and job metrics. `syncWorkflowRun`, `syncRepositoryWorkflowRuns` and `syncStaleWorkflowRuns` live here. |
| Org sync | `src/services/syncService.js` | Walks every repo, workflow, run and job for one installation. It checks the rate limit before each step and pauses when fewer than 100 requests remain. Progress is reported over Socket.IO and persisted in `SyncHistory`. |
| Runners | `src/services/runnerService.js`, `src/controllers/runnerController.js` | Collects org runners, runner groups and repo runners for every installation. Results are cached in memory for 2 minutes. Busy runners are matched to the in-progress jobs stored in Mongo. |
| Hardening | `server.js`, `workflowController.js` | helmet, a CORS allowlist, a global rate limit of 1000 requests per 15 minutes, 10 requests per minute on `/sync`, an admin token for backup and restore, regex escaping on search, and a `REPO_PATH_RE` check on repo paths. |
| Client | `client/src/features/*` | Dashboard (org → repo → workflow cards), WorkflowDetails (jobs and steps), WorkflowHistory, RepositoryView, RepositoryStats (Chart.js), RunnersView, Settings (sync, backup and restore, DB status). |
| Deploy | `docker-compose.yml`, `helm/runwatch`, `client/nginx.conf`, `client/docker-entrypoint.sh` | Docker Compose runs Mongo, the server and the client behind nginx. A Helm chart is included. The client rewrites its API URL at runtime with `sed`. |
| CI | `.github/workflows/*` | CI covers build, tsc (non-blocking), lint (non-blocking), tests (none exist), audit, Docker and a compose smoke test. CodeQL, dependency review, Pages demo deploy, manual GHCR publish and a gh-aw `metrics-collector` workflow are also present. |

## 2. Findings (code review)

Severity: 🔴 fix soon · 🟠 should fix · 🟡 improvement

### Security
- 🔴 **Most write endpoints have no authentication.** Only backup and restore need `ADMIN_API_TOKEN`. Anyone who can reach the API can call `DELETE /api/workflow-runs/:id`, `POST /api/sync/:installationId`, `POST /workflow-runs/repo/*/sync`, `POST /workflow-runs/:runId/jobs` (which overwrites jobs with an arbitrary body), `POST /runners/cache/invalidate` and `POST /workflow-runs/sync-stale`. The sync endpoints use up the App's rate limit. Put these behind the admin token, or behind the planned auth layer.
- 🟠 **`POST /database/restore` can drop any collection.** It drops and refills whatever collection names appear in the body. Restrict it to an allowlist (`workflowruns`, `synchistories`).
- 🟠 **Error details leak.** `api.js` returns `error.message` from Octokit and Mongo errors in every environment (`/organizations`, `/sync/*`). `responseHandler` already hides these details outside development, so the inline handlers should do the same.
- 🟠 **CORS rejections return 500.** A disallowed origin produces an `Error` that ends up in the generic handler, so the response is `500 Internal Server Error`. It should be a 403. Low risk, but it adds noise to logs and alerts.
- 🟡 Socket.IO has no auth. Every connected client receives every event for every org. That is fine on a single-tenant LAN but needs revisiting together with the "multi-user" item.
- 🟡 `githubAuth.js` reads the private key from disk and builds a new Octokit on every call, which happens several times per request. It logs the key length and path each time. Cache one App client and one client per installation, which `@octokit/app` does for you.

### Correctness
- 🔴 **Org sync is broken for user-account installations.** `syncGitHubData` always calls `repos.listForOrg`. That returns 404 for a `User` installation, which the runner code handles but the sync code does not. Use `apps.listReposAccessibleToInstallation` in both cases.
- 🟠 **Runner lists are capped at 100.** `GET /orgs/{org}/actions/runners`, the per-group runner lists, the runner groups and `listReposAccessibleToInstallation` are all called once with `per_page: 100` and never paginated. Orgs with more than 100 runners or repos show partial data. Use `octokit.paginate`.
- 🟠 **`results.workflows++` runs twice per workflow** in `syncService`, so the reported workflow count is double the real one.
- 🟠 **Duration uses `updated_at - created_at`** (`calculateWorkflowStats`). That counts queue time and re-run gaps. Issue #39 tracks this. Use `run_started_at` and the job `started_at`/`completed_at` instead.
- 🟠 **A `workflow_job` event can move a run backwards.** When a run already exists, a late job event with status `in_progress` sets `run.status = 'in_progress'` unconditionally (`processWorkflowJobEvent`). If it arrives after `workflow_run completed`, the run shows as in progress again while keeping its `success` conclusion. Use `run_attempt` and `updated_at` to decide which update wins.
- 🟠 **Re-runs are invisible.** `run_attempt` is not stored. Each attempt overwrites the previous one under the same `run.id`.
- 🟡 Status and conclusion enums are hard-coded in four places (model, two sync loops, controller). Statuses GitHub adds later fail validation or get coerced to `pending`.
- 🟡 Repo-path normalization for `/workflow-runs/repo/*` lowercases nothing. GitHub logins are case-insensitive, so the same repo can be stored as two different repos.
- 🟡 The `getRepoWorkflowRuns` "repo doc" lookup uses `findOne` on a run document. The first run found carries `repository.workflows` only if a repo sync has already happened.

### Performance
- 🔴 **There are no Mongo indexes.** Every lookup by `run.id`, `repository.fullName`, `run.status` or `run.created_at` scans the whole collection. Add indexes on `{ 'run.id': 1 }` (unique), `{ 'repository.fullName': 1, 'run.created_at': -1 }`, `{ 'run.status': 1, 'run.updated_at': 1 }` and `{ 'jobs.runner_name': 1 }`.
- 🟠 `getAllWorkflowRuns` calls `distinct()` on every repo and then loads every run for the paginated repos, with no limit. For a busy repo that means thousands of documents per dashboard load.
- 🟠 `getRepoWorkflowRuns` returns every run for a repo with no pagination, even though the client sends `page` and `pageSize`.
- 🟡 `getActiveMetrics` and `getJobMetrics` log the full aggregate as JSON on every call. The dashboard polls these, so the logs fill up quickly. There are 56 `console.log` calls on the server and 20 on the client. Use a leveled logger such as pino.
- 🟡 `syncRepositoryWorkflowRuns` processes requests one at a time and never checks the rate limit, unlike `syncService`.

### Maintainability
- 🟠 **There are no tests.** CI shows a test job, but it falls back to "No tests found — skipping". The smoke script used for this PR (webhook → DB → Socket.IO → REST) is a natural first integration test.
- 🟠 `client/package.json` still uses **Create React App** (`react-scripts` 5, now deprecated). It accounts for all 19 remaining `npm audit` findings, all of them dev or build-time. Issue #53 (move to Vite) covers this. `client/index.html` and `client/vite.config.js` exist but are empty placeholders.
- 🟡 `apiService.js` defines `getDatabaseStatus` twice and exports the same metrics under two names (`getActiveMetrics` and `getWorkflowMetrics`). `socketService.js` and `apiService.js` each open their own Socket.IO connection, so every browser tab holds two websockets.
- 🟡 In CI, `tsc` and lint use `continue-on-error`, and audits end in `|| true`. CI can't fail on any of them.
- 🟡 `docker-compose.yml` uses `mongo:latest` and the obsolete `version:` key. `build-and-publish` only tags `:latest`, so image tags can't be traced back to a commit.
- 🟡 `deploy-demo.yml` merges `main` into `demo` with `-X ours` and pushes on every client change. That works, but it should be documented.

## 3. Backlog

Ordered by value. Sources are in [`github-feature-research`](#4-sources).

### Must-do (platform changes already in effect)
1. **Retention-aware history.** Since 2026-10-01, GitHub deletes workflow runs, checks and statuses once the Actions retention period ends (90 days by default). RunWatch's database is now the only long-term record.
   - Never delete a local run because GitHub returns 404. Mark it `purgedUpstream`.
   - `sync-stale` should stop retrying runs that come back 404.
   - Read and show each org's or repo's retention setting.
2. **Windowed historical sync.** Since 2026-09-25, list-runs queries return at most 1,000 results, and counts above 2,500 show as "2,500+". Split the sync by `created=` date windows and stop trusting `total_count` for progress.
3. **Pin `X-GitHub-Api-Version`** and plan the move to `2026-03-10`. In that version `rate` is removed from `/rate_limit` (RunWatch already reads `resources.core`), `has_downloads` is removed, and dispatch returns 200. Also check for anything that assumes a 40-character installation token: stateless tokens are about 520 characters.
4. **Runner version enforcement.** GHEC has enforced it since 2026-09-29. Call `GET .../actions/runners/deprecations/{version}` for each distinct runner version, show an "outdated / will stop receiving jobs on X" badge, and explain long-queued jobs.
5. **Status model.** Accept `pending` and `requested` (now produced by concurrency-group queues), `action_required` (approval holds) and `waiting` (environment approval). Separate approval and concurrency waits from runner queue time.

### High value
6. **Queue-time analytics** (#38). For each job, compute `started_at - created_at`, with p50 and p95 by label, runner group and repo. Add a peak-concurrent-jobs chart for capacity planning. GitHub's Actions Performance Metrics has **no public API**, and this would fill that gap.
7. **Duration trends** (#40, #39). Base them on `run_started_at` and job timestamps. Since 2026-06-25, steps can run in parallel, so draw a timeline instead of adding up step durations.
8. **GitHub-hosted (larger) runners view.** Use `/orgs/{org}/actions/hosted-runners`: status (including `Stuck`), size, image and `maximum_runners`. Larger runners were removed from the self-hosted list API in July 2025.
9. **Failure classification.** Separate real CI failures from platform blocks:
   - workflow execution protections
   - `pull_request_target` being blocked by default in public repos from 2026-12-02
   - SHA-pinning and blocked-action policy
   - workflow lockfile missing or stale
   - the re-run cap of 50
   - runs held for approval
10. **Agent and GitHub-managed workload attribution.** Tag Copilot coding agent runs, Copilot code review (which uses Actions minutes since 2026-06-01), gh-aw agentic workflows (GA 2026-10-28) and `dynamic/*` runs. Show their minutes and cost separately.
11. **Deployment approval visibility** (#20). Handle the `waiting` action on `workflow_job` and its `deployment` object.

### Medium
12. Cost view: a configurable rate table, joined with the enhanced billing usage API (`/organizations/{org}/settings/billing/usage`). The old `/timing` usage endpoints are being shut down.
13. Force-cancel stuck runs from the sync-stale UI (`POST .../force-cancel`, needs `actions:write`). Treat any self-hosted job running longer than 5 days as dead.
14. Cache panel: cache usage and limits per org and repo.
15. Governance page: Actions policies, lockfile adoption, and allowed-actions settings.
16. ARC integration: scrape listener metrics, which use the `workflow_name` and `target` labels since ARC 0.14. Group ephemeral scale-set runners by scale set instead of listing each runner by name.

### Engineering
17. Auth for write endpoints (see the security finding), then multi-user auth through GitHub OAuth, which the README lists as a future enhancement.
18. Mongo indexes and server-side pagination.
19. Move from CRA to Vite (#53). This clears the remaining 19 dev-only audit findings.
20. Tests: start from the webhook → DB → Socket.IO → REST smoke test used to verify this PR. Make `tsc`, lint and audit block CI.
21. Larger dependency upgrades, each in its own PR: Express 5, Mongoose 9, dotenv 17+, @octokit/webhooks 14, Tailwind 4, TypeScript 6/7, web-vitals 5 (which drops `getFID`), user-event 14.
22. Image tags: publish `:sha` and semver tags alongside `:latest`, pin `mongo:<major>`, and drop the compose `version:` key.

## 4. Sources

The full research table, with every link fetched on 2026-11-25, is in the PR description. Key items:
- Retention covers runs, checks and statuses: https://github.blog/changelog/2026-10-01-actions-retention-now-covers-checks-runs-and-statuses/
- Query result caps: https://github.blog/changelog/2026-09-25-changes-to-query-results-in-the-github-actions-api-and-ui/
- REST API versions: https://docs.github.com/en/rest/about-the-rest-api/api-versions
- Stateless installation tokens: https://github.blog/changelog/2026-10-02-stateless-github-app-installation-tokens-rolled-out/
- Runner version enforcement: https://github.blog/changelog/2026-09-28-self-hosted-runner-version-enforcement-date-has-moved/
- Runner deprecation API: https://github.blog/changelog/2026-09-03-github-actions-early-september-2026-updates/
- Performance metrics (no public API): https://github.com/orgs/community/discussions/188189
- Hosted runners API: https://docs.github.com/en/rest/actions/hosted-runners
- Larger runners removed from the self-hosted API: https://github.blog/changelog/2025-06-27-upcoming-breaking-change-for-github-actions-removal-of-larger-hosted-runners-from-self-hosted-api/
- Concurrency queues: https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/
- Parallel steps: https://github.blog/changelog/2026-06-25-actions-steps-can-now-be-run-in-parallel/
- `pull_request_target` blocked by default: https://github.blog/changelog/2026-11-02-pull_request_target-blocked-by-default-december-2/
- Workflow execution protections: https://github.blog/changelog/2026-09-17-workflow-execution-protections-in-github-actions-generally-available/
- Agentic workflows GA: https://github.blog/changelog/2026-10-28-github-agentic-workflows-generally-available/
- Copilot code review uses Actions minutes: https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/
- Node 20 removed from runners: https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/
