import { getGitHubClient } from '../utils/githubAuth.js';
import * as workflowService from './workflowService.js';
import SyncHistory from '../models/SyncHistory.js';

// Mark any existing in_progress syncs as interrupted when starting up
const markInterruptedSyncs = async () => {
    try {
        // First find all in_progress syncs to preserve their current progress
        const inProgressSyncs = await SyncHistory.find({ status: 'in_progress' });
        
        for (const sync of inProgressSyncs) {
            await SyncHistory.findByIdAndUpdate(sync._id, {
                status: 'interrupted',
                completedAt: new Date(),
                results: {
                    ...sync.results, // Preserve all existing results
                    error: 'Sync process was interrupted by application restart',
                    lastProgress: sync.results?.progress || null
                }
            });
        }
    } catch (error) {
        console.error('Error marking interrupted syncs:', error);
    }
};

// Call this when the module loads
markInterruptedSyncs();

export const getAvailableOrganizations = async () => {
    try {
        console.log('Getting GitHub App installations...');
        const { installations } = await getGitHubClient();
        console.log('Found installations:', installations.length);
        return installations;
    } catch (error) {
        console.error('Error getting organizations:', error);
        throw error;
    }
};

export const getSyncHistory = async () => {
    return await SyncHistory.find().sort({ startedAt: -1 }).limit(10);
};

export const syncGitHubData = async (installationId, socket, options = { maxWorkflowRuns: 100 }) => {
    if (!installationId) {
        throw new Error('Installation ID is required for synchronization');
    }

    console.log('Starting sync for installation ID:', installationId);
    let syncRecord;
    
    try {
        // First ensure any existing in_progress syncs are marked as interrupted
        await markInterruptedSyncs();

        const { app: octokit } = await getGitHubClient(parseInt(installationId, 10));
        console.log('GitHub client initialized');

        // Get the installation details first
        console.log('Fetching installation details...');
        const { data: installation } = await octokit.rest.apps.getInstallation({
            installation_id: parseInt(installationId, 10)
        });
        
        const orgName = installation.account.login;
        console.log('Organization name:', orgName);

        // Create sync record
        syncRecord = await SyncHistory.create({
            organization: {
                id: installation.id,
                name: orgName,
                type: installation.account.type
            },
            status: 'in_progress',
            config: {
                maxWorkflowRuns: options.maxWorkflowRuns
            }
        });

        const results = {
            organization: orgName,
            totalRepositories: 0,
            repositories: 0,
            workflows: 0,
            runs: 0,
            errors: [],
            rateLimits: {}
        };

        // Function to check and handle rate limits
        const checkRateLimit = async () => {
            const { data: rateLimit } = await octokit.rest.rateLimit.get();
            const core = rateLimit.resources.core;
            const remaining = core.remaining;
            const resetTime = new Date(core.reset * 1000);
            
            results.rateLimits = {
                remaining,
                limit: core.limit,
                resetTime: resetTime.toISOString()
            };

            if (socket) {
                socket.emit('rateLimitUpdate', results.rateLimits);
            }

            if (remaining < 100) { // Buffer to prevent hitting absolute zero
                const waitTime = Math.max(0, resetTime - new Date());
                console.log(`Rate limit low (${remaining}), waiting for reset in ${Math.ceil(waitTime/1000)} seconds`);
                
                // Update sync record with paused status
                await SyncHistory.findByIdAndUpdate(syncRecord._id, {
                    status: 'paused',
                    results: {
                        ...results,
                        rateLimitPause: {
                            pausedAt: new Date(),
                            resumeAt: resetTime
                        }
                    }
                });

                if (socket) {
                    socket.emit('syncStatus', { 
                        status: 'paused',
                        message: `Rate limit reached. Waiting until ${resetTime.toLocaleString()}`
                    });
                }

                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Update sync record back to in_progress
                await SyncHistory.findByIdAndUpdate(syncRecord._id, {
                    status: 'in_progress'
                });

                if (socket) {
                    socket.emit('syncStatus', { status: 'resumed' });
                }
            }
        };

        // Initial rate limit check
        await checkRateLimit();

        // Function to update progress and sync record
        const updateProgress = async (progress, currentRepo, currentWorkflow, repoIndex, totalRepos, workflowIndex, totalWorkflows, processedItems = {}) => {
            if (socket) {
                socket.emit('syncProgress', {
                    progress,
                    currentRepo,
                    currentWorkflow,
                    rateLimits: results.rateLimits,
                    details: {
                        currentRepoIndex: repoIndex + 1,
                        totalRepos,
                        currentWorkflowIndex: workflowIndex !== undefined ? workflowIndex + 1 : undefined,
                        totalWorkflows,
                        processedRepos: processedItems.repos || results.repositories,
                        processedWorkflows: processedItems.workflows || results.workflows,
                        processedRuns: processedItems.runs || results.runs
                    }
                });
            }

            // Update sync record with current progress and processed items
            await SyncHistory.findByIdAndUpdate(syncRecord._id, {
                'results.progress': {
                    current: progress,
                    total: 100,
                    currentRepo,
                    currentWorkflow,
                    repoIndex,
                    totalRepos,
                    workflowIndex,
                    totalWorkflows,
                    processedRepos: processedItems.repos || results.repositories,
                    processedWorkflows: processedItems.workflows || results.workflows,
                    processedRuns: processedItems.runs || results.runs
                }
            });
        };

        // Get all repositories in the organization with pagination
        console.log('Fetching repositories...');
        const repos = [];
        let page = 1;
        let processedRepos = 0;  // Track processed repositories separately
        
        while (true) {
            await checkRateLimit();
            
            const { data: reposPage } = await octokit.rest.repos.listForOrg({
                org: orgName,
                type: 'all',
                per_page: 100,
                page
            });

            if (reposPage.length === 0) break;
            repos.push(...reposPage);
            page++;
            
            // Store total repositories count immediately after fetching
            results.totalRepositories = repos.length;
            results.repositories = 0; // Reset processed count

            // Update progress and totals
            await SyncHistory.findByIdAndUpdate(syncRecord._id, {
                'results.totalRepositories': repos.length,
                'results.repositories': 0,
                'results.progress.processedRepos': 0
            });
            
            // Update progress for repository fetching phase
            await updateProgress(
                Math.floor((repos.length / (reposPage.length * page)) * 15),
                'Fetching repositories...',
                null,
                repos.length,
                undefined,
                undefined,
                undefined,
                { 
                    totalRepositories: repos.length,
                    repos: 0
                }
            );
        }

        results.repositories = repos.length;

        // Process each repository
        for (let repoIndex = 0; repoIndex < repos.length; repoIndex++) {
            const repo = repos[repoIndex];
            try {
                await checkRateLimit();

                // Validate repository name to ensure it's in the correct format
                if (!repo.name || typeof repo.name !== 'string') {
                    throw new Error('Invalid repository name format');
                }

                // Calculate progress
                const repoProgress = Math.floor((repoIndex / repos.length) * 85) + 15;

                // Process workflows before incrementing the repository count
                let hasWorkflows = false;
                const workflows = [];
                page = 1;
                
                try {
                    while (true) {
                        const { data: { workflows: workflowsPage } } = await octokit.rest.actions.listRepoWorkflows({
                            owner: orgName,
                            repo: repo.name,
                            per_page: 100,
                            page
                        });

                        if (workflowsPage.length === 0) break;
                        workflows.push(...workflowsPage);
                        hasWorkflows = true;
                        page++;
                    }
                } catch (error) {
                    if (error.status !== 404) {
                        throw error;
                    }
                }

                // Only increment processed repos count if repository was successfully processed
                if (hasWorkflows) {
                    processedRepos++;
                    results.repositories = processedRepos;
                }

                await updateProgress(
                    repoProgress,
                    repo.name,
                    null,
                    repoIndex,
                    repos.length,
                    undefined,
                    undefined,
                    { 
                        totalRepositories: results.totalRepositories,
                        repos: processedRepos,
                        workflows: results.workflows,
                        runs: results.runs
                    }
                );

                // Process workflows
                for (let workflowIndex = 0; workflowIndex < workflows.length; workflowIndex++) {
                    const workflow = workflows[workflowIndex];
                    try {
                        await checkRateLimit();

                        results.workflows++;
                        // Calculate overall progress
                        // 15% for repo fetching + 85% for processing
                        const repoProgress = (repoIndex / repos.length) * 85;
                        const workflowProgress = (workflowIndex / workflows.length) * (85 / repos.length);
                        const totalProgress = Math.floor(15 + repoProgress + workflowProgress);

                        await updateProgress(
                            totalProgress,
                            repo.name,
                            workflow.name,
                            repoIndex,
                            repos.length,
                            workflowIndex,
                            workflows.length,
                            { 
                                repos: results.repositories,
                                workflows: results.workflows,
                                runs: results.runs
                            }
                        );

                        // Fetch workflow runs with pagination, limited by maxWorkflowRuns
                        const runs = [];
                        page = 1;
                        
                        while (runs.length < options.maxWorkflowRuns) {
                            try {
                                const { data: { workflow_runs: runsPage } } = await octokit.rest.actions.listWorkflowRuns({
                                    owner: orgName,
                                    repo: repo.name,
                                    workflow_id: workflow.id,
                                    per_page: Math.min(100, options.maxWorkflowRuns - runs.length),
                                    page
                                });

                                if (runsPage.length === 0) break;
                                
                                // Validate and normalize run status
                                runsPage.forEach(run => {
                                    // Ensure status is one of the valid enum values
                                    if (!['completed', 'action_required', 'cancelled', 'failure', 'neutral', 
                                         'skipped', 'stale', 'success', 'timed_out', 'in_progress', 'queued', 
                                         'requested', 'waiting', 'pending'].includes(run.status)) {
                                        run.status = 'pending';
                                    }
                                    
                                    // Ensure conclusion is one of the valid enum values or null
                                    if (run.conclusion && !['success', 'failure', 'cancelled', 'skipped', 'timed_out', 
                                                           'action_required', 'neutral', 'stale', 'startup_failure'].includes(run.conclusion)) {
                                        run.conclusion = null;
                                    }
                                });
                                
                                runs.push(...runsPage);
                                page++;
                            } catch (error) {
                                console.error(`Error fetching runs for workflow ${workflow.name}:`, error);
                                break;
                            }
                        }

                        results.workflows++;

                        // Process each run
                        const processWorkflowRunWithLabels = async (run, jobs, repo, orgName) => {
                            // Get all labels from jobs
                            const allLabels = new Set();
                            jobs.forEach(job => {
                                if (job.labels) {
                                    job.labels.forEach(label => allLabels.add(label));
                                }
                            });

                            // Create workflow run payload with combined labels
                            const workflowRunPayload = {
                                workflow_run: {
                                    ...run,
                                    labels: Array.from(allLabels) // Add combined labels to the run
                                },
                                repository: repo,
                                organization: { login: orgName }
                            };

                            const workflowRun = await workflowService.processWorkflowRun(workflowRunPayload);

                            // Process each job
                            if (jobs && jobs.length > 0) {
                                for (const job of jobs) {
                                    console.log(`Processing job ${job.id} for run ${run.run_number}:`, {
                                        labels: job.labels,
                                        runLabels: Array.from(allLabels),
                                        jobName: job.name,
                                        runNumber: run.run_number
                                    });

                                    const jobPayload = {
                                        action: 'completed',
                                        workflow_job: {
                                            ...job,
                                            run_number: run.run_number,
                                            labels: job.labels || []
                                        },
                                        repository: repo,
                                        organization: { login: orgName }
                                    };
                                    await workflowService.processWorkflowJobEvent(jobPayload);
                                }

                                if (global.io) {
                                    global.io.emit('workflowUpdate', workflowRun);
                                }
                            }

                            return workflowRun;
                        };

                        for (const run of runs) {
                            try {
                                await checkRateLimit();

                                // Fetch jobs with pagination
                                const jobs = [];
                                let page = 1;
                                
                                while (true) {
                                    const { data: { jobs: jobsPage } } = await octokit.rest.actions.listJobsForWorkflowRun({
                                        owner: orgName,
                                        repo: repo.name,
                                        run_id: run.id,
                                        per_page: 100,
                                        page
                                    });

                                    if (jobsPage.length === 0) break;
                                    jobs.push(...jobsPage);
                                    page++;
                                }

                                // Process run with all its jobs
                                const workflowRun = await processWorkflowRunWithLabels(run, jobs, repo, orgName);
                                results.runs++;

                                // Update progress
                                const totalProgress = Math.floor(15 + (repoIndex / repos.length) * 85);
                                await updateProgress(
                                    totalProgress,
                                    repo.name,
                                    workflow.name,
                                    repoIndex,
                                    repos.length,
                                    workflowIndex,
                                    workflows.length,
                                    { 
                                        repos: results.repositories,
                                        workflows: results.workflows,
                                        runs: results.runs
                                    }
                                );
                            } catch (error) {
                                console.error(`Error processing run ${run.id}:`, error);
                                results.errors.push({
                                    type: 'run',
                                    id: run.id,
                                    workflow: workflow.name,
                                    error: error.message
                                });
                            }
                        }
                    } catch (error) {
                        console.error(`Error processing workflow ${workflow.name}:`, error);
                        results.errors.push({
                            type: 'workflow',
                            name: workflow.name,
                            error: error.message
                        });
                    }
                }
                
            } catch (error) {
                console.error(`Error processing repository ${repo.name}:`, error);
                results.errors.push({
                    type: 'repository',
                    name: repo.name,
                    error: error.message
                });
            }
        }

        // Set final progress
        await updateProgress(100, null, null, repos.length, repos.length, null, null);

        // Update sync record with final results
        await SyncHistory.findByIdAndUpdate(syncRecord._id, {
            status: 'completed',
            completedAt: new Date(),
            results: {
                ...results,
                repositories: processedRepos,
                totalRepositories: results.totalRepositories,
                workflows: results.workflows,
                runs: results.runs,
                errors: results.errors,
                rateLimits: results.rateLimits,  // Preserve rate limits
                progress: {
                    current: 100,
                    total: 100,
                    currentRepo: null,
                    currentWorkflow: null,
                    repoIndex: repos.length,
                    totalRepos: repos.length,
                    workflowIndex: null,
                    totalWorkflows: null,
                    processedRepos: processedRepos
                }
            }
        });

        // Set progress to 100% when completed
        if (socket) {
            socket.emit('syncProgress', { 
                progress: 100,
                completed: true
            });
        }

        return results;
    } catch (error) {
        console.error('Error in syncGitHubData:', error);
        if (syncRecord) {
            await SyncHistory.findByIdAndUpdate(syncRecord._id, {
                status: 'failed',
                completedAt: new Date(),
                results: {
                    errors: [{
                        type: 'sync',
                        error: error.message
                    }]
                }
            });
        }
        throw error;
    }
};