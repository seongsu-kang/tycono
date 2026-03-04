import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { CompanyStatus } from '../types';

export function useCompanyStatus() {
  const [status, setStatus] = useState<CompanyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return {
    initialized: status?.initialized ?? false,
    companyName: status?.companyName ?? null,
    engine: status?.engine ?? 'none',
    companyRoot: status?.companyRoot ?? '',
    loading,
    error,
    refetch: fetch,
  };
}
