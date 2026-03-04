// Socket Service proxy — switches between real and mock based on REACT_APP_DEMO_MODE
import * as realSocket from './realSocketService';
import * as mockSocket from './mockSocketService';

const isDemoMode = process.env.REACT_APP_DEMO_MODE === 'true';

const active = isDemoMode ? mockSocket : realSocket;

export const socket = active.socket;
export const setupSocketListeners = active.setupSocketListeners;
export const defaultAlertConfig = isDemoMode ? {} : (realSocket.defaultAlertConfig || {});

const socketExports = { socket, setupSocketListeners, defaultAlertConfig };
export default socketExports;
