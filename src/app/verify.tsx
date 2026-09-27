import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../state/api';
import { useSession } from '../state/session';
import { homeFor } from '../state/guards';
import { isApiError } from '../api/errors';
import { AuthShell } from '../features/auth/AuthShell';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';
import { color, space } from '../ui/tokens';

/** A-3 Verify — a route, not really a screen: a spinner for under a second, then one of three outcomes. */
export default function Verify() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { me, refreshMe } = useSession();
  const [state, setState] = useState<'working' | 'expired' | 'already'>('working');

  useEffect(() => {
    (async () => {
      try {
        const r = await api.verifyEmail(token ?? '');
        if (r === 'ALREADY') {
          setState('already');
          return;
        }
        const m = await refreshMe();
        router.replace(m ? homeFor(m) : '/login');
      } catch (e) {
        setState(isApiError(e, 'TOKEN_EXPIRED') ? 'expired' : 'already');
      }
    })();
  }, [token, refreshMe]);

  if (state === 'working') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.canvas, gap: space[3] }}>
        <ActivityIndicator color={color.primary} />
        <Text variant="bodySm">Confirming your email…</Text>
      </View>
    );
  }
  if (state === 'expired') {
    return (
      <AuthShell title="This link has expired">
        <Text variant="body">Verification links work for 24 hours. We’ll send you a fresh one.</Text>
        <Button
          label="Send a new link"
          kind="primary"
          full
          onPress={async () => {
            await api.resendVerification().catch(() => undefined);
            router.replace('/signup/sent');
          }}
        />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="You’re already verified">
      <Button label="Continue" kind="primary" full onPress={() => router.replace(me ? homeFor(me) : '/login')} />
    </AuthShell>
  );
}
