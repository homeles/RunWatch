import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiService from '../../api/apiService';
import { setupSocketListeners } from '../../api/socketService';
import StatusChip from '../../common/components/StatusChip';
import { formatDuration, formatDate } from '../../common/utils/statusHelpers';

const getJobBorderColor = (conclusion, status) => {
  if (conclusion === 'success') return 'border-secondary';
  if (conclusion === 'failure') return 'border-error';
  if (conclusion === 'skipped' || conclusion === 'cancelled') return 'border-outline/30';
  if (status === 'in_progress') return 'border-tertiary';
  return 'border-outline';
};

const getJobIconColor = (conclusion, status) => {
  if (conclusion === 'success') return 'text-secondary';
  if (conclusion === 'failure') return 'text-error';
  if (conclusion === 'skipped' || conclusion === 'cancelled') return 'text-outline';
  if (status === 'in_progress') return 'text-tertiary';
  return 'text-outline';
};

const getJobIcon = (conclusion, status) => {
  if (conclusion === 'success') return 'check_circle';
  if (conclusion === 'failure') return 'cancel';
  if (conclusion === 'skipped') return 'block';
  if (conclusion === 'cancelled') return 'cancel';
  if (status === 'in_progress') return 'pending';
  if (status === 'queued') return 'schedule';
  return 'pending';
};

const getStepDotColor = (conclusion, status) => {
  if (conclusion === 'success') return 'bg-secondary';
  if (conclusion === 'failure') return 'bg-error';
  if (conclusion === 'skipped') return 'bg-outline/50';
  if (status === 'in_progress') return 'bg-tertiary';
  return 'bg-outline/50';
};

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
                updated_at: workflowWithJobs.run.updated_at,
              },
            };
          });
        }
      },
    });

    return () => cleanupListeners();
  }, [id]);

  const toggleJobSteps = (jobId) => {
    setExpandedJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
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

  const isSuccess = workflow.run.conclusion === 'success';
  const isFailure = workflow.run.conclusion === 'failure';
  const isFailed = isFailure;

  // Timeline calculation
  const runStart = workflow.run.created_at ? new Date(workflow.run.created_at).getTime() : null;
  const runEnd = workflow.run.updated_at ? new Date(workflow.run.updated_at).getTime() : null;
  const totalRunMs = runStart && runEnd && runEnd > runStart ? runEnd - runStart : null;

  const getTimelineBar = (job) => {
    if (!totalRunMs || !job.started_at) return { left: 0, width: 0 };
    const jobStart = new Date(job.started_at).getTime();
    const jobEnd = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
    const left = Math.max(0, ((jobStart - runStart) / totalRunMs) * 100);
    const width = Math.min(100 - left, Math.max(1, ((jobEnd - jobStart) / totalRunMs) * 100));
    return { left, width };
  };

  // Breadcrumb parts
  const repoParts = workflow.repository?.fullName?.split('/') ?? [];
  const org = repoParts[0] ?? '';
  const repo = repoParts.slice(1).join('/');

  const statusBadge = isSuccess ? (
    <div className="flex items-center gap-2 bg-secondary-container/20 text-secondary px-3 py-1 rounded-full border border-secondary/20">
      <span
        className="material-symbols-outlined text-lg"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        check_circle
      </span>
      <span className="text-xs font-bold tracking-widest uppercase">Success</span>
    </div>
  ) : isFailed ? (
    <div className="flex items-center gap-2 bg-error-container/20 text-error px-3 py-1 rounded-full border border-error/20">
      <span
        className="material-symbols-outlined text-lg"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        cancel
      </span>
      <span className="text-xs font-bold tracking-widest uppercase">Failed</span>
    </div>
  ) : (
    <StatusChip status={workflow.run.status} conclusion={workflow.run.conclusion} />
  );

  const jobs = workflow.jobs || [];
  const totalJobs = jobs.length;
  const totalSteps = jobs.reduce((acc, j) => acc + (j.steps?.length ?? 0), 0);

  return (
    <div className="pb-12">
      {/* Summary Header */}
      <section className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-outline font-medium mb-3 flex-wrap">
            <button
              onClick={() => navigate('/')}
              className="hover:text-on-surface transition-colors"
            >
              Dashboard
            </button>
            {org && (
              <>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <span>{org}</span>
              </>
            )}
            {repo && (
              <>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <button
                  onClick={() => navigate(-1)}
                  className="hover:text-on-surface transition-colors"
                >
                  {repo}
                </button>
              </>
            )}
            {workflow.workflow?.name && (
              <>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <button
                  onClick={() => navigate(-1)}
                  className="hover:text-on-surface transition-colors"
                >
                  {workflow.workflow.name}
                </button>
              </>
            )}
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-on-surface font-semibold">Run #{workflow.run.number}</span>
          </nav>

          <div className="flex items-center gap-3 mb-3">
            {statusBadge}
            <h2 className="text-3xl font-bold tracking-tight text-on-surface">
              Run #{workflow.run.number}
            </h2>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-outline text-sm">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-lg">schedule</span>
              <span>
                Duration:{' '}
                <strong className="text-on-surface">
                  {formatDuration(workflow.run.created_at, workflow.run.updated_at)}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-lg">update</span>
              <span>
                Last Updated:{' '}
                <strong className="text-on-surface">{formatDate(workflow.run.updated_at)}</strong>
              </span>
            </div>
            {workflow.run.head_branch && (
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-lg">account_tree</span>
                <span>
                  Branch:{' '}
                  <strong className="text-on-surface">{workflow.run.head_branch}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="bg-surface-container-highest hover:bg-surface-bright text-on-surface px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back
          </button>
          <a
            href={workflow.run.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed px-5 py-2 rounded-lg text-sm font-bold shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
            style={{ boxShadow: '0 4px 24px rgba(162,201,255,0.1)' }}
          >
            <span className="material-symbols-outlined text-lg">open_in_new</span>
            View on GitHub
          </a>
        </div>
      </section>

      {/* Execution Timeline */}
      {totalRunMs && jobs.length > 0 && (
        <section className="mb-10">
          <h3 className="text-xs font-bold text-outline uppercase tracking-widest mb-4">
            Execution Timeline
          </h3>
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 relative overflow-hidden">
            <div className="flex flex-col gap-8">
              {/* Total run bar */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`material-symbols-outlined text-sm ${isSuccess ? 'text-secondary' : isFailed ? 'text-error' : 'text-primary'}`}
                    >
                      account_tree
                    </span>
                    <span className="text-xs font-bold text-on-surface">Total Workflow Run</span>
                  </div>
                  <span
                    className={`text-xs font-mono ${isSuccess ? 'text-secondary' : isFailed ? 'text-error' : 'text-primary'}`}
                  >
                    {formatDuration(workflow.run.created_at, workflow.run.updated_at)}
                  </span>
                </div>
                <div className="relative h-4 bg-surface-container-low rounded-full overflow-hidden">
                  {isSuccess ? (
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-secondary/40 to-secondary rounded-full"
                      style={{ boxShadow: '0 0 12px rgba(103,223,112,0.3)' }}
                    />
                  ) : isFailed ? (
                    <>
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-secondary/20 to-secondary/80 rounded-l-full"
                        style={{ width: '60%' }}
                      />
                      <div
                        className="absolute inset-y-0 left-[60%] bg-gradient-to-r from-error/60 to-error rounded-r-full"
                        style={{ width: '40%', boxShadow: '0 0 12px rgba(255,180,171,0.3)' }}
                      />
                    </>
                  ) : (
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-primary/40 to-primary rounded-full"
                      style={{ boxShadow: '0 0 12px rgba(162,201,255,0.3)' }}
                    />
                  )}
                </div>
              </div>

              {/* Per-job bars */}
              <div className="space-y-4 pt-4 border-t border-outline-variant/5">
                {jobs.map((job) => {
                  const { left, width } = getTimelineBar(job);
                  const jobFailed = job.conclusion === 'failure';
                  const jobSuccess = job.conclusion === 'success';
                  const jobSkipped = job.conclusion === 'skipped' || job.conclusion === 'cancelled';
                  return (
                    <div key={job.id} className={`flex items-center gap-4 ${jobSkipped ? 'opacity-30' : ''}`}>
                      <div className="w-48 shrink-0 truncate">
                        <span
                          className={`text-[10px] font-medium uppercase tracking-tighter ${
                            jobFailed ? 'text-error' : 'text-outline'
                          }`}
                        >
                          {job.name}
                        </span>
                      </div>
                      <div
                        className="flex-1 relative h-3"
                        style={{
                          backgroundImage: 'linear-gradient(to right, #414752 1px, transparent 1px)',
                          backgroundSize: 'calc(100% / 8) 100%',
                        }}
                      >
                        {!jobSkipped && width > 0 && (
                          <div
                            className={`absolute h-full rounded-sm transition-colors cursor-help group ${
                              jobFailed
                                ? 'bg-error/80 hover:bg-error'
                                : jobSuccess
                                ? 'bg-secondary/80 hover:bg-secondary'
                                : 'bg-primary/80 hover:bg-primary'
                            }`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                          >
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-bright text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-outline-variant/20 z-10">
                              {formatDuration(job.started_at, job.completed_at)}
                              {jobFailed && ' [FAILED]'}
                            </div>
                          </div>
                        )}
                      </div>
                      <span
                        className={`w-12 text-[10px] font-mono text-right ${
                          jobFailed ? 'text-error' : 'text-outline'
                        }`}
                      >
                        {jobSkipped ? '--' : formatDuration(job.started_at, job.completed_at)}
                      </span>
                    </div>
                  );
                })}

                {/* Time axis */}
                <div className="flex justify-between items-center pt-2 text-[10px] font-mono text-outline/50 pl-52">
                  <span>0s</span>
                  <span>{formatDuration(Math.floor(totalRunMs * 0.33))}</span>
                  <span>{formatDuration(Math.floor(totalRunMs * 0.66))}</span>
                  <span>{formatDuration(totalRunMs)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Grid: Jobs + Metadata */}
      <div className="grid grid-cols-12 gap-8">
        {/* Jobs List */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <h3 className="text-sm font-bold text-outline uppercase tracking-widest mb-4">
            Workflow Jobs
          </h3>

          {jobs.length === 0 ? (
            <div className="bg-surface-container rounded-lg p-6 border border-outline-variant/10">
              <p className="text-on-surface-variant text-sm">No job information available</p>
            </div>
          ) : (
            jobs.map((job) => {
              const jobFailed = job.conclusion === 'failure';
              const jobSkipped =
                job.conclusion === 'skipped' || job.conclusion === 'cancelled';
              const isExpanded = expandedJobs.has(job.id);
              const borderColor = getJobBorderColor(job.conclusion, job.status);
              const iconColor = getJobIconColor(job.conclusion, job.status);
              const icon = getJobIcon(job.conclusion, job.status);

              return (
                <div
                  key={job.id}
                  className={`bg-surface-container rounded-lg overflow-hidden relative ${
                    isExpanded ? `border-l-4 ${borderColor}` : ''
                  } ${jobFailed ? 'shadow-2xl' : ''} ${jobSkipped ? 'opacity-50' : ''}`}
                >
                  {/* Collapsed left accent */}
                  {!isExpanded && (
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1 ${borderColor.replace('border-', 'bg-')}`}
                    />
                  )}

                  {/* Job header */}
                  <div
                    onClick={() => !jobSkipped && toggleJobSteps(job.id)}
                    className={`p-4 flex items-center justify-between ${
                      !jobSkipped ? 'cursor-pointer hover:bg-surface-container-high' : ''
                    } transition-colors ${isExpanded ? 'bg-surface-container-high border-b border-outline-variant/10' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={`material-symbols-outlined ${iconColor}`}
                        style={
                          job.conclusion === 'success' || job.conclusion === 'failure'
                            ? { fontVariationSettings: "'FILL' 1" }
                            : undefined
                        }
                      >
                        {icon}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-on-surface">{job.name}</h4>
                          {jobFailed && (
                            <span className="bg-error/10 text-error text-[9px] px-2 py-0.5 rounded border border-error/20 font-bold uppercase tracking-wider">
                              Failed
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-outline mt-0.5">
                          {job.runner_name ? (
                            <>
                              Runner:{' '}
                              {job.runner_os
                                ? `${job.runner_os}${job.runner_image_version ? ` ${job.runner_image_version}` : ''}`
                                : job.runner_name}
                              {' • '}
                            </>
                          ) : jobSkipped ? (
                            <em>Skipped due to upstream failure • </em>
                          ) : null}
                          <span
                            className={
                              jobFailed
                                ? 'text-error font-medium'
                                : jobSkipped
                                ? 'text-outline'
                                : 'text-on-surface-variant'
                            }
                          >
                            {jobSkipped
                              ? '--:--'
                              : formatDuration(job.started_at, job.completed_at)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {!jobSkipped && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const jobUrl = `${workflow.run.url}/job/${job.id}`;
                            window.open(jobUrl, '_blank', 'noopener,noreferrer');
                          }}
                          className="p-1 hover:bg-surface-container-highest rounded transition-colors text-outline hover:text-primary"
                          title="View on GitHub"
                        >
                          <span className="material-symbols-outlined text-xs">open_in_new</span>
                        </button>
                      )}
                      {!jobSkipped && (
                        <span
                          className={`material-symbols-outlined text-outline transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        >
                          expand_more
                        </span>
                      )}
                      {jobSkipped && (
                        <span className="material-symbols-outlined text-outline/30">
                          chevron_right
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Steps list */}
                  {isExpanded && job.steps && job.steps.length > 0 && (
                    <div className="bg-surface-container-lowest">
                      {job.steps.map((step, idx) => {
                        const stepFailed = step.conclusion === 'failure';
                        return (
                          <div
                            key={step.number}
                            className={`px-6 py-3 flex items-center justify-between border-b border-outline-variant/5 hover:bg-surface-container/50 transition-colors ${
                              stepFailed ? 'bg-error-container/10' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`material-symbols-outlined text-sm ${getJobIconColor(step.conclusion, step.status)}`}
                                style={
                                  step.conclusion === 'success' || step.conclusion === 'failure'
                                    ? { fontVariationSettings: "'FILL' 1" }
                                    : undefined
                                }
                              >
                                {getJobIcon(step.conclusion, step.status)}
                              </span>
                              <span
                                className={`text-xs font-medium ${
                                  stepFailed ? 'text-on-surface font-semibold' : 'text-on-surface'
                                }`}
                              >
                                {step.name}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-outline">
                              {formatDuration(step.started_at, step.completed_at)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right: Metadata */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Efficiency */}
          <div className="bg-surface-container rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none select-none">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '5rem', fontVariationSettings: "'FILL' 1" }}
              >
                analytics
              </span>
            </div>
            <h3 className="text-xs font-bold text-outline uppercase tracking-widest mb-5">
              Run Statistics
            </h3>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/10">
                  <p className="text-[10px] text-outline uppercase font-bold tracking-tighter mb-1">
                    Total Jobs
                  </p>
                  <p className="text-lg font-bold text-on-surface">{totalJobs}</p>
                </div>
                <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/10">
                  <p className="text-[10px] text-outline uppercase font-bold tracking-tighter mb-1">
                    Total Steps
                  </p>
                  <p className="text-lg font-bold text-on-surface">{totalSteps}</p>
                </div>
              </div>

              {totalJobs > 0 && (
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-xs text-on-surface-variant">Jobs Passed</span>
                    <span className="text-xs font-mono text-secondary">
                      {jobs.filter(j => j.conclusion === 'success').length}/{totalJobs}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-container-low rounded-full overflow-hidden">
                    <div
                      className="h-full bg-secondary"
                      style={{
                        width: `${(jobs.filter(j => j.conclusion === 'success').length / totalJobs) * 100}%`,
                        boxShadow: '0 0 8px rgba(103,223,112,0.4)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Trigger Details */}
          <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/5">
            <h3 className="text-[10px] font-bold text-outline uppercase tracking-widest mb-4">
              Trigger Details
            </h3>
            <div className="space-y-3">
              {workflow.run.event && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-outline">Event</span>
                  <span className="text-on-surface-variant font-medium font-mono">
                    {workflow.run.event}
                  </span>
                </div>
              )}
              {workflow.run.head_branch && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-outline">Branch</span>
                  <span className="text-on-surface-variant font-medium">
                    {workflow.run.head_branch}
                  </span>
                </div>
              )}
              {workflow.run.head_sha && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-outline">Commit</span>
                  <span className="text-on-surface-variant font-medium font-mono">
                    {workflow.run.head_sha.slice(0, 7)}
                  </span>
                </div>
              )}
              {workflow.run.created_at && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-outline">Started</span>
                  <span className="text-on-surface-variant font-medium">
                    {formatDate(workflow.run.created_at)}
                  </span>
                </div>
              )}
              {workflow.repository?.url && (
                <div className="pt-3 border-t border-outline-variant/10">
                  <a
                    href={workflow.repository.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-outline hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">hub</span>
                    View Repository
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowDetails;
