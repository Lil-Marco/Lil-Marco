import { useState } from 'react';
import { Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../state/api';
import { AuthShell } from '../../features/auth/AuthShell';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';

/** A-5 — always shows the same confirmation whether or not the account exists. */
export default function Forgot() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.forgotPassword(email.trim().toLowerCase());
    } catch {
      // Same confirmation regardless — never reveal whether the account exists.
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle={sent ? undefined : 'We’ll email you a link to choose a new one.'}>
      {sent ? (
        <Text variant="body" accessibilityLiveRegion="polite">
          If an account exists for <Text variant="section">{email.trim().toLowerCase()}</Text>, a reset link is on its way. It works for 24 hours.
        </Text>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Button label="Send reset link" kind="primary" full onPress={submit} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} loading={busy} />
        </>
      )}
      {sent && api.lastResetToken?.() ? (
        <Button label="Open reset link (simulator)" full onPress={() => router.replace({ pathname: '/reset', params: { token: api.lastResetToken!()! } })} />
      ) : null}
      <Pressable accessibilityRole="link" onPress={() => router.replace('/login')} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="label" tone="primary">
          Back to log in
        </Text>
      </Pressable>
    </AuthShell>
  );
}
