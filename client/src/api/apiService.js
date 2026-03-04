// API Service proxy — switches between real and mock based on REACT_APP_DEMO_MODE
import realApiService from './realApiService';
import mockApiService from './mockApiService';

const isDemoMode = process.env.REACT_APP_DEMO_MODE === 'true';

if (isDemoMode) {
  console.log('🎭 RunWatch Demo Mode — using mock data');
}

const apiService = isDemoMode ? mockApiService : realApiService;
export default apiService;
