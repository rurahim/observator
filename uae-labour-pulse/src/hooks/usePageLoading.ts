import { useState, useEffect } from 'react';

/** Simulates a brief loading state on mount for skeleton transitions */
export const usePageLoading = (delay = 600) => {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return loading;
};
