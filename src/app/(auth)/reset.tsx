import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../state/api';
import { useSession } from '../../state/session';
import { homeFor } from '../../state/guards';
import { isApiError } from '../../api/errors';
import { AuthShell } from '../../features/auth/AuthShell';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';

/** A-6 Reset password — single-use, 24-hour token. Signs the user in on success. */
export default function Reset() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { setMe } = useSession();
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(!token);
  const [busy, setBusy] = useState(false);

  if (expired) {
    return (
      <AuthShell title="This link has expired">
        <Text variant="body">Reset links work once, for 24 hours.</Text>
        <Button label="Start over" kind="primary" full onPress={() => router.replace('/forgot')} />
      </AuthShell>
    );
  }

  const submit = async () => {
    if (pw !== again) {
      setError('The two passwords don’t match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await api.resetPassword(token!, pw);
      setMe(me);
      router.replace(homeFor(me));
    } catch (e) {
      if (isApiError(e, 'TOKEN_EXPIRED')) setExpired(true);
      else if (isApiError(e, 'VALIDATION')) setError(e.details?.password ?? e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password">
      <Field label="New password" value={pw} onChangeText={setPw} secure autoComplete="new-password" hint="At least 8 characters" />
      <Field label="Type it again" value={again} onChangeText={setAgain} secure autoComplete="new-password" error={error} />
      <Button label="Save and log in" kind="primary" full onPress={submit} disabled={pw.length < 8 || !again} loading={busy} />
    </AuthShell>
  );
}
