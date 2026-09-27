import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../state/api';
import { useSession } from '../../state/session';
import { isApiError } from '../../api/errors';
import { AuthShell } from '../../features/auth/AuthShell';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { Row } from '../../ui/Blocks';
import { color, radius, space } from '../../ui/tokens';

function strength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (pw.length < 8) return { score: 0, label: 'At least 8 characters' };
  let s = 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 14) s = Math.min(3, s + 1);
  return { score: s as 1 | 2 | 3, label: ['', 'Okay', 'Good', 'Strong'][s] };
}

/** A-1 Sign up — the least that lets us create an account and email them. */
export default function SignUp() {
  const params = useLocalSearchParams<{ email?: string; name?: string }>();
  const { refreshMe } = useSession();
  const [name, setName] = useState(params.name ?? '');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const refs = { name: useRef<TextInput>(null), email: useRef<TextInput>(null), password: useRef<TextInput>(null) };

  const valid = name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= 8;
  const st = strength(password);

  const submit = async () => {
    setBusy(true);
    setTaken(false);
    try {
      await api.signup({ name, email, password });
      await refreshMe();
      router.replace('/signup/sent');
    } catch (e) {
      if (isApiError(e, 'EMAIL_TAKEN')) {
        setTaken(true);
        setPassword('');
      } else if (isApiError(e, 'VALIDATION') && e.details) {
        setErrors(e.details);
        const first = (['name', 'email', 'password'] as const).find((k) => e.details![k]);
        if (first) refs[first].current?.focus();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Send an invoice. Get paid." subtitle="Create your account — it takes a minute.">
      <Field ref={refs.name} label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={errors.name} returnKeyType="next" onSubmitEditing={() => refs.email.current?.focus()} />
      <Field
        ref={refs.email}
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setTaken(false);
        }}
        onBlur={() => setEmail((e) => e.trim().toLowerCase())}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        error={errors.email}
        returnKeyType="next"
        onSubmitEditing={() => refs.password.current?.focus()}
      />
      {taken ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <Text variant="bodySm" tone="danger">
            That email is already registered.
          </Text>
          <Pressable accessibilityRole="link" onPress={() => router.replace({ pathname: '/login', params: { email } })} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="label" tone="primary">
              Log in instead
            </Text>
          </Pressable>
        </Row>
      ) : null}
      <View style={{ gap: space[2] }}>
        <Field ref={refs.password} label="Password" value={password} onChangeText={setPassword} secure autoComplete="new-password" textContentType="newPassword" error={errors.password} returnKeyType="go" onSubmitEditing={() => valid && submit()} />
        <View style={{ flexDirection: 'row', gap: space[1] }} accessibilityLabel={`Password strength: ${st.label}`}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: radius.full, backgroundColor: st.score >= i ? color.primary : color.line }} />
          ))}
        </View>
        <Text variant="bodySm">{st.label}</Text>
      </View>
      <Button label="Create account" kind="primary" full onPress={submit} disabled={!valid} loading={busy} />
      <Row style={{ justifyContent: 'center' }}>
        <Text variant="bodySm">Already have an account?</Text>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/login')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="label" tone="primary">
            Log in
          </Text>
        </Pressable>
      </Row>
      <Text variant="bodySm" align="center">
        By creating an account you agree to the Terms and Privacy Policy.
      </Text>
    </AuthShell>
  );
}
