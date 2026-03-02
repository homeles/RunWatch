import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './common/theme/theme';
import Layout from './common/components/Layout';
import Dashboard from './features/dashboard/Dashboard';
import WorkflowDetails from './features/workflows/WorkflowDetails';
import RepositoryStats from './features/stats/RepositoryStats';
import WorkflowHistory from './features/workflows/WorkflowHistory';
import RepositoryView from './features/repository/RepositoryView';
import Settings from './features/settings/Settings';
import { AdminTokenProvider } from './common/context/AdminTokenContext';
import './App.css';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AdminTokenProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/workflow/:id" element={<WorkflowDetails />} />
              <Route path="/workflow-history/:repoName/:workflowName" element={<WorkflowHistory />} />
              <Route path="/repository/:repoName" element={<RepositoryView />} />
              <Route path="/stats" element={<RepositoryStats />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>
        </Router>
      </AdminTokenProvider>
    </ThemeProvider>
  );
}

export default App;
