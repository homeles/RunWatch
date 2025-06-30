import WorkflowRun from '../models/WorkflowRun.js';

const transformGitHubUrl = (apiUrl) => {
  if (!apiUrl) return '';
  // Transform from API URL to web interface URL
  // From: https://api.github.com/repos/owner/repo/actions/runs/123456
  // To:   https://github.com/owner/repo/actions/runs/123456
  return apiUrl.replace('https://api.github.com/repos/', 'https://github.com/');
};

export const processWorkflowRun = async (payload) => {
  const { repository, workflow_run: run } = payload;
  
  try {
    // Create the workflow run data object
    const workflowRunData = {
      repository: {
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        owner: {
          login: repository.owner.login,
          url: transformGitHubUrl(repository.owner.html_url)
        },
        url: transformGitHubUrl(repository.html_url)
      },
      workflow: {
        id: run.workflow_id,
        name: run.name,
        path: run.path
      },
      run: {
        id: run.id,
        number: run.run_number,
        created_at: run.created_at,
        updated_at: run.updated_at,
        status: run.status,
        conclusion: run.status === 'completed' ? run.conclusion : null,
        url: transformGitHubUrl(run.html_url),
        head_branch: run.head_branch,
        event: run.event,
        labels: run.labels || [], // Ensure labels are always set
        runner_id: run.runner_id,
        runner_name: run.runner_name,
        runner_group_id: run.runner_group_id,
        runner_group_name: run.runner_group_name
      }
    };

    console.log('Processing workflow run with labels:', {
      id: run.id,
      labels: workflowRunData.run.labels,
      status: run.status
    });

    // Find existing run to preserve any existing labels if none provided
    const existingRun = await WorkflowRun.findOne({ 'run.id': run.id });
    if (existingRun && !workflowRunData.run.labels.length && existingRun.run.labels?.length) {
      workflowRunData.run.labels = existingRun.run.labels;
    }

    // Use findOneAndUpdate with upsert to either update existing or create new
    const workflowRun = await WorkflowRun.findOneAndUpdate(
      { 'run.id': run.id },
      workflowRunData,
      { 
        new: true, // Return the updated document
        upsert: true, // Create if it doesn't exist
        runValidators: true // Run model validators
      }
    );

    return workflowRun;
  } catch (error) {
    console.error('Error processing workflow run:', error);
    throw error;
  }
};

export const updateWorkflowJobs = async (runId, jobs) => {
  try {
    const jobsData = jobs.map(job => ({
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      started_at: job.started_at,
      completed_at: job.completed_at,
      runner_id: job.runner_id,
      runner_name: job.runner_name,
      runner_group_id: job.runner_group_id,
      runner_group_name: job.runner_group_name,
      runner_os: job.runner_os || (job.labels?.find(l => l.includes('ubuntu') || l.includes('windows') || l.includes('macos')) || '').split('-')[0],
      runner_version: job.labels?.find(l => l.includes('(') && l.includes(')'))?.match(/\((.*?)\)/)?.[1] || '',
      runner_image_version: job.labels?.find(l => l.includes('-'))?.split('-')[1] || '',
      steps: job.steps.map(step => ({
        name: step.name,
        status: step.status,
        conclusion: step.conclusion,
        number: step.number,
        started_at: step.started_at,
        completed_at: step.completed_at
      }))
    }));

    const workflowRun = await WorkflowRun.findOneAndUpdate(
      { 'run.id': runId },
      { $set: { jobs: jobsData } },
      { 
        new: true,
        runValidators: true
      }
    );
    
    if (!workflowRun) {
      throw new Error('Workflow run not found');
    }

    return workflowRun;
  } catch (error) {
    console.error('Error updating workflow jobs:', error);
    throw error;
  }
};

export const calculateWorkflowStats = async () => {
  try {
    const [
      totalRuns,
      successfulRuns,
      failedRuns,
      inProgressRuns,
      recentRuns
    ] = await Promise.all([
      WorkflowRun.countDocuments(),
      WorkflowRun.countDocuments({ 'run.conclusion': 'success' }),
      WorkflowRun.countDocuments({ 'run.conclusion': 'failure' }),
      WorkflowRun.countDocuments({ 'run.status': 'in_progress' }),
      WorkflowRun.find()
        .sort({ 'run.created_at': -1 })
        .limit(5)
        .select('repository workflow run')
    ]);

    // Get repository-specific stats
    const repoStats = await WorkflowRun.aggregate([
      {
        $group: {
          _id: '$repository.fullName',
          totalRuns: { $sum: 1 },
          successfulRuns: {
            $sum: {
              $cond: [{ $eq: ['$run.conclusion', 'success'] }, 1, 0]
            }
          },
          failedRuns: {
            $sum: {
              $cond: [{ $eq: ['$run.conclusion', 'failure'] }, 1, 0]
            }
          }
        }
      },
      { $sort: { totalRuns: -1 } }
    ]);

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      inProgressRuns,
      successRate: totalRuns ? (successfulRuns / totalRuns * 100).toFixed(2) : 0,
      recentRuns,
      repoStats
    };
  } catch (error) {
    console.error('Error calculating workflow stats:', error);
    throw error;
  }
};

export const processWorkflowJobEvent = async (payload) => {
  const { workflow_job, repository } = payload;
  
  try {
    console.log('Processing workflow job event:', {
      jobId: workflow_job.id,
      runId: workflow_job.run_id,
      labels: workflow_job.labels,
      status: workflow_job.status
    });

    const processGitHubRunnerInfo = (job) => {
      let runnerOs = '';
      let runnerVersion = '';
      let imageVersion = '';

      if (job.labels) {
        const osLabel = job.labels.find(l => l.match(/^(ubuntu|windows|macos)/));
        if (osLabel) {
          const [os, version] = osLabel.split('-');
          runnerOs = os;
          imageVersion = version;
        }

        const githubLabel = job.labels.find(l => l.includes('GitHub Actions'));
        if (githubLabel) {
          const match = githubLabel.match(/\((.*?)\)/);
          if (match) {
            runnerVersion = match[1];
          }
        }
      }

      return {
        runner_os: runnerOs,
        runner_version: runnerVersion,
        runner_image_version: imageVersion
      };
    };

    // Find and update the workflow run, if it exists
    const existingRun = await WorkflowRun.findOne({ 'run.id': workflow_job.run_id });
    const jobLabels = workflow_job.labels || [];

    // Prepare the update data
    const workflowRunData = {
      repository: {
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        owner: {
          login: repository.owner.login,
          url: transformGitHubUrl(repository.owner.url)
        },
        url: transformGitHubUrl(repository.url)
      },
      workflow: {
        name: workflow_job.workflow_name
      },
      run: {
        id: workflow_job.run_id,
        number: workflow_job.run_number,
        created_at: workflow_job.created_at,
        updated_at: workflow_job.started_at || workflow_job.created_at,
        status: workflow_job.status === 'in_progress' ? 'in_progress' : workflow_job.status,
        conclusion: workflow_job.conclusion,
        url: transformGitHubUrl(workflow_job.run_url),
        labels: jobLabels // Set job labels
      }
    };

    const updatedJob = {
      id: workflow_job.id,
      name: workflow_job.name,
      status: workflow_job.status,
      conclusion: workflow_job.conclusion,
      started_at: workflow_job.started_at,
      completed_at: workflow_job.completed_at,
      runner_id: workflow_job.runner_id,
      runner_name: workflow_job.runner_name,
      runner_group_id: workflow_job.runner_group_id,
      runner_group_name: workflow_job.runner_group_name,
      ...processGitHubRunnerInfo(workflow_job),
      labels: jobLabels,
      steps: workflow_job.steps?.map(step => ({
        name: step.name,
        status: step.status,
        conclusion: step.conclusion,
        number: step.number,
        started_at: step.started_at,
        completed_at: step.completed_at
      })) || []
    };

    if (existingRun) {
      // If the run exists, update the job and preserve existing labels
      const jobIndex = existingRun.jobs?.findIndex(job => job.id === workflow_job.id) ?? -1;
      const combinedLabels = Array.from(new Set([...existingRun.run.labels || [], ...jobLabels]));
      
      let jobsUpdate;
      if (jobIndex === -1) {
        // Add new job
        jobsUpdate = { 
          $push: { jobs: updatedJob },
          $set: { 'run.labels': combinedLabels }
        };
      } else {
        // Update existing job
        jobsUpdate = { 
          $set: { 
            [`jobs.${jobIndex}`]: updatedJob,
            'run.status': workflow_job.status === 'in_progress' ? 'in_progress' : existingRun.run.status,
            'run.labels': combinedLabels
          } 
        };
      }

      const workflowRun = await WorkflowRun.findOneAndUpdate(
        { 'run.id': workflow_job.run_id },
        jobsUpdate,
        { new: true, runValidators: true }
      );

      return workflowRun;
    } else {
      // If the run doesn't exist, create a new one with the job
      workflowRunData.jobs = [updatedJob];
      
      const workflowRun = await WorkflowRun.findOneAndUpdate(
        { 'run.id': workflow_job.run_id },
        workflowRunData,
        { 
          new: true,
          upsert: true,
          runValidators: true
        }
      );

      return workflowRun;
    }

  } catch (error) {
    console.error('Error processing workflow job:', error);
    throw error;
  }
};

export const syncWorkflowRun = async (runId) => {
  try {
    // Find the workflow run in our database, explicitly select run.id to avoid _id confusion
    const workflowRun = await WorkflowRun.findOne({ 'run.id': runId }).select('+run.id');
    if (!workflowRun) {
      throw new Error('Workflow run not found');
    }

    // Get the necessary GitHub installation details
    const { getGitHubClient } = await import('../utils/githubAuth.js');
    const [owner] = workflowRun.repository.fullName.split('/');

    // First get the app client to list installations
    const { installations } = await getGitHubClient();
    
    // Find the installation for this owner
    const installation = installations.find(i => i.account.login.toLowerCase() === owner.toLowerCase());
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}`);
    }

    // Now get a client for this specific installation
    const { app: octokitWithAuth } = await getGitHubClient(installation.id);

    // Extract repository name
    const repo = workflowRun.repository.name;

    // Fetch latest workflow run data from GitHub
    const { data: run } = await octokitWithAuth.actions.getWorkflowRun({
      owner,
      repo,
      run_id: runId
    });

    // Fetch jobs for the workflow run
    const jobs = [];
    let page = 1;
    while (true) {
      const { data: { jobs: jobsPage } } = await octokitWithAuth.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId,
        per_page: 100,
        page
      });

      if (jobsPage.length === 0) break;
      jobs.push(...jobsPage);
      page++;
    }

    // Process the workflow run update with the new data
    const payload = {
      workflow_run: run,
      repository: {
        id: workflowRun.repository.id,
        name: repo,
        full_name: `${owner}/${repo}`,
        owner: {
          login: owner
        }
      }
    };

    // Process the run update
    const updatedRun = await processWorkflowRun(payload);

    // Update jobs if available
    if (jobs.length > 0) {
      await updateWorkflowJobs(runId, jobs);
    }

    return updatedRun;
  } catch (error) {
    console.error('Error syncing workflow run:', error);
    throw error;
  }
};

export const syncRepositoryWorkflowRuns = async (repoPath) => {
  try {
    const [owner, repo] = repoPath.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid repository path format');
    }

    // Get the necessary GitHub installation details
    const { getGitHubClient } = await import('../utils/githubAuth.js');
    
    // First get the app client to list installations
    const { installations } = await getGitHubClient();
    
    // Find the installation for this owner
    const installation = installations.find(i => i.account.login.toLowerCase() === owner.toLowerCase());
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}`);
    }

    // Get a client for this specific installation
    const { app: octokitWithAuth } = await getGitHubClient(installation.id);

    // Get all workflows for the repository first
    const workflows = [];
    let page = 1;
    while (true) {
      const { data: { workflows: workflowsPage } } = await octokitWithAuth.rest.actions.listRepoWorkflows({
        owner,
        repo,
        per_page: 100,
        page
      });

      if (workflowsPage.length === 0) break;
      workflows.push(...workflowsPage);
      page++;
    }

    // Update or create repository document with all workflows
    await WorkflowRun.findOneAndUpdate(
      { 'repository.fullName': `${owner}/${repo}` },
      {
        $set: {
          'repository.workflows': workflows.map(w => ({
            id: w.id,
            name: w.name,
            path: w.path,
            state: w.state,
            lastSyncedAt: new Date()
          }))
        }
      },
      { 
        upsert: true,
        new: true
      }
    );

    const updatedRuns = [];

    // For each workflow, get recent runs
    for (const workflow of workflows) {
      // Get workflow runs with pagination
      const runs = [];
      page = 1;
      
      while (runs.length < 100) { // Limit to last 100 runs per workflow
        const { data: { workflow_runs: runsPage } } = await octokitWithAuth.rest.actions.listWorkflowRuns({
          owner,
          repo,
          workflow_id: workflow.id,
          per_page: Math.min(100, 100 - runs.length),
          page
        });

        if (runsPage.length === 0) break;
        
        // Validate and normalize run status
        runsPage.forEach(run => {
          // Normalize status
          if (!['completed', 'action_required', 'cancelled', 'failure', 'neutral', 
               'skipped', 'stale', 'success', 'timed_out', 'in_progress', 'queued', 
               'requested', 'waiting', 'pending'].includes(run.status)) {
            run.status = 'pending';
          }
          
          // Normalize conclusion
          if (run.conclusion && !['success', 'failure', 'cancelled', 'skipped', 'timed_out', 
                                'action_required', 'neutral', 'stale', 'startup_failure'].includes(run.conclusion)) {
            run.conclusion = null;
          }
        });

        runs.push(...runsPage);
        page++;
      }

      // Process each run
      for (const run of runs) {
        // Fetch jobs for the run
        const jobs = [];
        page = 1;
        
        while (true) {
          const { data: { jobs: jobsPage } } = await octokitWithAuth.rest.actions.listJobsForWorkflowRun({
            owner,
            repo,
            run_id: run.id,
            per_page: 100,
            page
          });

          if (jobsPage.length === 0) break;
          jobs.push(...jobsPage);
          page++;
        }

        // Process workflow run with jobs
        const workflowRunPayload = {
          workflow_run: run,
          repository: {
            id: run.repository.id,
            name: repo,
            full_name: `${owner}/${repo}`,
            owner: {
              login: owner
            }
          }
        };

        const workflowRun = await processWorkflowRun(workflowRunPayload);

        if (jobs.length > 0) {
          await updateWorkflowJobs(run.id, jobs);
        }

        updatedRuns.push(workflowRun);
      }
    }

    return updatedRuns;
  } catch (error) {
    console.error('Error syncing repository workflow runs:', error);
    throw error;
  }
};

export const getActiveWorkflowMetrics = async () => {
  try {
    console.log('Starting to calculate active workflow metrics...');
    const metrics = {};
    
    // First, let's verify the data with a simple count
    const totalActive = await WorkflowRun.countDocuments({
      'run.status': { $in: ['in_progress', 'queued', 'waiting', 'pending'] },
      'run.conclusion': null
    });
    
    console.log('Total active workflows:', totalActive);
    
    // Get all workflows grouped by organization
    const workflowsByOrg = await WorkflowRun.aggregate([
      {
        $match: {
          'run.status': { $in: ['in_progress', 'queued', 'waiting', 'pending'] },
          'run.conclusion': null
        }
      },
      {
        $project: {
          orgName: { $arrayElemAt: [{ $split: ['$repository.fullName', '/'] }, 0] },
          status: '$run.status'
        }
      },
      {
        $group: {
          _id: '$orgName',
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          queued: {
            $sum: {
              $cond: [
                { $in: ['$status', ['queued', 'waiting', 'pending']] },
                1,
                0
              ]
            }
          },
          total: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    console.log('Raw aggregate results:', JSON.stringify(workflowsByOrg, null, 2));

    // Format the results
    workflowsByOrg.forEach(org => {
      if (!org._id) {
        console.log('Warning: Invalid organization data:', org);
        return;
      }
      
      metrics[org._id] = {
        inProgress: org.inProgress || 0,
        queued: org.queued || 0,
        total: org.total || 0
      };
    });

    console.log('Final metrics:', JSON.stringify(metrics, null, 2));
    return metrics;
  } catch (error) {
    console.error('Error getting active workflow metrics:', error);
    throw error;
  }
};

export const getJobMetrics = async () => {
  try {
    console.log('Starting to calculate active job metrics...');
    const metrics = {};
    
    // First, let's verify the data with a simple count
    // const totalActive = await WorkflowRun.countDocuments({
    //   'jobs.status': { $in: ['in_progress', 'queued', 'waiting', 'pending'] }
    // });
    
    // console.log('Total active jobs:', totalActive);
    
    // Get all jobs grouped by organization
    const jobsByOrg = await WorkflowRun.aggregate([
      {
        $match: {
          'jobs': { $exists: true, $not: { $size: 0 } }
        }
      },
      {
        $unwind: '$jobs'
      },
      {
        $match: {
          'jobs.status': { $in: ['in_progress', 'queued', 'waiting', 'pending'] }
        }
      },
      {
        $project: {
          orgName: { $arrayElemAt: [{ $split: ['$repository.fullName', '/'] }, 0] },
          status: '$jobs.status'
        }
      },
      {
        $group: {
          _id: '$orgName',
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          queued: {
            $sum: {
              $cond: [
                { $in: ['$status', ['queued', 'waiting', 'pending']] },
                1,
                0
              ]
            }
          },
          total: { $sum: 1 }
        }
      }
    ]);

    console.log('Raw job aggregate results:', JSON.stringify(jobsByOrg, null, 2));

    // Format the results
    jobsByOrg.forEach(org => {
      if (!org._id) {
        console.log('Warning: Invalid organization data:', org);
        return;
      }
      
      metrics[org._id] = {
        inProgress: org.inProgress || 0,
        queued: org.queued || 0,
        total: org.total || 0
      };
    });

    console.log('Final job metrics:', JSON.stringify(metrics, null, 2));
    return metrics;
  } catch (error) {
    console.error('Error getting active job metrics:', error);
    throw error;
  }
};