// Mock data for RunWatch Demo Mode
// Realistic GitHub Actions workflow data across multiple repos

const now = new Date();
const hour = (h) => new Date(now.getTime() - h * 3600000).toISOString();

// ── Repositories ──────────────────────────────────────────
const repos = [
  { name: 'acme-corp/web-platform', fullName: 'acme-corp/web-platform' },
  { name: 'acme-corp/api-gateway', fullName: 'acme-corp/api-gateway' },
  { name: 'acme-corp/mobile-app', fullName: 'acme-corp/mobile-app' },
  { name: 'acme-corp/infra-terraform', fullName: 'acme-corp/infra-terraform' },
  { name: 'acme-corp/data-pipeline', fullName: 'acme-corp/data-pipeline' },
];

const workflows = {
  'acme-corp/web-platform': [
    { name: 'CI', id: 1001 },
    { name: 'Deploy Production', id: 1002 },
    { name: 'E2E Tests', id: 1003 },
    { name: 'CodeQL Analysis', id: 1004 },
  ],
  'acme-corp/api-gateway': [
    { name: 'Build & Test', id: 2001 },
    { name: 'Deploy Staging', id: 2002 },
    { name: 'Deploy Production', id: 2003 },
    { name: 'Security Scan', id: 2004 },
  ],
  'acme-corp/mobile-app': [
    { name: 'iOS Build', id: 3001 },
    { name: 'Android Build', id: 3002 },
    { name: 'Unit Tests', id: 3003 },
    { name: 'Release', id: 3004 },
  ],
  'acme-corp/infra-terraform': [
    { name: 'Plan', id: 4001 },
    { name: 'Apply', id: 4002 },
    { name: 'Drift Detection', id: 4003 },
  ],
  'acme-corp/data-pipeline': [
    { name: 'CI', id: 5001 },
    { name: 'Integration Tests', id: 5002 },
    { name: 'Deploy', id: 5003 },
  ],
};

const branches = ['main', 'develop', 'feature/auth-v2', 'fix/memory-leak', 'release/v2.1', 'hotfix/cve-2026', 'feat/dark-mode', 'chore/deps-update'];
const events = ['push', 'pull_request', 'workflow_dispatch', 'schedule', 'release'];
const labels = [
  ['ubuntu-latest'],
  ['ubuntu-22.04'],
  ['windows-latest'],
  ['macos-latest'],
  ['macos-14'],
  ['self-hosted', 'linux', 'x64'],
  ['self-hosted', 'macOS', 'arm64'],
  ['ubuntu-latest', 'gpu'],
];

const conclusions = ['success', 'success', 'success', 'success', 'success', 'success', 'failure', 'cancelled', 'success', 'success'];
const statuses = ['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'in_progress', 'queued'];

// Deterministic seeded random
let seed = 42;
function rand() {
  seed = (seed * 16807 + 0) % 2147483647;
  return (seed - 1) / 2147483646;
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }

// ── Generate Runs ──────────────────────────────────────────
let runIdCounter = 10000;
const allRuns = [];

repos.forEach((repo) => {
  const repoWorkflows = workflows[repo.fullName];
  repoWorkflows.forEach((wf) => {
    const runCount = randInt(5, 15);
    for (let i = 0; i < runCount; i++) {
      const hoursAgo = rand() * 168; // last 7 days
      const durationSec = randInt(12, 600);
      const status = pick(statuses);
      const conclusion = status === 'completed' ? pick(conclusions) : null;
      const branch = pick(branches);
      const event = pick(events);
      const label = pick(labels);
      const runNumber = runCount - i;
      const createdAt = hour(hoursAgo);
      const updatedAt = status === 'completed'
        ? new Date(new Date(createdAt).getTime() + durationSec * 1000).toISOString()
        : null;

      const runId = runIdCounter++;
      const jobCount = randInt(1, 4);
      const jobs = [];
      for (let j = 0; j < jobCount; j++) {
        const jobNames = ['build', 'test', 'lint', 'deploy', 'security-scan', 'e2e', 'docker-build', 'publish'];
        const jobName = jobNames[j % jobNames.length];
        const jobStatus = status === 'in_progress' && j === jobCount - 1 ? 'in_progress' :
                          status === 'queued' ? 'queued' : 'completed';
        const jobConclusion = jobStatus === 'completed' ? (conclusion === 'failure' && j === jobCount - 1 ? 'failure' : 'success') : null;
        jobs.push({
          id: runId * 100 + j,
          name: jobName,
          status: jobStatus,
          conclusion: jobConclusion,
          started_at: createdAt,
          completed_at: jobStatus === 'completed' ? new Date(new Date(createdAt).getTime() + randInt(10, durationSec) * 1000).toISOString() : null,
          runner_name: label.includes('self-hosted') ? `runner-${randInt(1, 5)}` : null,
          labels: label,
          steps: [
            { name: 'Set up job', status: 'completed', conclusion: 'success', number: 1, started_at: createdAt, completed_at: createdAt },
            { name: 'Checkout', status: 'completed', conclusion: 'success', number: 2, started_at: createdAt, completed_at: createdAt },
            { name: `Run ${jobName}`, status: jobStatus, conclusion: jobConclusion, number: 3, started_at: createdAt, completed_at: jobStatus === 'completed' ? updatedAt : null },
          ],
        });
      }

      allRuns.push({
        _id: `mock_${runId}`,
        repository: { name: repo.name.split('/')[1], fullName: repo.fullName, owner: repo.name.split('/')[0] },
        workflow: { id: wf.id, name: wf.name, path: `.github/workflows/${wf.name.toLowerCase().replace(/\s+/g, '-')}.yml` },
        run: {
          id: runId,
          number: runNumber,
          status,
          conclusion,
          head_branch: branch,
          event,
          created_at: createdAt,
          updated_at: updatedAt || createdAt,
          url: `https://github.com/${repo.fullName}/actions/runs/${runId}`,
          labels: label,
        },
        jobs,
      });
    }
  });
});

// Sort by created_at desc
allRuns.sort((a, b) => new Date(b.run.created_at) - new Date(a.run.created_at));

// ── Metrics ──────────────────────────────────────────
function computeWorkflowMetrics() {
  const totalRuns = allRuns.filter(r => r.run.status === 'completed').length;
  const successRuns = allRuns.filter(r => r.run.conclusion === 'success').length;
  const failureRuns = allRuns.filter(r => r.run.conclusion === 'failure').length;
  const cancelledRuns = allRuns.filter(r => r.run.conclusion === 'cancelled').length;
  const inProgressRuns = allRuns.filter(r => r.run.status === 'in_progress').length;
  const queuedRuns = allRuns.filter(r => r.run.status === 'queued').length;

  const durations = allRuns
    .filter(r => r.run.status === 'completed' && r.run.updated_at)
    .map(r => (new Date(r.run.updated_at) - new Date(r.run.created_at)) / 1000);
  const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  // Per-repo breakdown
  const repoMetrics = {};
  repos.forEach(repo => {
    const runs = allRuns.filter(r => r.repository.fullName === repo.fullName);
    const completed = runs.filter(r => r.run.status === 'completed');
    const success = runs.filter(r => r.run.conclusion === 'success').length;
    repoMetrics[repo.fullName] = {
      totalRuns: runs.length,
      successRate: completed.length ? ((success / completed.length) * 100).toFixed(1) : 0,
      avgDuration: completed.length
        ? completed.reduce((acc, r) => acc + (new Date(r.run.updated_at || r.run.created_at) - new Date(r.run.created_at)) / 1000, 0) / completed.length
        : 0,
    };
  });

  return {
    total: allRuns.length,
    totalRuns,
    successRuns,
    failureRuns,
    cancelledRuns,
    inProgressRuns,
    queuedRuns,
    avgDuration,
    successRate: totalRuns ? ((successRuns / totalRuns) * 100).toFixed(1) : 0,
    repoMetrics,
  };
}

function computeJobMetrics() {
  const allJobs = allRuns.flatMap(r => r.jobs || []);
  const completed = allJobs.filter(j => j.status === 'completed');
  const success = allJobs.filter(j => j.conclusion === 'success').length;
  return {
    totalJobs: allJobs.length,
    completedJobs: completed.length,
    successRate: completed.length ? ((success / completed.length) * 100).toFixed(1) : 0,
    avgDuration: completed.length
      ? completed.reduce((acc, j) => {
          if (j.started_at && j.completed_at) return acc + (new Date(j.completed_at) - new Date(j.started_at)) / 1000;
          return acc;
        }, 0) / completed.length
      : 0,
  };
}

function computeStats() {
  const repoStats = repos.map(repo => {
    const runs = allRuns.filter(r => r.repository.fullName === repo.fullName);
    const completed = runs.filter(r => r.run.status === 'completed');
    const success = runs.filter(r => r.run.conclusion === 'success').length;
    const durations = completed
      .filter(r => r.run.updated_at)
      .map(r => (new Date(r.run.updated_at) - new Date(r.run.created_at)));
    const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // recent runs for trends
    const recentRuns = runs
      .filter(r => new Date(r.run.created_at) > new Date(now.getTime() - 7 * 24 * 3600000))
      .sort((a, b) => new Date(a.run.created_at) - new Date(b.run.created_at))
      .map(r => ({
        status: r.run.status,
        conclusion: r.run.conclusion,
        created_at: r.run.created_at,
        updated_at: r.run.updated_at,
      }));

    return {
      _id: repo.fullName,
      totalRuns: runs.length,
      successfulRuns: success,
      failedRuns: runs.filter(r => r.run.conclusion === 'failure').length,
      avgDuration,
      recentRuns,
    };
  });

  return {
    overview: {
      totalRepos: repos.length,
      totalRuns: allRuns.length,
      overallSuccessRate: parseFloat(computeWorkflowMetrics().successRate),
    },
    repositories: repoStats,
  };
}

// ── Mock Runners ─────────────────────────────────────
const mockRunners = [
  {
    id: 1, name: 'build-server-01', status: 'busy', os: 'Linux',
    labels: ['self-hosted', 'linux', 'x64', 'build'], runnerGroup: 'Production',
    runnerGroupId: 1, busy: true, scope: 'org', owner: 'acme-corp', repo: null,
    activeJob: {
      workflowName: 'CI', jobName: 'build-and-test', workflowRunId: allRuns[0]?.run?.id,
      workflowRunUrl: 'https://github.com/acme-corp/web-platform/actions/runs/1001',
      repository: 'acme-corp/web-platform',
    },
  },
  {
    id: 2, name: 'build-server-02', status: 'idle', os: 'Linux',
    labels: ['self-hosted', 'linux', 'x64', 'build'], runnerGroup: 'Production',
    runnerGroupId: 1, busy: false, scope: 'org', owner: 'acme-corp', repo: null,
  },
  {
    id: 3, name: 'mac-runner-01', status: 'busy', os: 'macOS',
    labels: ['self-hosted', 'macOS', 'ARM64', 'ios'], runnerGroup: 'macOS',
    runnerGroupId: 2, busy: true, scope: 'org', owner: 'acme-corp', repo: null,
    activeJob: {
      workflowName: 'iOS Build', jobName: 'build-ipa', workflowRunId: allRuns[2]?.run?.id,
      workflowRunUrl: 'https://github.com/acme-corp/mobile-app/actions/runs/3001',
      repository: 'acme-corp/mobile-app',
    },
  },
  {
    id: 4, name: 'mac-runner-02', status: 'idle', os: 'macOS',
    labels: ['self-hosted', 'macOS', 'ARM64', 'ios'], runnerGroup: 'macOS',
    runnerGroupId: 2, busy: false, scope: 'org', owner: 'acme-corp', repo: null,
  },
  {
    id: 5, name: 'gpu-runner', status: 'offline', os: 'Linux',
    labels: ['self-hosted', 'linux', 'gpu', 'ml'], runnerGroup: 'GPU Cluster',
    runnerGroupId: 3, busy: false, scope: 'org', owner: 'acme-corp', repo: null,
  },
  {
    id: 6, name: 'windows-build', status: 'idle', os: 'Windows',
    labels: ['self-hosted', 'windows', 'x64', 'dotnet'], runnerGroup: 'Default',
    runnerGroupId: 4, busy: false, scope: 'org', owner: 'acme-corp', repo: null,
  },
  {
    id: 7, name: 'infra-runner', status: 'idle', os: 'Linux',
    labels: ['self-hosted', 'linux', 'terraform', 'infra'], runnerGroup: 'Default',
    runnerGroupId: 4, busy: false, scope: 'repo', owner: 'acme-corp', repo: 'infra-terraform',
  },
];

const mockRunnersSummary = {
  total: mockRunners.length,
  online: mockRunners.filter(r => r.status === 'idle').length,
  busy: mockRunners.filter(r => r.status === 'busy').length,
  offline: mockRunners.filter(r => r.status === 'offline').length,
};

// ── Exports ──────────────────────────────────────────
export { allRuns, repos, workflows, computeWorkflowMetrics, computeJobMetrics, computeStats, mockRunners, mockRunnersSummary };
