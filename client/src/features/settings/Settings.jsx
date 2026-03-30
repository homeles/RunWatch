import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../../api/apiService';
import { socket } from '../../api/socketService';
import { formatDistanceToNow } from 'date-fns';
import SyncHistoryDetails from './SyncHistoryDetails';
import { useAdminToken } from '../../common/context/AdminTokenContext';
import AdminTokenDialog from '../../common/components/AdminTokenDialog';

const Settings = () => {
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [selectedInstallation, setSelectedInstallation] = useState('');
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState(null);
  const [syncHistory, setSyncHistory] = useState([]);
  const [maxWorkflowRuns, setMaxWorkflowRuns] = useState(100);
  const [rateLimits, setRateLimits] = useState(null);
  const [syncDetails, setSyncDetails] = useState(null);
  const [activeSync, setActiveSync] = useState(null);
  const [selectedSync, setSelectedSync] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [restoreMessage, setRestoreMessage] = useState(null);
  const [restoreMessageType, setRestoreMessageType] = useState('success');
  const { token: adminToken, setToken: setAdminToken } = useAdminToken();
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);

  const fetchActiveSync = async () => {
    try {
      const response = await apiService.getActiveSync();
      if (response.data) {
        const sync = response.data;
        setActiveSync(sync);
        setSyncing(sync.status === 'in_progress' || sync.status === 'paused');
        if (sync.results?.progress) {
          setProgress(sync.results.progress.current);
          if (sync.results.progress.currentRepo) {
            setCurrentOperation({
              repo: sync.results.progress.currentRepo,
              workflow: sync.results.progress.currentWorkflow
            });
          }
          setSyncDetails({
            currentRepoIndex: sync.results.progress.repoIndex + 1,
            totalRepos: sync.results.progress.totalRepos,
            currentWorkflowIndex: sync.results.progress.workflowIndex !== null ?
              sync.results.progress.workflowIndex + 1 : undefined,
            totalWorkflows: sync.results.progress.totalWorkflows
          });
        }
        if (sync.results?.rateLimits) {
          setRateLimits(sync.results.rateLimits);
        }
        if (sync.status === 'paused') {
          setError(`Sync paused: Rate limit reached. Will resume at ${new Date(sync.results.rateLimitPause.resumeAt).toLocaleString()}`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch active sync:', err);
    }
  };

  useEffect(() => {
    fetchOrganizations();
    fetchSyncHistory();
    fetchActiveSync();
    fetchDatabaseStatus();

    socket.on('connect', () => {
      console.log('Socket connected, fetching active sync...');
      fetchActiveSync();
    });

    socket.on('syncProgress', (data) => {
      setSyncing(true);
      setProgress(data.progress);
      if (data.rateLimits) { setRateLimits(data.rateLimits); }
      if (data.currentRepo && data.currentWorkflow) {
        setCurrentOperation({ repo: data.currentRepo, workflow: data.currentWorkflow });
      }
      if (data.details) { setSyncDetails(data.details); }
      if (data.completed) { setSyncing(false); setActiveSync(null); }
    });

    socket.on('rateLimitUpdate', (data) => { setRateLimits(data); });

    socket.on('syncStatus', (data) => {
      if (data.status === 'paused') { setError(data.message); }
      else if (data.status === 'resumed') { setError(null); }
    });

    return () => {
      socket.off('connect');
      socket.off('syncProgress');
      socket.off('rateLimitUpdate');
      socket.off('syncStatus');
    };
  }, []);

  const fetchSyncHistory = async () => {
    try {
      const response = await apiService.getSyncHistory();
      setSyncHistory(response.data);
    } catch (err) {
      console.error('Failed to fetch sync history:', err);
    }
  };

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const response = await apiService.getOrganizations();
      setOrganizations(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch organizations. Please check your GitHub App configuration.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDatabaseStatus = async () => {
    try {
      const status = await apiService.getDatabaseStatus();
      setDbStatus(status);
    } catch (err) {
      console.error('Failed to fetch database status:', err);
    }
  };

  const handleSync = async () => {
    if (!selectedInstallation) {
      setError('Please select an organization to sync');
      return;
    }
    try {
      setSyncing(true);
      setError(null);
      setResults(null);
      setProgress(0);
      setCurrentOperation(null);
      const response = await apiService.syncGitHubData(selectedInstallation, { maxWorkflowRuns });
      setResults(response.results);
      await fetchSyncHistory();
    } catch (err) {
      setError(err.message || 'Failed to sync GitHub data');
    } finally {
      setSyncing(false);
      setProgress(0);
      setCurrentOperation(null);
    }
  };

  const handleSyncClick = (sync) => { setSelectedSync(sync); };

  const requireToken = useCallback((action) => {
    if (adminToken) return true;
    setPendingAction(action);
    setTokenError('');
    setShowTokenDialog(true);
    return false;
  }, [adminToken]);

  const handleTokenSubmit = useCallback((newToken) => {
    setAdminToken(newToken);
    setShowTokenDialog(false);
    setTokenError('');
    const action = pendingAction;
    setPendingAction(null);
    if (action === 'backup') { executeBackup(newToken); }
    else if (action?.type === 'restore') { executeRestore(action.event, newToken); }
  }, [pendingAction, setAdminToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const getAuthErrorMessage = (err) => {
    const status = err?.response?.status;
    if (status === 401) return 'Invalid or missing admin token. Please re-enter your token.';
    if (status === 503) return 'Admin token is not configured on the server. Set ADMIN_API_TOKEN env var.';
    return err.message;
  };

  const executeBackup = async (tokenOverride) => {
    const tkn = tokenOverride || adminToken;
    try {
      const response = await apiService.createDatabaseBackup(tkn);
      const backupData = JSON.stringify(response.data);
      const blob = new Blob([backupData], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `runwatch-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setRestoreMessage('Database backup created successfully');
      setRestoreMessageType('success');
    } catch (err) {
      if (err?.response?.status === 401) {
        setAdminToken('');
        setTokenError(getAuthErrorMessage(err));
        setPendingAction('backup');
        setShowTokenDialog(true);
        return;
      }
      setRestoreMessage(getAuthErrorMessage(err));
      setRestoreMessageType('error');
      console.error(err);
    }
  };

  const handleCreateBackup = async () => {
    if (!requireToken('backup')) return;
    executeBackup();
  };

  const executeRestore = async (event, tokenOverride) => {
    const tkn = tokenOverride || adminToken;
    try {
      const file = event.target?.files?.[0];
      if (!file) return;
      setRestoreMessage('Restoring database...');
      setRestoreMessageType('info');
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const backupData = JSON.parse(e.target.result);
          const response = await apiService.restoreDatabaseBackup(backupData, tkn);
          await fetchDatabaseStatus();
          setRestoreMessage(
            `Database restored successfully:\n` +
            `• ${response.data.stats.collectionsProcessed} collections processed\n` +
            `• ${response.data.stats.documentsRestored.toLocaleString()} documents restored\n` +
            (response.data.stats.errors.length > 0 ?
              `• ${response.data.stats.errors.length} errors occurred during restore` : '')
          );
          setRestoreMessageType(response.data.stats.errors.length > 0 ? 'warning' : 'success');
          setError(null);
        } catch (err) {
          if (err?.response?.status === 401) {
            setAdminToken('');
            setTokenError(getAuthErrorMessage(err));
            setPendingAction({ type: 'restore', event });
            setShowTokenDialog(true);
            return;
          }
          setRestoreMessage(getAuthErrorMessage(err));
          setRestoreMessageType('error');
          console.error(err);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      setRestoreMessage('Failed to read backup file');
      setRestoreMessageType('error');
      console.error(err);
    }
  };

  const handleRestoreBackup = async (event) => {
    if (!requireToken({ type: 'restore', event })) return;
    executeRestore(event);
  };

  const syncStatusColors = {
    completed: 'bg-secondary/15 text-secondary border-secondary/20',
    failed: 'bg-error/15 text-error border-error/20',
    interrupted: 'bg-error/15 text-error border-error/20',
    in_progress: 'bg-primary/15 text-primary border-primary/20',
    paused: 'bg-[rgba(245,159,0,0.15)] text-[#F5A623] border-[rgba(245,159,0,0.2)]',
  };

  const alertColors = {
    success: 'bg-secondary/10 border-secondary/30 text-secondary',
    error: 'bg-error/10 border-error/30 text-error',
    warning: 'bg-[rgba(245,159,0,0.1)] border-[rgba(245,159,0,0.3)] text-[#F5A623]',
    info: 'bg-primary/10 border-primary/30 text-primary',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">

      {/* Database Health */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
        <h2 className="text-on-surface text-lg font-semibold mb-4">Database Health</h2>
        {dbStatus ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                <p className="text-on-surface-variant text-xs mb-1">Status</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${dbStatus.ok ? 'bg-secondary/15 text-secondary border-secondary/20' : 'bg-error/15 text-error border-error/20'}`}>
                  {dbStatus.ok ? 'Healthy' : 'Unhealthy'}
                </span>
              </div>
              <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                <p className="text-on-surface-variant text-xs mb-1">Total Workflows</p>
                <p className="text-on-surface font-semibold">{dbStatus.totalWorkflows?.toLocaleString() || 'N/A'}</p>
              </div>
              <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                <p className="text-on-surface-variant text-xs mb-1">Storage Size</p>
                <p className="text-on-surface font-semibold">{`${(dbStatus.storageSize / (1024 * 1024)).toFixed(1)} MB`}</p>
              </div>
              <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                <p className="text-on-surface-variant text-xs mb-1">Data Size</p>
                <p className="text-on-surface font-semibold">{`${(dbStatus.dataSize / (1024 * 1024)).toFixed(1)} MB`}</p>
              </div>
              <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                <p className="text-on-surface-variant text-xs mb-1">Collections</p>
                <p className="text-on-surface font-semibold">{dbStatus.collections || 'N/A'}</p>
              </div>
              <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                <p className="text-on-surface-variant text-xs mb-1">Indexes</p>
                <p className="text-on-surface font-semibold">{dbStatus.indexes || 'N/A'}</p>
              </div>
              <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                <p className="text-on-surface-variant text-xs mb-1">Avg Object Size</p>
                <p className="text-on-surface font-semibold">{`${(dbStatus.avgObjSize / 1024).toFixed(1)} KB`}</p>
              </div>
              <div className="bg-surface-container border border-outline-variant rounded-xl p-3">
                <p className="text-on-surface-variant text-xs mb-1">Last Update</p>
                <p className="text-on-surface text-sm">
                  {dbStatus.lastUpdated?.run?.run?.updated_at
                    ? formatDistanceToNow(new Date(dbStatus.lastUpdated.run.run.updated_at), { addSuffix: true })
                    : 'N/A'}
                </p>
              </div>
            </div>

            {restoreMessage && (
              <div className={`mt-4 p-3 rounded-xl border text-sm whitespace-pre-line flex items-start gap-2 ${alertColors[restoreMessageType] || alertColors.info}`}>
                <span className="material-symbols-outlined text-base mt-0.5">
                  {restoreMessageType === 'success' ? 'check_circle' : restoreMessageType === 'error' ? 'error' : 'info'}
                </span>
                <span className="flex-1">{restoreMessage}</span>
                <button onClick={() => setRestoreMessage(null)} className="opacity-60 hover:opacity-100">
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleCreateBackup}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm hover:bg-primary/20 transition-colors"
              >
                <span className="material-symbols-outlined text-base">save</span>
                Create Backup
              </button>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl text-sm hover:bg-primary/20 transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-base">restore</span>
                Restore Backup
                <input type="file" className="hidden" accept=".json" onChange={handleRestoreBackup} />
              </label>
            </div>
          </>
        ) : (
          <p className="text-on-surface-variant">Loading database status...</p>
        )}
      </div>

      {/* GitHub API Rate Limits */}
      {rateLimits && (
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
          <h2 className="text-on-surface text-lg font-semibold mb-4">GitHub API Rate Limits</h2>
          <div className="flex items-center gap-4">
            <span className="text-on-surface text-sm">
              Remaining: {rateLimits.remaining}/{rateLimits.limit}
            </span>
            <span className="text-on-surface-variant text-sm">
              Resets at: {new Date(rateLimits.resetTime).toLocaleTimeString()}
            </span>
            <div className="w-24 h-2 bg-black/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(rateLimits.remaining / rateLimits.limit) * 100}%`,
                  backgroundColor: rateLimits.remaining < 1000 ? '#ff9800' : '#4caf50'
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* GitHub Synchronization */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
        <h2 className="text-on-surface text-xl font-semibold mb-2">GitHub Synchronization</h2>
        <p className="text-on-surface-variant text-sm mb-6">
          Sync your GitHub Actions workflow history with RunWatch. This will fetch historical data for all workflows in your organization's repositories.
        </p>

        <div className="space-y-4">
          {/* Organization Select */}
          <div>
            <label className="block text-on-surface-variant text-sm mb-1">Organization</label>
            <select
              value={selectedInstallation}
              onChange={(e) => setSelectedInstallation(e.target.value)}
              disabled={syncing}
              className="w-full bg-surface-container border border-outline-variant text-on-surface rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="">Select an organization...</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.account.login} ({org.account.type})
                </option>
              ))}
            </select>
          </div>

          {/* Workflow Runs Limit */}
          <div>
            <label className="block text-on-surface-variant text-sm mb-1">Workflow Runs Limit</label>
            <select
              value={maxWorkflowRuns}
              onChange={(e) => setMaxWorkflowRuns(e.target.value)}
              disabled={syncing}
              className="w-full bg-surface-container border border-outline-variant text-on-surface rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary disabled:opacity-50"
            >
              <option value={10}>Last 10 runs</option>
              <option value={50}>Last 50 runs</option>
              <option value={100}>Last 100 runs</option>
              <option value={500}>Last 500 runs</option>
              <option value={1000}>Last 1000 runs</option>
            </select>
            <p className="text-on-surface-variant text-xs mt-1">
              Limit the number of workflow runs to import per workflow
            </p>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing || !selectedInstallation}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {syncing ? (
              <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-base">sync</span>
            )}
            {syncing ? 'Syncing...' : 'Sync GitHub Data'}
          </button>
        </div>

        {/* Progress */}
        {syncing && (
          <div className="mt-6">
            <div className="flex flex-col gap-1 mb-3">
              <p className="text-on-surface-variant text-sm">{progress}% Complete</p>
              {syncDetails && (
                <p className="text-on-surface-variant text-sm">
                  Repository {syncDetails.currentRepoIndex}/{syncDetails.totalRepos}
                  {syncDetails.currentWorkflowIndex !== undefined && ` • Workflow ${syncDetails.currentWorkflowIndex}/${syncDetails.totalWorkflows}`}
                </p>
              )}
              {currentOperation && (
                <p className="text-on-surface-variant text-sm break-words">
                  Current: {currentOperation.repo} - {currentOperation.workflow}
                </p>
              )}
            </div>
            <div className="w-full h-2 bg-primary/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 p-3 rounded-xl border bg-error/10 border-error/30 text-error text-sm flex items-start gap-2">
            <span className="material-symbols-outlined text-base mt-0.5">error</span>
            {error}
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="mt-6">
            <div className="p-3 rounded-xl border bg-secondary/10 border-secondary/30 text-secondary text-sm flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-base">check_circle</span>
              Synchronization completed successfully!
            </div>
            <div className="space-y-2">
              {[
                { label: 'Organization', value: results.organization },
                { label: 'Repositories Processed', value: results.repositories },
                { label: 'Workflows Found', value: results.workflows },
                { label: 'Workflow Runs Synced', value: results.runs },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-outline-variant/50">
                  <span className="text-on-surface-variant text-sm">{label}</span>
                  <span className="text-on-surface text-sm">{value}</span>
                </div>
              ))}
            </div>

            {results.errors && results.errors.length > 0 && (
              <div className="mt-4 p-3 rounded-xl border bg-[rgba(245,159,0,0.1)] border-[rgba(245,159,0,0.3)] text-[#F5A623]">
                <p className="text-sm font-medium mb-2">Some items failed to sync:</p>
                <div className="space-y-1">
                  {results.errors.map((error, index) => (
                    <div key={index} className="text-xs">
                      <span className="font-medium">{error.type}: {error.name || error.id}</span>
                      <span className="opacity-70"> — {error.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sync History */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
        <h2 className="text-on-surface text-lg font-semibold mb-4">Sync History</h2>
        <div className="space-y-0">
          {syncHistory.map((sync, index) => (
            <React.Fragment key={sync._id}>
              {index > 0 && <hr className="border-outline-variant" />}
              <button
                onClick={() => handleSyncClick(sync)}
                className="w-full text-left px-1 py-3 hover:bg-primary/5 transition-colors rounded"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-on-surface text-sm">{sync.organization.name}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${syncStatusColors[sync.status] || 'bg-outline/15 text-outline border-outline/20'}`}>
                    {sync.status}
                  </span>
                </div>
                <p className="text-on-surface-variant text-xs">
                  Started {formatDistanceToNow(new Date(sync.startedAt))} ago
                </p>
                {sync.status === 'in_progress' && sync.results?.progress && (
                  <div className="mt-2">
                    <div className="w-full h-1 bg-primary/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${sync.results.progress.current}%` }}
                      />
                    </div>
                    <p className="text-on-surface-variant text-xs mt-0.5">
                      {sync.results.progress.current}% Complete
                    </p>
                  </div>
                )}
              </button>
            </React.Fragment>
          ))}
          {syncHistory.length === 0 && (
            <p className="text-on-surface-variant text-sm text-center py-4">
              No sync history available
            </p>
          )}
        </div>
      </div>

      <SyncHistoryDetails
        sync={selectedSync}
        onClose={() => setSelectedSync(null)}
      />
      <AdminTokenDialog
        open={showTokenDialog}
        onClose={() => { setShowTokenDialog(false); setPendingAction(null); }}
        onSubmit={handleTokenSubmit}
        error={tokenError}
      />
    </div>
  );
};

export default Settings;
