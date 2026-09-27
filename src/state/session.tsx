import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Me } from '../api/types';

interface SessionCtx {
  me: Me | null;
  ready: boolean;
  setMe: (me: Me | null) => void;
  refreshMe: () => Promise<Me | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api
      .restoreSession()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setReady(true));
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const m = await api.me();
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    }
  }, []);

  // Keep plan usage, M-Pesa status etc. current when anything changes.
  useEffect(
    () =>
      api.subscribe((e) => {
        if (e.type === 'changed' && me) void refreshMe();
      }),
    [me, refreshMe],
  );

  const signOut = useCallback(async () => {
    await api.logout();
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, ready, setMe, refreshMe, signOut }), [me, ready, refreshMe, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}

/** Guard 4 in UX Flow §11: verified but business profile incomplete. */
export function profileIncomplete(me: Me) {
  return !me.profile.profileCompletedAt;
}
