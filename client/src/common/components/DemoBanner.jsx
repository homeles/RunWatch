import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import ScienceIcon from '@mui/icons-material/Science';

const DemoBanner = () => (
  <Box
    sx={{
      background: 'linear-gradient(90deg, #1a1b2e 0%, #2d1b4e 50%, #1a1b2e 100%)',
      borderBottom: '1px solid rgba(139, 92, 246, 0.3)',
      py: 0.75,
      px: 2,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1.5,
      zIndex: 1300,
      position: 'relative',
    }}
  >
    <Chip
      icon={<ScienceIcon sx={{ fontSize: 16 }} />}
      label="DEMO"
      size="small"
      sx={{
        bgcolor: 'rgba(139, 92, 246, 0.2)',
        color: '#A78BFA',
        border: '1px solid rgba(139, 92, 246, 0.4)',
        fontWeight: 700,
        fontSize: '0.7rem',
        height: 24,
      }}
    />
    <Typography variant="body2" sx={{ color: '#8B949E', fontSize: '0.8rem' }}>
      This is a demo with mock data.{' '}
      <Typography
        component="a"
        href="https://github.com/homeles/RunWatch"
        target="_blank"
        rel="noopener noreferrer"
        sx={{ color: '#58A6FF', fontSize: '0.8rem', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
      >
        Install RunWatch →
      </Typography>
    </Typography>
  </Box>
);

export default DemoBanner;
