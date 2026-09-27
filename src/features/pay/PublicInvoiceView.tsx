import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api } from '../../state/api';
import { useOnline } from '../../state/net';
import { isApiError } from '../../api/errors';
import type { FailureReason, PaymentStatus, PublicInvoice } from '../../domain/types';
import { daysBetween, formatDate, formatDateTime, todayEat } from '../../domain/dates';
import { formatKes } from '../../domain/money';
import { formatPhoneInput, maskPhone, normalisePhone } from '../../domain/phone';
import { CLIENT_FAILURE_COPY, NO_MONEY_MOVED } from '../../domain/resultCodes';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Amount } from '../../ui/Amount';
import { Field } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';
import { Card, Divider, ReceiptBlock } from '../../ui/Blocks';
import { Icon } from '../../ui/Icon';
import { OfflineStrip } from '../../ui/Screen';
import { WaitingState } from '../../ui/WaitingState';
import { useToast } from '../../ui/Toast';
import { SenderHeader } from '../invoice/SenderHeader';
import { InvoiceBody } from '../invoice/InvoiceDocument';
import { newIdempotencyKey, usePaymentPoll } from './usePaymentPoll';
import { sharePdf } from '../invoice/pdf';
import { color, duration, elevation, radius, space } from '../../ui/tokens';

type Stage =
  | { kind: 'view' }
  | { kind: 'phone'; prefill: string }
  | { kind: 'waiting'; startedAt: number; masked: string }
  | { kind: 'failed'; reason: FailureReason; failures: number }
  | { kind: 'paid'; justNow: boolean };

/**
 * P-1 … P-6. Above the fold on a 360 px screen, in this order and nothing
 * else: sender, amount, due date, and the green pay button (sticky). The
 * screen states map one-to-one onto the payment state machine.
 *
 * `preview` renders the same thing inert for D-4.
 */
export function PublicInvoiceView({ inv: initial, token, preview, onReload }: { inv: PublicInvoice; token?: string; preview?: boolean; onReload?: () => Promise<PublicInvoice | null> }) {
  const online = useOnline();
  const toast = useToast();
  const [inv, setInv] = useState(initial);
  const [stage, setStage] = useState<Stage>(() => (initial.status === 'PAID' ? { kind: 'paid', justNow: false } : { kind: 'view' }));
  const [inFlight, setInFlight] = useState(initial.inFlight);
  const [phone, setPhone] = useState(initial.payment.suggestedPhone ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [failures, setFailures] = useState(0);
  const idemKey = useRef(newIdempotencyKey());

  useEffect(() => setInv(initial), [initial]);

  useEffect(() => {
    if (!rateLimitedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [rateLimitedUntil]);

  const waitingStartedAt = stage.kind === 'waiting' ? stage.startedAt : null;
  const fetcher = useMemo(() => (token && waitingStartedAt ? () => api.paymentStatus(token) : null), [token, waitingStartedAt]);
  const status = usePaymentPoll(fetcher, waitingStartedAt);

  const settle = useCallback(
    async (s: PaymentStatus) => {
      if (s.attemptStatus === 'SUCCESS') {
        const fresh = await onReload?.();
        if (fresh) setInv(fresh);
        setInFlight(null);
        setStage({ kind: 'paid', justNow: true });
      } else if (s.attemptStatus !== 'PENDING') {
        setInFlight(null);
        setFailures(s.consecutiveFailures);
        setStage({ kind: 'failed', reason: s.failureReason ?? 'SYSTEM', failures: s.consecutiveFailures });
        idemKey.current = newIdempotencyKey();
      }
    },
    [onReload],
  );

  useEffect(() => {
    if (status && stage.kind === 'waiting') void settle(status);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTimeout = useCallback(() => {
    setStage((s) => (s.kind === 'waiting' ? { kind: 'failed', reason: 'TIMEOUT', failures: failures + 1 } : s));
    idemKey.current = newIdempotencyKey();
  }, [failures]);

  const isPaid = inv.status === 'PAID';
  const overdueDays = !isPaid ? daysBetween(inv.dueDate, todayEat()) : 0;
  const payable = inv.payment.mpesaEnabled && !isPaid && inv.status !== 'VOID';
  const rateLeft = Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));

  const openPay = (prefill?: string) => {
    if (preview) {
      toast.show('This is a preview — your client’s button starts the payment', { kind: 'info' });
      return;
    }
    if (prefill !== undefined) setPhone(prefill);
    setPhoneError(null);
    setUnavailable(false);
    setStage({ kind: 'phone', prefill: prefill ?? phone });
  };

  const submit = async () => {
    if (submitting || !token) return; // a second press is swallowed while in flight
    const p = normalisePhone(phone);
    if (!p.ok) {
      setPhoneError(p.error);
      return;
    }
    setSubmitting(true);
    setUnavailable(false);
    try {
      await api.pay(token, phone, idemKey.current);
      setStage({ kind: 'waiting', startedAt: Date.now(), masked: maskPhone(p.value) });
      setInFlight({ maskedPhone: maskPhone(p.value), initiatedAt: new Date().toISOString() });
    } catch (e) {
      if (isApiError(e, 'INVOICE_ALREADY_PAID')) {
        const fresh = await onReload?.();
        if (fresh) setInv(fresh);
        setStage({ kind: 'paid', justNow: false });
      } else if (isApiError(e, 'RATE_LIMITED')) {
        setRateLimitedUntil(Date.now() + Number(e.meta.retryAfterSec ?? 60) * 1000);
        setNow(Date.now());
      } else if (isApiError(e, 'INVALID_PHONE_NUMBER')) {
        setPhoneError(e.message);
      } else {
        setUnavailable(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const contact = () => {
    if (inv.business.email) void Linking.openURL(`mailto:${inv.business.email}?subject=${encodeURIComponent(`Invoice ${inv.number}`)}`);
    else if (inv.business.phone) void Linking.openURL(`tel:${inv.business.phone.replace(/\s/g, '')}`);
  };

  if (stage.kind === 'paid' && inv.paid) {
    return <PaidView inv={inv} justNow={stage.justNow} token={token} />;
  }

  const payLabel = `Pay ${formatKes(inv.amountDueCents)} with M-Pesa`;

  const body = (
    <View style={{ gap: space[5] }}>
      <SenderHeader name={inv.business.name} logoUri={inv.business.logoUri} sub={`Invoice ${inv.number}`} />
      <View style={{ gap: space[1] }}>
        <Text variant="micro">Amount due</Text>
        <Amount cents={inv.amountDueCents} size="xl" />
        <Text variant="body" tone="ink">
          Due {formatDate(inv.dueDate)}
        </Text>
        {overdueDays > 0 ? (
          <Text variant="bodySm" tone="attention">
            This was due {overdueDays} day{overdueDays === 1 ? '' : 's'} ago
          </Text>
        ) : null}
      </View>

      {!inv.payment.mpesaEnabled && !isPaid ? (
        <Card style={{ gap: space[2] }}>
          <Text variant="section">Payment is temporarily unavailable</Text>
          <Text variant="bodySm">Contact {inv.business.name} to pay this invoice.</Text>
          {inv.business.phone ? <Text variant="monoSm" selectable>{inv.business.phone}</Text> : null}
          {inv.business.email ? <Text variant="bodySm" selectable>{inv.business.email}</Text> : null}
        </Card>
      ) : null}

      {inFlight && stage.kind === 'view' ? (
        <Card style={{ gap: space[2] }}>
          <Text variant="section">A payment is in progress</Text>
          <Text variant="bodySm">A prompt was sent to {inFlight.maskedPhone}. If you’ve entered your PIN, the invoice will update here.</Text>
          <Button label="Back to the payment" onPress={() => setStage({ kind: 'waiting', startedAt: new Date(inFlight.initiatedAt).getTime(), masked: inFlight.maskedPhone })} />
        </Card>
      ) : null}

      <Divider />
      <InvoiceBody inv={inv} />

      <View style={{ gap: space[1] }}>
        <Button label="Download PDF" kind="text" icon="download" onPress={() => void sharePdf(inv).catch(() => toast.show('The PDF didn’t generate. Try again', { kind: 'error' }))} style={{ alignSelf: 'flex-start' }} />
        {inv.business.email || inv.business.phone ? (
          <Button label={`Questions? Contact ${inv.business.name}`} kind="text" onPress={contact} style={{ alignSelf: 'flex-start' }} />
        ) : null}
      </View>
    </View>
  );

  const payButton = payable ? (
    <Button
      label={payLabel}
      kind="pay"
      full
      onPress={() => (inFlight ? setStage({ kind: 'waiting', startedAt: new Date(inFlight.initiatedAt).getTime(), masked: inFlight.maskedPhone }) : openPay())}
      disabled={!online && !preview}
      accessibilityHint="Sends an M-Pesa prompt to your phone"
    />
  ) : null;

  if (preview) {
    return (
      <View style={styles.previewFrame}>
        {body}
        {payButton}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <OfflineStrip publicPage />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.col}>{body}</View>
      </ScrollView>
      {payButton ? <View style={styles.sticky}>{payButton}</View> : null}

      {/* P-2 Pay panel */}
      <Sheet
        visible={stage.kind === 'phone'}
        onClose={() => setStage({ kind: 'view' })}
        title="Pay with M-Pesa"
        footer={
          <>
            <Button
              label={rateLeft > 0 ? `Wait ${rateLeft}s` : unavailable ? 'M-Pesa isn’t responding' : 'Send payment request'}
              kind="pay"
              full
              onPress={submit}
              loading={submitting}
              disabled={!normalisePhone(phone).ok || rateLeft > 0 || !online}
            />
            <View style={{ gap: 2, paddingTop: space[1] }}>
              <Text variant="bodySm">1. We’ll send a prompt to your phone.</Text>
              <Text variant="bodySm">2. Enter your M-Pesa PIN.</Text>
              <Text variant="bodySm">3. Keep this page open.</Text>
            </View>
          </>
        }
      >
        <View style={{ gap: space[1] }}>
          <Text variant="bodySm">You’re paying</Text>
          <Amount cents={inv.amountDueCents} size="lg" />
          <Text variant="bodySm">
            to {inv.business.name} · {inv.number}
          </Text>
        </View>
        <Field
          label="M-Pesa number"
          value={phone}
          onChangeText={(t) => {
            setPhone(formatPhoneInput(t));
            setPhoneError(null);
          }}
          onBlur={() => setPhoneError(phone && !normalisePhone(phone).ok ? 'Enter a phone number starting 07 or 01' : null)}
          keyboardType="phone-pad"
          mono
          placeholder="0712 345 678"
          error={phoneError}
          hint="We’ll send the prompt here"
          autoFocus={!phone}
        />
        {rateLeft > 0 ? (
          <Text variant="bodySm" tone="attention" accessibilityLiveRegion="polite">
            Too many attempts. Wait a minute and try again.
          </Text>
        ) : null}
        {unavailable ? (
          <Text variant="bodySm" tone="attention" accessibilityLiveRegion="polite">
            M-Pesa isn’t responding. Try again in a few minutes — nothing was charged.
          </Text>
        ) : null}
      </Sheet>

      {/* P-3 Waiting — no cancel; back returns to P-1 which offers a way back in */}
      <Sheet visible={stage.kind === 'waiting'} onClose={() => setStage({ kind: 'view' })} showClose={false}>
        {stage.kind === 'waiting' ? (
          <View accessibilityLiveRegion="polite">
            <WaitingState
              startedAt={stage.startedAt}
              maskedPhone={stage.masked}
              onTimeout={onTimeout}
              confirming={status?.attemptStatus === 'SUCCESS'}
              onDifferentNumber={() => openPay('')}
            />
          </View>
        ) : null}
      </Sheet>

      {/* P-5 Payment failed — amber, never red; always says no money moved */}
      <Sheet visible={stage.kind === 'failed'} onClose={() => setStage({ kind: 'view' })}>
        {stage.kind === 'failed' ? (
          <View style={{ gap: space[4] }} accessibilityLiveRegion="polite">
            <View style={styles.failIcon}>
              <Icon name="alert" size={26} color={color.attention} />
            </View>
            <Text variant="title">{CLIENT_FAILURE_COPY[stage.reason].title}</Text>
            <Text variant="body" tone="ink">
              {NO_MONEY_MOVED}
            </Text>
            <Text variant="body">
              {stage.reason === 'INSUFFICIENT_FUNDS' ? 'You can top up and try again, or use a different number.' : 'You can try again with the same number or a different one.'}
            </Text>
            {CLIENT_FAILURE_COPY[stage.reason].primary === 'different' ? (
              <>
                <Button label="Use a different number" kind="pay" full onPress={() => openPay('')} />
                <Button label="Try again" full onPress={() => openPay()} />
              </>
            ) : (
              <>
                <Button label="Try again" kind="pay" full onPress={() => openPay()} />
                <Button label="Use a different number" full onPress={() => openPay('')} />
              </>
            )}
            {stage.failures >= 3 ? (
              <Card style={{ gap: space[1] }}>
                <Text variant="section">Still stuck? Contact {inv.business.name}</Text>
                {inv.business.phone ? <Text variant="monoSm" selectable>{inv.business.phone}</Text> : null}
                {inv.business.email ? <Text variant="bodySm" selectable>{inv.business.email}</Text> : null}
              </Card>
            ) : inv.business.email || inv.business.phone ? (
              <Button label={`Questions? Contact ${inv.business.name}`} kind="text" onPress={contact} />
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

/** P-4 Paid / P-6 Already paid. The receipt code is the second-largest thing on screen. */
function PaidView({ inv, justNow, token }: { inv: PublicInvoice; justNow: boolean; token?: string }) {
  const toast = useToast();
  const scale = useRef(new Animated.Value(justNow ? 0.85 : 1)).current;
  const opacity = useRef(new Animated.Value(justNow ? 0 : 1)).current;
  const [email, setEmail] = useState('');
  const [askEmail, setAskEmail] = useState(false);
  const paid = inv.paid!;

  useEffect(() => {
    if (!justNow) return;
    AccessibilityInfo.announceForAccessibility(`Payment received. ${formatKes(paid.amountCents)} paid.`);
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) {
        scale.setValue(1);
        opacity.setValue(1);
        return;
      }
      // The only celebratory moment in the product: 320 ms, nothing else moves.
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: duration.slow, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: duration.slow, useNativeDriver: true }),
      ]).start();
    });
  }, [justNow]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.col, { gap: space[5] }]}>
          <SenderHeader name={inv.business.name} logoUri={inv.business.logoUri} sub={`Invoice ${inv.number}`} />
          <Animated.View style={{ alignItems: 'center', gap: space[3], opacity, transform: [{ scale }] }} accessibilityLiveRegion="polite">
            <View style={styles.check}>
              <Icon name="check" size={32} color={color.onPay} />
            </View>
            <Text variant="title" align="center">
              {justNow ? 'Payment received' : 'This invoice is already paid'}
            </Text>
            <Amount cents={paid.amountCents} size="xl" tone="payHover" />
            <Text variant="section" tone="payHover">
              paid
            </Text>
          </Animated.View>
          {paid.mpesaReceiptNumber ? (
            <ReceiptBlock code={paid.mpesaReceiptNumber} amountLine={`${formatKes(paid.amountCents)}${paid.payerPhone ? ` from ${paid.payerPhone}` : ''}`} when={formatDateTime(paid.paidAt)} />
          ) : (
            <Card>
              <Text variant="bodySm">{inv.business.name} recorded this payment on {formatDateTime(paid.paidAt)}.</Text>
            </Card>
          )}
          <Button label="Download receipt" kind="primary" full onPress={() => void sharePdf(inv, 'receipt').catch(() => toast.show('The PDF didn’t generate. Try again', { kind: 'error' }))} />
          {askEmail ? (
            <View style={{ gap: space[2] }}>
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <Button
                label="Send receipt"
                full
                disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
                onPress={() => {
                  setAskEmail(false);
                  toast.show(`Receipt sent to ${email.trim()}`);
                }}
              />
            </View>
          ) : (
            <Button label="Email me a receipt" full onPress={() => setAskEmail(true)} />
          )}
          {token ? (
            <Pressable accessibilityRole="link" onPress={() => router.push(`/i/${token}/receipt`)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'center' }}>
              <Text variant="label" tone="primary">
                View receipt page
              </Text>
            </Pressable>
          ) : null}
          <Text variant="bodySm" align="center">
            The money went straight to {inv.business.name}’s M-Pesa account.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.paper },
  scroll: { flexGrow: 1, paddingBottom: 120 },
  col: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: space[4], paddingTop: space[5], gap: space[5] },
  sticky: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[4], backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.line, ...elevation[2] },
  previewFrame: { backgroundColor: color.paper, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space[4], gap: space[5], maxWidth: 400, alignSelf: 'center', width: '100%' },
  failIcon: { width: 52, height: 52, borderRadius: radius.full, backgroundColor: color.attentionTint, alignItems: 'center', justifyContent: 'center' },
  check: { width: 64, height: 64, borderRadius: radius.full, backgroundColor: color.pay, alignItems: 'center', justifyContent: 'center' },
});
