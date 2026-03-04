// Mock Socket Service for RunWatch Demo Mode
// No-op socket that simulates occasional workflow updates

const noop = () => {};

// Fake socket object
export const socket = {
  on: noop,
  off: noop,
  emit: noop,
  connected: true,
  id: 'demo-socket',
};

// Simulated real-time updates — periodically triggers onWorkflowUpdate callback
export const setupSocketListeners = (callbacks) => {
  console.log('[Demo Mode] Mock socket listeners set up');

  // No real socket events in demo mode — UI is static
  // Could add simulated updates here for live-feel

  return () => {
    console.log('[Demo Mode] Mock socket listeners cleaned up');
  };
};

export default { socket, setupSocketListeners };
