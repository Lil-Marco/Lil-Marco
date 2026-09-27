import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { api } from '../../state/api';
import { useSession } from '../../state/session';
import { homeFor } from '../../state/guards';
import { AuthShell } from '../../features/auth/AuthShell';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { Divider } from '../../ui/Blocks';
import { useToast } from '../../ui/Toast';
import { space } from '../../ui/tokens';

/** A-2 Check your email — a dead end by design; the only way forward is the email. */
export default function CheckEmail() {
  const { me, refreshMe, signOut } = useSession();
  const toast = useToast();
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [resends, setResends] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Verifying in another tab/device advances this one within 5 s.
  useEffect(() => {
    const t = setInterval(() => void refreshMe(), 5000);
    return () => clearInterval(t);
  }, [refreshMe]);

  if (!me) return <Redirect href="/login" />;
  if (me.user.emailVerifiedAt) return <Redirect href={homeFor(me)} />;

  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const resend = async () => {
    setBusy(true);
    try {
      await api.resendVerification();
      setResends((r) => r + 1);
      setCooldownUntil(Date.now() + 60_000);
      toast.show('Verification email sent');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Check your email">
      <Text variant="body">
        We sent a link to <Text variant="section">{me.user.email}</Text>. Open it on this phone to confirm your address — it works for 24 hours.
      </Text>
      {resends >= 3 ? (
        <Text variant="bodySm">
          Still nothing? Check your spam folder, or{' '}
          <Text variant="label" tone="primary" onPress={() => router.push('/app/help')}>
            contact support
          </Text>
          .
        </Text>
      ) : (
        <Button label={cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'} kind="primary" full onPress={resend} disabled={cooldown > 0} loading={busy} />
      )}
      <Pressable
        accessibilityRole="link"
        onPress={async () => {
          const { name, email } = me.user;
          await signOut();
          router.replace({ pathname: '/signup', params: { name, email } });
        }}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text variant="label" tone="primary">
          Use a different email
        </Text>
      </Pressable>
      {api.simulateVerificationLink ? (
        <View style={{ gap: space[3] }}>
          <Divider />
          <Text variant="bodySm">Simulator: there is no real inbox. Tap below to open the link from the email.</Text>
          <Button
            label="Open verification link"
            onPress={async () => {
              await api.simulateVerificationLink!();
              const m = await refreshMe();
              if (m) router.replace(homeFor(m));
            }}
            full
          />
        </View>
      ) : null}
    </AuthShell>
  );
}
