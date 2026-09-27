import type { Me } from '../api/types';

/**
 * UX Flow §11 route guards, evaluated in order:
 *  1. /i/… — no guard at all
 *  2. no session on /app or /onboarding → login, original path kept in ?next=
 *  3. session but email unverified → A-2
 *  4. verified but profile incomplete → A-8, except settings and help
 *  5. session on A-1, A-4 or A-5 → D-1
 * M-Pesa not being connected is deliberately NOT a guard.
 */
export function homeFor(me: Me): string {
  if (!me.user.emailVerifiedAt) return '/signup/sent';
  if (!me.profile.profileCompletedAt) return '/onboarding/profile';
  return '/app';
}

export function guardApp(me: Me | null, pathname: string): string | null {
  if (!me) return `/login?next=${encodeURIComponent(pathname)}`;
  if (!me.user.emailVerifiedAt) return '/signup/sent';
  const exempt = pathname.startsWith('/app/settings') || pathname.startsWith('/app/help') || pathname.startsWith('/app/simulator');
  if (!me.profile.profileCompletedAt && !exempt) return '/onboarding/profile';
  return null;
}

/** Only same-app paths are honoured for ?next= — never an external URL. */
export function safeNext(next: string | undefined | null): string | null {
  if (!next) return null;
  const n = decodeURIComponent(next);
  return n.startsWith('/app') || n.startsWith('/onboarding') ? n : null;
}
