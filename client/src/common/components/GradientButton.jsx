import React from 'react';

const GradientButton = ({ children, onClick, className = '', type = 'button', disabled = false }) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed font-bold rounded-lg shadow-lg shadow-primary/10 px-5 py-1.5 text-xs active:opacity-70 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
};

export default GradientButton;
