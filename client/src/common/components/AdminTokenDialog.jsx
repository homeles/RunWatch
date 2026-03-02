import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

const AdminTokenDialog = ({ open, onClose, onSubmit, error }) => {
  const [inputToken, setInputToken] = useState('');

  const handleSubmit = () => {
    if (inputToken.trim()) {
      onSubmit(inputToken.trim());
      setInputToken('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LockIcon color="primary" />
        Admin Authentication Required
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Backup and restore operations require an admin token. Enter the token configured
          in the server&apos;s <code>ADMIN_API_TOKEN</code> environment variable.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          type="password"
          label="Admin Token"
          value={inputToken}
          onChange={(e) => setInputToken(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter admin API token"
          variant="outlined"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!inputToken.trim()}>
          Authenticate
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AdminTokenDialog;
