import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from './api';
import { ApiError } from '../api/errors';

export interface Resource<T> {
  data: T | undefined;
  error: ApiError | Error | null;
  loading: boolean;
  refreshing: boolean;
  refetch: () => Promise<void>;
}

const STALE_MS = 15 * 60 * 1000;

/**
 * Server state for a screen: loading / error / data, refetched when the screen
 * regains focus, when the API reports a change (the live channel), and when the
 * app returns from the background after 15 minutes — never showing stale money.
 */
export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  const lastFetch = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (mode === 'refresh') setRefreshing(true);
    try {
      const d = await fetcherRef.current();
      if (!alive.current) return;
      setData(d);
      setError(null);
      lastFetch.current = Date.now();
    } catch (e) {
      if (!alive.current) return;
      if (mode !== 'silent') setError(e as Error);
    } finally {
      if (alive.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    void run('initial');
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = api.subscribe((e) => {
      if (e.type !== 'changed' && e.type !== 'payment_received') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run('silent'), 80);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [run]);

  useFocusEffect(
    useCallback(() => {
      if (lastFetch.current) void run('silent');
    }, [run]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - lastFetch.current > STALE_MS) void run('silent');
    });
    return () => sub.remove();
  }, [run]);

  const refetch = useCallback(() => run('refresh'), [run]);
  return { data, error, loading, refreshing, refetch };
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Something went wrong. Try again.';
}
