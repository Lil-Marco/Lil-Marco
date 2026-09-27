import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../state/api';
import { useSession } from '../../state/session';
import { homeFor, safeNext } from '../../state/guards';
import { isApiError } from '../../api/errors';
import { AuthShell } from '../../features/auth/AuthShell';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { Checkbox, Divider, Row } from '../../ui/Blocks';
import { space } from '../../ui/tokens';

/** A-4 Log in. Never says which of email or password was wrong. */
export default function Login() {
  const params = useLocalSearchParams<{ next?: string; email?: string }>();
  const { setMe } = useSession();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const pwRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const lockLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const locked = lockLeft > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const me = await api.login({ email, password, keepSignedIn: keep });
      setMe(me);
      const next = safeNext(params.next);
      router.replace((me.user.emailVerifiedAt && next) || homeFor(me));
    } catch (e) {
      if (isApiError(e, 'LOCKED')) setLockedUntil(new Date(String(e.meta.unlockAt)).getTime());
      else if (isApiError(e)) setError(e.code === 'INVALID_CREDENTIALS' ? 'Email or password is incorrect' : e.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    if (!api.loadDemoAccount) return;
    setDemoBusy(true);
    try {
      const me = await api.loadDemoAccount();
      setMe(me);
      router.replace('/app');
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to send invoices and see who’s paid.">
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => pwRef.current?.focus()}
        editable={!locked}
      />
      <Field ref={pwRef} label="Password" value={password} onChangeText={setPassword} secure autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => email && password && !locked && submit()} editable={!locked} />
      <Checkbox label="Keep me signed in" hint={keep ? 'For 30 days on this phone' : 'For 12 hours'} checked={keep} onChange={setKeep} />
      {error ? (
        <Text variant="bodySm" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {locked ? (
        <Text variant="bodySm" tone="attention" accessibilityLiveRegion="polite">
          Too many attempts. Try again in {Math.floor(lockLeft / 60)}:{String(lockLeft % 60).padStart(2, '0')}.
        </Text>
      ) : null}
      <Button label="Log in" kind="primary" full onPress={submit} disabled={!email || !password || locked} loading={busy} />
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/forgot', params: { email } })} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="label" tone="primary">
            Forgot password?
          </Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/signup')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="label" tone="primary">
            Create an account
          </Text>
        </Pressable>
      </Row>
      {api.mode === 'mock' ? (
        <View style={{ gap: space[3] }}>
          <Divider />
          <Text variant="bodySm">This build runs on a built-in simulator — no server or Safaricom account needed.</Text>
          <Button label="Explore with sample data" onPress={demo} loading={demoBusy} full />
        </View>
      ) : null}
    </AuthShell>
  );
}
