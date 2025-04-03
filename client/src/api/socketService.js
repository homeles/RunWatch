import io from 'socket.io-client';
import apiService from './apiService';

// Use the environment variables, falling back to development defaults if not set
const WS_URL = process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:5001';

// Default configuration for alerts
export const defaultAlertConfig = {
  queuedTimeAlertThreshold: 5 // Alert threshold in minutes for queued workflows
};

// Create socket connection
export const socket = io(WS_URL, {
  transports: ['websocket'],
  path: '/socket.io'
});

// Debounce function to prevent rapid successive updates
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Keep track of last update timestamps to prevent out-of-order updates
const lastUpdateTimes = new Map();

// Map to track workflows being monitored for queue time
const queuedWorkflows = new Map();

// Load existing queued workflows from the server
const loadExistingQueuedWorkflows = async (alertConfig = defaultAlertConfig) => {
  try {
    console.log('Loading existing queued workflows from server...');
    const workflows = await apiService.getQueuedWorkflows();
    
    console.log(`Loaded ${workflows.length} queued workflows from server`);
    
    workflows.forEach(workflow => {
      if (workflow.run && workflow.run.status && ['queued', 'waiting', 'pending'].includes(workflow.run.status)) {
        queuedWorkflows.set(workflow.run.id, {
          id: workflow.run.id,
          name: workflow.workflow.name,
          repository: workflow.repository.fullName,
          queued_at: workflow.run.updated_at || workflow.run.created_at,
          alerted: false // Mark as not alerted so we can catch long-running queued jobs
        });
        
        console.log(`Added existing queued workflow: ${workflow.workflow.name} (${workflow.run.id})`);
      }
    });
    
    // Run the check immediately after loading existing workflows
    if (queuedWorkflows.size > 0) {
      console.log('Running immediate check for long-queued workflows on load');
      checkQueuedWorkflows(alertConfig);
    }
  } catch (error) {
    console.error('Error loading existing queued workflows:', error);
  }
};

// Function to check if a workflow has been queued for too long
const checkQueuedWorkflows = (alertConfig = defaultAlertConfig) => {
  const threshold = alertConfig?.queuedTimeAlertThreshold || defaultAlertConfig.queuedTimeAlertThreshold;
  const now = new Date();

  console.log(`Checking ${queuedWorkflows.size} queued workflows against threshold of ${threshold} minutes`);
  
  queuedWorkflows.forEach((workflow, id) => {
    const queuedTime = new Date(workflow.queued_at);
    const queuedMinutes = (now - queuedTime) / (1000 * 60);

    console.log(`Workflow ${workflow.name} (${id}) has been queued for ${queuedMinutes.toFixed(2)} minutes`);

    if (queuedMinutes >= threshold && !workflow.alerted) {
      // Mark as alerted so we don't send multiple alerts
      workflow.alerted = true;
      queuedWorkflows.set(id, workflow);
      
      console.log(`ALERT: Workflow ${workflow.name} exceeded queue threshold (${queuedMinutes.toFixed(2)} minutes)`);

      // Emit an event for the long-queued workflow
      socket.emit('long-queued-workflow', {
        workflow: workflow.name,
        repository: workflow.repository,
        queuedMinutes: Math.floor(queuedMinutes),
        id: id
      });
      
      // Debug: Also log the emitted event data
      console.log('Emitted long-queued-workflow event:', {
        workflow: workflow.name,
        repository: workflow.repository,
        queuedMinutes: Math.floor(queuedMinutes),
        id: id
      });
    }
  });
};

export const setupSocketListeners = (callbacks) => {
  console.log('Setting up socket listeners');
  
  // Set up alert config early so it can be used in the initial check
  const alertConfig = callbacks.alertConfig || defaultAlertConfig;
  
  // Load existing queued workflows when initializing and pass alert config
  loadExistingQueuedWorkflows(alertConfig);
  
  const handleUpdate = (eventName, data, callback) => {
    const lastUpdate = lastUpdateTimes.get(data.run.id) || 0;
    const currentUpdate = new Date(data.run.updated_at).getTime();
    
    // Only process if this update is newer than the last one
    if (currentUpdate > lastUpdate) {
      lastUpdateTimes.set(data.run.id, currentUpdate);
      callback(data);
    } else {
      console.log(`Skipping outdated ${eventName} update for workflow ${data.run.id}`);
    }
  };

  // Debounced callback handlers
  const debouncedWorkflowUpdate = debounce((data) => {
    if (callbacks.onWorkflowUpdate) {
      handleUpdate('workflow', data, callbacks.onWorkflowUpdate);
    }
  }, 250);

  const debouncedJobsUpdate = debounce((data) => {
    if (callbacks.onJobsUpdate) {
      handleUpdate('jobs', data, callbacks.onJobsUpdate);
    }
  }, 250);

  // Queue time monitoring
  // Track workflows in queued state for monitoring
  socket.on('workflowUpdate', (data) => {
    console.log('Received workflow update:', data);
    
    // For workflows that are queued, add them to the monitoring list
    if (data.run && data.run.status === 'queued') {
      queuedWorkflows.set(data.run.id, {
        id: data.run.id,
        name: data.workflow.name,
        repository: data.repository.fullName,
        queued_at: data.run.updated_at || data.run.created_at,
        alerted: false
      });
    } 
    // If workflow is no longer queued, remove from monitoring
    else if (data.run && data.run.status !== 'queued' && queuedWorkflows.has(data.run.id)) {
      queuedWorkflows.delete(data.run.id);
    }

    if (callbacks.onNewWorkflow) {
      callbacks.onNewWorkflow(data);
    }
    debouncedWorkflowUpdate(data);
  });

  socket.on('workflow_update', (data) => {
    console.log('Received workflow_update event:', data);
    
    // Similar queue monitoring for workflow_update events
    if (data.run && data.run.status === 'queued') {
      queuedWorkflows.set(data.run.id, {
        id: data.run.id,
        name: data.workflow.name,
        repository: data.repository.fullName,
        queued_at: data.run.updated_at || data.run.created_at,
        alerted: false
      });
    } 
    else if (data.run && data.run.status !== 'queued' && queuedWorkflows.has(data.run.id)) {
      queuedWorkflows.delete(data.run.id);
    }
    
    debouncedWorkflowUpdate(data);
  });

  socket.on('workflowJobsUpdate', (data) => {
    console.log('Received workflowJobsUpdate event:', data);
    debouncedJobsUpdate(data);
  });

  // Setup the queue time monitoring
  const queueMonitorInterval = setInterval(() => checkQueuedWorkflows(alertConfig), 30000); // Check every 30 seconds
  
  // Setup listener for long-queued workflow events (for notifications)
  if (callbacks.onLongQueuedWorkflow) {
    socket.on('long-queued-workflow', callbacks.onLongQueuedWorkflow);
  }

  // Cleanup function
  return () => {
    socket.off('workflowUpdate');
    socket.off('workflow_update');
    socket.off('workflowJobsUpdate');
    socket.off('long-queued-workflow');
    clearInterval(queueMonitorInterval);
    lastUpdateTimes.clear();
    queuedWorkflows.clear();
  };
};

export default {
  socket,
  setupSocketListeners
};