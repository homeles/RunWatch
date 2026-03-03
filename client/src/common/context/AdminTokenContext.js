import React, { createContext, useContext, useState, useCallback } from 'react';

const AdminTokenContext = createContext();

export const useAdminToken = () => useContext(AdminTokenContext);

export const AdminTokenProvider = ({ children }) => {
  const [token, setTokenState] = useState(() => sessionStorage.getItem('adminToken') || '');

  const setToken = useCallback((newToken) => {
    setTokenState(newToken);
    if (newToken) {
      sessionStorage.setItem('adminToken', newToken);
    } else {
      sessionStorage.removeItem('adminToken');
    }
  }, []);

  const clearToken = useCallback(() => {
    setTokenState('');
    sessionStorage.removeItem('adminToken');
  }, []);

  return (
    <AdminTokenContext.Provider value={{ token, setToken, clearToken }}>
      {children}
    </AdminTokenContext.Provider>
  );
};
