import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { socket } from '../../api/socketService';
import apiService from '../../api/apiService';

const SyncHistoryDetails = ({ sync: initialSync, onClose }) => {
  const [sync, setSync] = useState(initialSync);

  useEffect(() => {
    setSync(initialSync);
  }, [initialSync]);

  useEffect(() => {
    if (!sync || !sync._id) return;

    const updateSyncDetails = async () => {
      try {
        const response = await apiService.getSyncHistory();
        const updatedSync = response.data.find(s => s._id === sync._id);
        if (updatedSync) { setSync(updatedSync); }
      } catch (error) {
        console.error('Failed to fetch sync details:', error);
      }
    };

    socket.on('syncProgress', async (data) => {
      if (sync.status === 'in_progress') { await updateSyncDetails(); }
    });
    socket.on('rateLimitUpdate', async () => {
      if (sync.status === 'in_progress') { await updateSyncDetails(); }
    });
    socket.on('syncStatus', async () => { await updateSyncDetails(); });

    return () => {
      socket.off('syncProgress');
      socket.off('rateLimitUpdate');
      socket.off('syncStatus');
    };
  }, [sync?._id, sync?.status]);

  const getStatusClasses = (status) => {
    switch (status) {
      case 'completed': return 'bg-secondary/15 text-secondary border-secondary/20';
      case 'failed':
      case 'interrupted': return 'bg-error/15 text-error border-error/20';
      case 'in_progress': return 'bg-primary/15 text-primary border-primary/20';
      case 'paused': return 'bg-[rgba(245,159,0,0.15)] text-[#F5A623] border-[rgba(245,159,0,0.2)]';
      default: return 'bg-outline/15 text-outline border-outline/20';
    }
  };

  const getProgressDetails = () => {
    if (sync.status === 'interrupted' && sync.results?.lastProgress) {
      return sync.results.lastProgress;
    }
    return sync.results?.progress;
  };

  const getResultsSummary = () => {
    const progress = getProgressDetails();
    const total = sync.results?.totalRepositories || progress?.totalRepos || 0;
    if (sync.status === 'completed') {
      return {
        totalRepositories: total,
        repositories: sync.results?.repositories || 0,
        workflows: sync.results?.workflows || 0,
        runs: sync.results?.runs || 0
      };
    }
    return {
      totalRepositories: total,
      repositories: progress?.processedRepos || 0,
      workflows: progress?.processedWorkflows || 0,
      runs: progress?.processedRuns || 0
    };
  };

  if (!sync) return null;

  const progressDetails = getProgressDetails();
  const showProgress = sync.status === 'in_progress' || sync.status === 'paused' ||
    (sync.status === 'interrupted' && sync.results?.lastProgress);
  const summary = getResultsSummary();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-low border border-outline-variant rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant">
          <h2 className="text-on-surface font-semibold">
            Sync Details — {format(new Date(sync.startedAt), 'PPpp')}
          </h2>
          <button
            onClick={onClose}
            aria-label="close"
            className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status + Meta */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-on-surface text-sm">Status:</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusClasses(sync.status)}`}>
                {sync.status}
              </span>
            </div>
            <p className="text-on-surface-variant text-sm">
              Organization: {sync.organization.name} ({sync.organization.type})
            </p>
            <p className="text-on-surface-variant text-sm">
              Workflow Run Limit: {sync.config?.maxWorkflowRuns || 'Not set'} runs per workflow
            </p>
            {sync.completedAt && (
              <p className="text-on-surface-variant text-sm">
                Completed: {format(new Date(sync.completedAt), 'PPpp')}
              </p>
            )}
          </div>

          {/* Progress */}
          {showProgress && progressDetails && (
            <div className="space-y-3">
              <div>
                <p className="text-on-surface-variant text-sm mb-1">
                  Progress: {progressDetails.current}%
                </p>
                <div className="w-full h-2 bg-primary/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${progressDetails.current}%`,
                      backgroundColor: sync.status === 'interrupted' ? '#f44336' : '#58A6FF'
                    }}
                  />
                </div>
                {progressDetails.currentRepo && (
                  <div className="mt-2">
                    <p className="text-on-surface text-sm">
                      Processing: {progressDetails.currentRepo}
                      {progressDetails.currentWorkflow && ` — ${progressDetails.currentWorkflow}`}
                    </p>
                    <p className="text-on-surface-variant text-sm">
                      Repository {progressDetails.repoIndex + 1}/{progressDetails.totalRepos}
                      {progressDetails.workflowIndex !== null &&
                       progressDetails.totalWorkflows &&
                       ` • Workflow ${progressDetails.workflowIndex + 1}/${progressDetails.totalWorkflows}`}
                    </p>
                  </div>
                )}
              </div>

              {/* Rate Limits */}
              {sync.results?.rateLimits && (
                <div className="p-3 bg-surface/50 rounded-xl">
                  <p className="text-on-surface text-sm font-medium mb-2">GitHub API Rate Limits</p>
                  <div className="flex items-center gap-4">
                    <span className="text-on-surface-variant text-sm">
                      Remaining: {sync.results.rateLimits.remaining}/{sync.results.rateLimits.limit}
                    </span>
                    <span className="text-on-surface-variant text-sm">
                      Resets: {new Date(sync.results.rateLimits.resetTime).toLocaleTimeString()}
                    </span>
                    <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(sync.results.rateLimits.remaining / sync.results.rateLimits.limit) * 100}%`,
                          backgroundColor: sync.results.rateLimits.remaining < 1000 ? '#ff9800' : '#4caf50'
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results Summary */}
          <div>
            <p className="text-on-surface font-medium mb-2">Results Summary</p>
            <div className="space-y-1 text-sm">
              <p className="text-on-surface-variant">
                Repositories Processed: <span className="text-on-surface">{summary.repositories}/{summary.totalRepositories}</span>
              </p>
              <p className="text-on-surface-variant">
                Workflows Processed: <span className="text-on-surface">{summary.workflows}</span>
              </p>
              <p className="text-on-surface-variant">
                Runs Processed: <span className="text-on-surface">{summary.runs}</span>
              </p>
            </div>
          </div>

          {/* Errors */}
          {sync.results?.errors?.length > 0 && (
            <div>
              <p className="text-error font-medium mb-2">Errors</p>
              <div className="space-y-2">
                {sync.results.errors.map((error, index) => (
                  <div key={index} className="p-3 rounded-xl border bg-error/10 border-error/30 text-error text-sm">
                    {error.type}: {error.error}
                    {error.name && ` (${error.name})`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-outline-variant">
          <button
            onClick={onClose}
            className="px-4 py-2 text-on-surface-variant rounded-xl text-sm hover:bg-surface-container transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SyncHistoryDetails;
