import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../../state/api';
import { useSession } from '../../../state/session';
import { isApiError } from '../../../api/errors';
import { displayPhone, formatPhoneInput, maskPhone, normalisePhone } from '../../../domain/phone';
import { CLIENT_FAILURE_COPY, NO_MONEY_MOVED } from '../../../domain/resultCodes';
import { PRO_PRICE_CENTS } from '../../../domain/plan';
import { formatKes } from '../../../domain/money';
import { Screen } from '../../../ui/Screen';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Amount } from '../../../ui/Amount';
import { Banner, Card } from '../../../ui/Blocks';
import { Text } from '../../../ui/Text';
import { WaitingState } from '../../../ui/WaitingState';
import { useToast } from '../../../ui/Toast';
import { usePaymentPoll } from '../../../features/pay/usePaymentPoll';
import { space } from '../../../ui/tokens';

/**
 * D-11 Upgrade checkout — collected through our own STK Push, so the freelancer
 * experiences P-2 and P-3 from the client's side.
 */
export default function Upgrade() {
  const { returnTo } = useLocalSearchParams<{ plan?: string; returnTo?: string }>();
  const { me, refreshMe } = useSession();
  const toast = useToast();
  const [phone, setPhone] = useState(me?.profile.phone ? displayPhone(me.profile.phone) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<{ id: string; startedAt: number; masked: string } | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const fetcher = useMemo(() => (attempt ? () => api.attemptStatus(attempt.id) : null), [attempt]);
  const status = usePaymentPoll(fetcher, attempt?.startedAt ?? null);
  const onTimeout = useCallback(() => setTimedOut(true), []);

  useEffect(() => {
    if (status?.attemptStatus !== 'SUCCESS') return;
    (async () => {
      await refreshMe();
      if (returnTo) {
        // Back to the invoice M-9 blocked; a draft it saved has already sent itself.
        const d = await api.getInvoice(returnTo).catch(() => null);
        toast.show(d && d.invoice.status !== 'DRAFT' ? `You’re on Pro. ${d.invoice.number} has been sent.` : 'You’re on Pro — unlimited invoices');
        router.replace(d && d.invoice.status === 'DRAFT' ? `/app/invoices/${returnTo}/edit` : `/app/invoices/${returnTo}`);
      } else {
        toast.show('You’re on Pro — unlimited invoices');
        router.replace('/app/settings/billing');
      }
    })();
  }, [status?.attemptStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = async () => {
    const p = normalisePhone(phone);
    if (!p.ok) {
      setError(p.error);
      return;
    }
    setBusy(true);
    setTimedOut(false);
    try {
      const r = await api.startUpgrade('PRO', phone);
      setAttempt({ id: r.attemptId, startedAt: Date.now(), masked: maskPhone(p.value) });
    } catch (e) {
      setError(isApiError(e) ? e.message : 'M-Pesa isn’t responding. Try again in a few minutes.');
    } finally {
      setBusy(false);
    }
  };

  const failed = (status && status.attemptStatus !== 'PENDING' && status.attemptStatus !== 'SUCCESS') || timedOut;

  return (
    <Screen title="Upgrade to Pro" back={!attempt || !!failed}>
      {!attempt ? (
        <>
          <Card style={{ gap: space[2] }}>
            <Text variant="bodySm">You’re paying for</Text>
            <Text variant="section">Pro · unlimited invoices · 1 month</Text>
            <Amount cents={PRO_PRICE_CENTS} size="xl" />
          </Card>
          <Field
            label="M-Pesa number"
            value={phone}
            onChangeText={(t) => {
              setPhone(formatPhoneInput(t));
              setError(null);
            }}
            keyboardType="phone-pad"
            mono
            error={error}
            hint="We’ll send the prompt here"
          />
          <Button label={`Pay ${formatKes(PRO_PRICE_CENTS)} with M-Pesa`} kind="pay" full onPress={pay} loading={busy} disabled={!phone} />
          <View style={{ gap: 2 }}>
            <Text variant="bodySm">1. We’ll send a prompt to your phone.</Text>
            <Text variant="bodySm">2. Enter your M-Pesa PIN.</Text>
            <Text variant="bodySm">3. Keep this page open.</Text>
          </View>
        </>
      ) : failed ? (
        <>
          <Banner title={timedOut && !status?.failureReason ? CLIENT_FAILURE_COPY.TIMEOUT.title : CLIENT_FAILURE_COPY[status?.failureReason ?? 'SYSTEM'].title} body={NO_MONEY_MOVED} />
          <Button
            label="Try again"
            kind="pay"
            full
            onPress={() => {
              setAttempt(null);
              setTimedOut(false);
            }}
          />
        </>
      ) : (
        <Card>
          <WaitingState startedAt={attempt.startedAt} maskedPhone={attempt.masked} onTimeout={onTimeout} confirming={status?.attemptStatus === 'SUCCESS'} onDifferentNumber={() => setAttempt(null)} />
        </Card>
      )}
    </Screen>
  );
}
