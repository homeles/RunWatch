import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiService from '../../api/apiService';
import { setupSocketListeners } from '../../api/socketService';
import StatusChip from '../../common/components/StatusChip';
import { formatDuration, formatDate } from '../../common/utils/statusHelpers';

const WorkflowDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedJobs, setExpandedJobs] = useState(new Set());

  useEffect(() => {
    const fetchWorkflowDetails = async () => {
      try {
        setLoading(true);
        const workflowRun = await apiService.getWorkflowRunById(id);
        setWorkflow(workflowRun);
        setError(null);
      } catch (err) {
        setError('Failed to fetch workflow details. Please try again later.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflowDetails();

    const cleanupListeners = setupSocketListeners({
      onWorkflowUpdate: (updatedWorkflow) => {
        if (updatedWorkflow.run.id.toString() === id.toString()) {
          setWorkflow(prevWorkflow => {
            if (!prevWorkflow) return updatedWorkflow;
            return new Date(updatedWorkflow.run.updated_at) > new Date(prevWorkflow.run.updated_at)
              ? updatedWorkflow
              : prevWorkflow;
          });
        }
      },
      onJobsUpdate: (workflowWithJobs) => {
        if (workflowWithJobs.run.id.toString() === id.toString()) {
          setWorkflow(prevWorkflow => {
            if (!prevWorkflow) return workflowWithJobs;
            return {
              ...prevWorkflow,
              jobs: workflowWithJobs.jobs,
              run: {
                ...prevWorkflow.run,
                status: workflowWithJobs.run.status,
                conclusion: workflowWithJobs.run.conclusion,
                updated_at: workflowWithJobs.run.updated_at
              }
            };
          });
        }
      }
    });

    return () => cleanupListeners();
  }, [id]);

  const toggleJobSteps = (jobId) => {
    setExpandedJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) { newSet.delete(jobId); } else { newSet.add(jobId); }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="mt-8 text-center">
        <p className="text-error">{error || 'Workflow not found'}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm hover:bg-primary/20"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back
        </button>
      </div>
    );
  }

  const handleOpenLink = (url) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="flex items-center mb-8 bg-primary/10 p-6 rounded-xl border border-primary/20">
        <button
          onClick={() => navigate(-1)}
          title="Back to Workflow History"
          className="mr-4 p-2 rounded-lg text-on-surface hover:bg-primary/10 transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">{workflow.workflow.name}</h1>
          <p className="text-on-surface-variant text-sm mt-0.5">
            {workflow.repository.fullName} • Run #{workflow.run.number}
          </p>
        </div>
      </div>

      {/* Run Info Card */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
          <div>
            <p className="text-on-surface-variant text-sm mb-2">Status</p>
            <StatusChip status={workflow.run.status} conclusion={workflow.run.conclusion} />
          </div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-on-surface-variant">schedule</span>
            <div>
              <p className="text-on-surface-variant text-sm">Duration</p>
              <p className="text-on-surface">{formatDuration(workflow.run.created_at, workflow.run.updated_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-on-surface-variant">history</span>
            <div>
              <p className="text-on-surface-variant text-sm">Last Updated</p>
              <p className="text-on-surface">{formatDate(workflow.run.updated_at)}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <a
            href={workflow.run.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border border-primary/20 text-primary rounded-xl text-sm hover:border-primary/50 hover:bg-primary/10 transition-colors"
          >
            <span className="material-symbols-outlined text-base">open_in_new</span>
            View on GitHub
          </a>
          <a
            href={workflow.repository.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 border border-outline-variant text-on-surface-variant rounded-xl text-sm hover:border-outline hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-base">hub</span>
            Repository
          </a>
        </div>
      </div>

      {/* Jobs */}
      <h2 className="text-on-surface text-lg font-semibold mb-4">Jobs</h2>

      {!workflow.jobs || workflow.jobs.length === 0 ? (
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
          <p className="text-on-surface-variant">No job information available</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflow.jobs.map((job) => (
            <div
              key={job.id}
              className="bg-surface-container-low border border-outline-variant rounded-xl overflow-hidden"
            >
              {/* Job Header */}
              <div
                onClick={() => toggleJobSteps(job.id)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <StatusChip status={job.status} conclusion={job.conclusion} />
                  <span className="text-on-surface font-medium">{job.name}</span>
                  {job.runner_name && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-xs text-on-surface-variant">
                      <span className="opacity-70">Runner:</span>
                      {job.runner_os ? (
                        <>
                          {job.runner_os} {job.runner_image_version}
                          {job.runner_version && <span className="opacity-70"> ({job.runner_version})</span>}
                        </>
                      ) : (
                        <>{job.runner_name}{job.runner_group_name && ` (${job.runner_group_name})`}</>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-on-surface-variant text-sm">
                    {formatDuration(job.started_at, job.completed_at)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const jobUrl = `${workflow.run.url}/job/${job.id}`;
                      window.open(jobUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="px-3 py-1 border border-primary/20 text-primary rounded-lg text-xs hover:border-primary/50 hover:bg-primary/10 transition-colors"
                  >
                    View on GitHub
                  </button>
                  <span
                    className={`material-symbols-outlined text-on-surface-variant transition-transform duration-200 ${expandedJobs.has(job.id) ? 'rotate-180' : ''}`}
                  >
                    expand_more
                  </span>
                </div>
              </div>

              {/* Job Steps */}
              {expandedJobs.has(job.id) && (
                <>
                  <hr className="border-outline-variant" />
                  <div className="p-4 bg-surface/50">
                    <div className="space-y-2">
                      {job.steps?.map((step) => (
                        <div
                          key={step.number}
                          className="flex items-center justify-between p-3 bg-surface rounded-xl border border-outline-variant/50"
                        >
                          <div className="flex items-center gap-3">
                            <StatusChip status={step.status} conclusion={step.conclusion} />
                            <span className="text-on-surface text-sm">{step.name}</span>
                          </div>
                          <span className="text-on-surface-variant text-sm">
                            {formatDuration(step.started_at, step.completed_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkflowDetails;
