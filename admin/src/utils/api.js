// helpers for admin API calls that require an admin token

export const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const isAuthError = (error) => error.response?.status === 401;
