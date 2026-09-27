import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../state/api';
import { useSession } from '../../state/session';
import { isApiError } from '../../api/errors';
import type { ShortcodeType } from '../../domain/types';
import { displayPhone, formatPhoneInput, maskPhone, normalisePhone } from '../../domain/phone';
import { CLIENT_FAILURE_COPY } from '../../domain/resultCodes';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';
import { Banner, Card, Row } from '../../ui/Blocks';
import { WaitingState } from '../../ui/WaitingState';
import { useToast } from '../../ui/Toast';
import { usePaymentPoll } from '../../features/pay/usePaymentPoll';
import { color, radius, space } from '../../ui/tokens';

const STEPS = ['How you get paid', 'Your shortcode', 'Your Daraja keys', 'Send yourself a test'];

/**
 * A-9 Connect M-Pesa — built to be abandoned. Progress rail, one idea per step,
 * "Finish later" always in reach, and every Continue persists, so returning
 * resumes exactly here.
 */
export default function ConnectMpesa() {
  const params = useLocalSearchParams<{ step?: string; from?: string }>();
  const { me, refreshMe } = useSession();
  const toast = useToast();
  const m = me!.mpesa;
  const fromSettings = params.from === 'settings';
  const [step, setStep] = useState(() => Number(params.step) || Math.min(Math.max(m.wizardStep, 1), 3));
  const [type, setType] = useState<ShortcodeType | null>(m.shortcodeType);
  const [shortcode, setShortcode] = useState(m.shortcode ?? '');
  const [account, setAccount] = useState(m.accountNumber ?? '');
  const [shortcodeError, setShortcodeError] = useState<string | null>(null);
  const [keys, setKeys] = useState({ consumerKey: '', consumerSecret: '', passkey: '' });
  const [keysError, setKeysError] = useState<{ text: string; retryOnly: boolean } | null>(null);
  const [phone, setPhone] = useState(me!.profile.phone ? displayPhone(me!.profile.phone) : '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [noShortcode, setNoShortcode] = useState(false);
  const [help, setHelp] = useState(false);
  const [attempt, setAttempt] = useState<{ id: string; startedAt: number; masked: string } | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const fetcher = useMemo(() => (attempt ? () => api.attemptStatus(attempt.id) : null), [attempt]);
  const status = usePaymentPoll(fetcher, attempt?.startedAt ?? null);

  const finishLater = () => router.replace(fromSettings ? '/app/settings/mpesa' : '/app');

  const saveStep = async (input: Parameters<typeof api.saveMpesaStep>[0], next: number) => {
    setBusy(true);
    try {
      await api.saveMpesaStep({ ...input, wizardStep: next });
      await refreshMe();
      setStep(next);
    } catch (e) {
      if (isApiError(e, 'VALIDATION') && e.details?.shortcode) setShortcodeError(e.details.shortcode);
    } finally {
      setBusy(false);
    }
  };

  const verifyKeys = async (reenter: boolean) => {
    setBusy(true);
    setKeysError(null);
    try {
      if (reenter) await api.saveMpesaStep(keys);
      await api.verifyMpesaKeys();
      await refreshMe();
      setStep(4);
    } catch (e) {
      if (isApiError(e, 'MPESA_UNAVAILABLE')) setKeysError({ text: 'Couldn’t reach Safaricom. Try again', retryOnly: true });
      else if (isApiError(e, 'MPESA_KEYS_REJECTED')) setKeysError({ text: e.message, retryOnly: false });
      else setKeysError({ text: 'Something went wrong saving your keys. Try again.', retryOnly: false });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    const p = normalisePhone(phone);
    if (!p.ok) {
      setPhoneError(p.error);
      return;
    }
    setBusy(true);
    setTimedOut(false);
    try {
      const r = await api.sendTestPayment(phone);
      setAttempt({ id: r.attemptId, startedAt: Date.now(), masked: maskPhone(p.value) });
    } catch (e) {
      setPhoneError(isApiError(e) ? e.message : 'Couldn’t start the test. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onTimeout = useCallback(() => setTimedOut(true), []);
  const succeeded = status?.attemptStatus === 'SUCCESS';
  const failed = (status && status.attemptStatus !== 'PENDING' && !succeeded) || timedOut;

  useEffect(() => {
    if (!succeeded) return;
    void refreshMe().then(() => {
      if (fromSettings) {
        toast.show('M-Pesa is connected and working');
        router.replace('/app/settings/mpesa');
      } else {
        router.replace('/onboarding/done');
      }
    });
  }, [succeeded]); // eslint-disable-line react-hooks/exhaustive-deps

  const keysComplete = (keys.consumerKey && keys.consumerSecret && keys.passkey) || (m.hasConsumerKey && m.hasConsumerSecret && m.hasPasskey && !keys.consumerKey && !keys.consumerSecret && !keys.passkey);

  return (
    <Screen
      title="Connect M-Pesa"
      back={step > 1 && !attempt}
      subtitle={<Text variant="bodySm">{fromSettings ? 'Settings' : 'Step 2 of 2'} · {STEPS[step - 1]}</Text>}
      right={<Button label="Finish later" kind="text" small onPress={finishLater} />}
    >
      <View style={styles.rail} accessibilityLabel={`Step ${step} of 4`}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.railSeg, { backgroundColor: i < step ? color.primary : color.line }]} />
        ))}
      </View>

      {step === 1 ? (
        <View style={{ gap: space[3] }}>
          <Text variant="title">How do your clients pay you on M-Pesa?</Text>
          <Text variant="body">Money goes straight to your own till or paybill. We never hold it.</Text>
          <Choice title="Till number (Buy Goods)" body="Most freelancers and small shops use a till." selected={type === 'TILL'} onPress={() => setType('TILL')} />
          <Choice title="Paybill" body="Uses a business number plus an account number." selected={type === 'PAYBILL'} onPress={() => setType('PAYBILL')} />
          <Choice title="I don’t have one yet" body="We’ll explain how to get one." selected={false} onPress={() => setNoShortcode(true)} />
          <Button label="Continue" kind="primary" full disabled={!type} loading={busy} onPress={() => saveStep({ shortcodeType: type! }, 2)} />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: space[4] }}>
          <Text variant="title">Your {type === 'PAYBILL' ? 'paybill' : 'till'} number</Text>
          <Field
            label={type === 'PAYBILL' ? 'Paybill number' : 'Till number'}
            value={shortcode}
            onChangeText={(t) => {
              setShortcode(t.replace(/\D/g, '').slice(0, 7));
              setShortcodeError(null);
            }}
            onBlur={() => setShortcodeError(shortcode && !/^\d{5,7}$/.test(shortcode) ? 'A till or paybill number is 5 to 7 digits' : null)}
            keyboardType="number-pad"
            mono
            error={shortcodeError}
          />
          {type === 'PAYBILL' ? <Field label="Account number" value={account} onChangeText={setAccount} hint="Leave blank to use the invoice number as the account reference" optional /> : null}
          <Button
            label="Continue"
            kind="primary"
            full
            disabled={!/^\d{5,7}$/.test(shortcode)}
            loading={busy}
            onPress={() => saveStep({ shortcode, accountNumber: type === 'PAYBILL' ? account || null : null }, 3)}
          />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: space[4] }}>
          <Text variant="title">Your Daraja keys</Text>
          <Text variant="body">From the Safaricom developer portal. All three must come from the same Daraja app. We encrypt them and never show them again.</Text>
          <Pressable accessibilityRole="link" onPress={() => setHelp(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="label" tone="primary">
              Where do I find these?
            </Text>
          </Pressable>
          {m.hasConsumerKey && !keys.consumerKey ? <Text variant="bodySm">Keys are saved. Enter new ones only to replace them.</Text> : null}
          <Field label="Consumer key" value={keys.consumerKey} onChangeText={(t) => setKeys({ ...keys, consumerKey: t })} secure autoCapitalize="none" autoCorrect={false} mono />
          <Field label="Consumer secret" value={keys.consumerSecret} onChangeText={(t) => setKeys({ ...keys, consumerSecret: t })} secure autoCapitalize="none" autoCorrect={false} mono />
          <Field label="Passkey" value={keys.passkey} onChangeText={(t) => setKeys({ ...keys, passkey: t })} secure autoCapitalize="none" autoCorrect={false} mono />
          {keysError ? <Banner title={keysError.text} tone="attention" /> : null}
          <Button
            label={keysError?.retryOnly ? 'Try again' : 'Continue'}
            kind="primary"
            full
            disabled={!keysComplete}
            loading={busy}
            onPress={() => verifyKeys(!keysError?.retryOnly && !!keys.consumerKey)}
          />
          {api.mode === 'mock' ? (
            <Text variant="bodySm">Simulator: any keys work. Include “bad” to see a rejection, or “offline” to see Safaricom unreachable.</Text>
          ) : null}
        </View>
      ) : null}

      {step === 4 && !attempt ? (
        <View style={{ gap: space[4] }}>
          <Text variant="title">Send yourself a test</Text>
          <Text variant="body">We’ll send a KES 1 M-Pesa prompt to your phone — exactly what your clients will see. The shilling goes to your own till.</Text>
          <Field
            label="Your M-Pesa number"
            value={phone}
            onChangeText={(t) => {
              setPhone(formatPhoneInput(t));
              setPhoneError(null);
            }}
            keyboardType="phone-pad"
            mono
            error={phoneError}
          />
          <Button label="Send KES 1 to my phone" kind="primary" full disabled={!phone} loading={busy} onPress={sendTest} />
        </View>
      ) : null}

      {step === 4 && attempt && !failed ? (
        <Card>
          <WaitingState startedAt={attempt.startedAt} maskedPhone={attempt.masked} onTimeout={onTimeout} confirming={status?.attemptStatus === 'SUCCESS'} />
        </Card>
      ) : null}

      {step === 4 && attempt && failed ? (
        <View style={{ gap: space[4] }}>
          <Banner
            title={timedOut && !status?.failureReason ? CLIENT_FAILURE_COPY.TIMEOUT.title : CLIENT_FAILURE_COPY[status?.failureReason ?? 'SYSTEM'].title}
            body="No money left your account."
          />
          <Button
            label="Try again"
            kind="primary"
            full
            onPress={() => {
              setAttempt(null);
              setTimedOut(false);
            }}
          />
          <Button
            label="Check my keys"
            full
            onPress={() => {
              setAttempt(null);
              setStep(3);
            }}
          />
        </View>
      ) : null}

      <Sheet visible={noShortcode} onClose={() => setNoShortcode(false)} title="Getting a till number">
        <Text variant="body">To take M-Pesa payments you need a Buy Goods till or a Paybill from Safaricom. Apply at a Safaricom shop or through the M-Pesa for Business portal with your ID and KRA PIN — approval usually takes a few days.</Text>
        <Text variant="body">You can still set up your profile, add clients and draft invoices in the meantime.</Text>
        <Button
          label="Notify me when I can pay by card instead"
          full
          onPress={() => {
            setNoShortcode(false);
            toast.show('We’ll let you know when card payments arrive');
            router.replace('/app');
          }}
        />
        <Button label="Go to dashboard" kind="primary" full onPress={() => router.replace('/app')} />
      </Sheet>

      <Sheet visible={help} onClose={() => setHelp(false)} title="Where to find your keys">
        {[
          'Sign in at developer.safaricom.co.ke with the account linked to your till or paybill.',
          'Open My Apps and create an app with Lipa Na M-Pesa Sandbox ticked, or pick your existing app.',
          'Copy the Consumer Key and Consumer Secret from the app’s Keys tab.',
          'Go live: under Go Live, submit your shortcode and verify with the OTP Safaricom sends to the till owner. Keys from a sandbox-only app won’t work.',
          'After go-live, Safaricom emails the Lipa Na M-Pesa Passkey to the business admin. Paste it here exactly — no trailing spaces.',
        ].map((t, i) => (
          <Row key={i} style={{ alignItems: 'flex-start' }}>
            <Text variant="section" tone="primary" style={{ width: 22 }}>
              {i + 1}.
            </Text>
            <Text variant="body" style={{ flex: 1 }}>
              {t}
            </Text>
          </Row>
        ))}
        <Text variant="bodySm">If Safaricom rotates your passkey, come back to Settings › M-Pesa › Update keys.</Text>
      </Sheet>
    </Screen>
  );
}

function Choice({ title, body, selected, onPress }: { title: string; body: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, { borderColor: selected ? color.primary : color.line, backgroundColor: selected ? color.primaryTint : color.paper, borderWidth: selected ? 2 : 1 }]}
    >
      <Text variant="section">{title}</Text>
      <Text variant="bodySm">{body}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', gap: space[1] },
  railSeg: { flex: 1, height: 4, borderRadius: radius.full },
  choice: { borderRadius: radius.lg, padding: space[4], gap: 2, minHeight: 72 },
});
