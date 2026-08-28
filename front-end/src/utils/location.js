// preferred drop-off location persisted locally on the customer device
const PREFERRED_KEY = 'dokkoPreferredDropoff';

export const loadPreferredDropoff = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFERRED_KEY));
  } catch {
    return null;
  }
};

export const savePreferredDropoff = (loc) => {
  localStorage.setItem(PREFERRED_KEY, JSON.stringify(loc));
};
