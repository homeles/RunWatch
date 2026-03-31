import React, { useState, useEffect, useRef } from 'react';

const AdminTokenDialog = ({ open, onClose, onSubmit, error }) => {
  const [inputToken, setInputToken] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) {
      // Small delay to allow the dialog to render before focusing
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!open) setInputToken('');
  }, [open]);

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
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-surface-container rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-outline-variant/20">
        {/* Title */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-2">
          <span className="material-symbols-outlined text-primary text-[24px]">lock</span>
          <h2 className="text-lg font-semibold text-on-surface">Admin Authentication Required</h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="text-sm text-on-surface-variant mb-4">
            Backup and restore operations require an admin token. Enter the token configured
            in the server&apos;s <code className="text-xs bg-surface-variant/50 px-1.5 py-0.5 rounded font-mono">ADMIN_API_TOKEN</code> environment variable.
          </p>

          {error && (
            <div className="flex items-center gap-2 bg-error-container/20 text-error border border-error/20 rounded-lg px-4 py-3 mb-4 text-sm">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-token" className="text-xs uppercase tracking-widest text-on-surface-variant font-medium">
              Admin Token
            </label>
            <input
              ref={inputRef}
              id="admin-token"
              type="password"
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter admin API token"
              className="w-full bg-surface-container-low text-on-surface border border-outline-variant/30 rounded-lg px-4 py-2.5 text-sm placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/30 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!inputToken.trim()}
            className="px-5 py-2 text-sm font-bold bg-gradient-to-br from-primary to-primary-container text-on-primary-fixed rounded-lg shadow-lg shadow-primary/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:opacity-70"
          >
            Authenticate
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminTokenDialog;
