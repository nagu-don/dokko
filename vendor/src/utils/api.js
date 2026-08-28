export const getAuthHeaders = () => {
  const token = localStorage.getItem('vendorToken');
  return { Authorization: `Bearer ${token}` };
};

export const isAuthError = (error) =>
  error?.response?.status === 401 || error?.response?.status === 403;
