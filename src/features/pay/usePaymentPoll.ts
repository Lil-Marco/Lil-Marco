import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { PaymentStatus } from '../../domain/types';
import { api } from '../../state/api';

/**
 * Polls payment status every 3 s, backing off to 5 s after 30 s (TDD §10.3,
 * UX Flow §9 "slow network on P-3"). Also listens to the live channel so a
 * callback landing is reflected immediately. Stops on a terminal state.
 * The result is announced through the accessibility live channel.
 */
export function usePaymentPoll(fetch: (() => Promise<PaymentStatus | null>) | null, startedAt: number | null) {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;
  const done = status !== null && status.attemptStatus !== 'PENDING';

  useEffect(() => {
    setStatus(null);
  }, [startedAt]);

  useEffect(() => {
    if (!fetch || !startedAt || done) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const s = await fetchRef.current?.();
        if (!cancelled && s) setStatus(s);
        if (s && s.attemptStatus !== 'PENDING') return;
      } catch {
        // offline or slow: keep polling; the countdown keeps running on the client clock
      }
      if (cancelled) return;
      const interval = Date.now() - startedAt > 30_000 ? 5000 : 3000;
      timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, 1500);
    const unsub = api.subscribe((e) => {
      if (e.type === 'changed' || e.type === 'payment_received') {
        fetchRef.current?.().then((s) => !cancelled && s && setStatus(s)).catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub();
    };
  }, [fetch, startedAt, done]);

  useEffect(() => {
    if (!status) return;
    if (status.attemptStatus === 'SUCCESS') AccessibilityInfo.announceForAccessibility('Payment received');
    else if (status.attemptStatus !== 'PENDING') AccessibilityInfo.announceForAccessibility('Payment didn’t go through. No money left your account.');
  }, [status?.attemptStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  return status;
}

let seq = 0;
/** Idempotency key for the pay endpoint: one per user intent, reused on double-tap. */
export function newIdempotencyKey() {
  seq += 1;
  return `${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 10)}`;
}
