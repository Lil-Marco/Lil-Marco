import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../state/api';
import { useSession } from '../../state/session';
import { isApiError } from '../../api/errors';
import { errorMessage } from '../../state/useResource';
import type { Client, Invoice } from '../../domain/types';
import { formatKes } from '../../domain/money';
import { formatDate, nextPeriodStartLabel } from '../../domain/dates';
import { FREE_MONTHLY_LIMIT, PRO_PRICE_CENTS } from '../../domain/plan';
import { formatKesShort } from '../../domain/money';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Text } from '../../ui/Text';
import { Checkbox, Row } from '../../ui/Blocks';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { color, space } from '../../ui/tokens';

export type SendStage = null | 'confirm' | 'connect' | 'limit';

/**
 * M-2 Confirm send, the "connect M-Pesa to send" block, and M-9 plan limit.
 * Sending is blocked at the last possible moment, never by locking the composer.
 */
export function SendFlow({
  stage,
  setStage,
  invoice,
  client,
  onEditClient,
  onValidation,
  beforeSend,
}: {
  stage: SendStage;
  setStage: (s: SendStage) => void;
  invoice: Invoice | null;
  client: Client | null;
  onEditClient: () => void;
  onValidation?: (details: Record<string, string>) => void;
  /** Flush unsaved composer edits before sending. Returns the invoice id to send. */
  beforeSend?: () => Promise<string | null>;
}) {
  const { me, refreshMe } = useSession();
  const toast = useToast();
  const [copy, setCopy] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const resend = invoice && invoice.status !== 'DRAFT';

  useEffect(() => {
    if (stage === 'confirm' && invoice) {
      setMessage(
        resend
          ? `Hi ${client?.name ?? ''}, I’ve updated invoice ${invoice.number}. The link below has the latest version.`
          : `Hi ${client?.name ?? ''}, here’s invoice ${invoice.number} for ${formatKes(invoice.totalCents)}, due ${formatDate(invoice.dueDate)}. You can pay by M-Pesa straight from the link.\n\nThank you,\n${me?.profile.businessName ?? ''}`,
      );
    }
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setBusy(true);
    try {
      const id = (await beforeSend?.()) ?? invoice?.id;
      if (!id) return;
      await api.sendInvoice(id, { message, sendCopy: copy });
      await refreshMe();
      setStage(null);
      toast.show(resend ? 'Changes sent to the client' : 'Invoice sent');
      router.replace(`/app/invoices/${id}`);
    } catch (e) {
      if (isApiError(e, 'MPESA_NOT_CONNECTED')) setStage('connect');
      else if (isApiError(e, 'PLAN_LIMIT_REACHED')) setStage('limit');
      else if (isApiError(e, 'VALIDATION') && e.details) {
        setStage(null);
        onValidation?.(e.details);
      } else toast.show(errorMessage(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const saveQueued = async () => {
    setBusy(true);
    try {
      const id = (await beforeSend?.()) ?? invoice?.id;
      if (id) await api.queueForSend(id);
      setStage(null);
      toast.show('Draft saved — it will send itself when your plan allows');
      router.replace('/app/invoices');
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    await beforeSend?.();
    setStage(null);
    toast.show('Draft saved');
    router.replace('/app/invoices');
  };

  const firstTimer = (me?.profile.invoicesSentEver ?? 0) < 3;

  return (
    <>
      <Sheet
        visible={stage === 'confirm'}
        onClose={() => setStage(null)}
        title={resend ? 'Send the changes?' : `Send ${invoice?.number ?? 'invoice'}?`}
        footer={
          <>
            <Button label={resend ? 'Save and resend' : 'Send invoice'} kind="primary" full onPress={send} loading={busy} />
            <Button label="Cancel" kind="text" full onPress={() => setStage(null)} />
          </>
        }
      >
        <View style={{ gap: space[1] }}>
          <Text variant="label">To</Text>
          <Row>
            <Text variant="body" tone="ink" style={{ flex: 1 }} selectable>
              {client?.email ?? 'No email yet'}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit client email" onPress={onEditClient} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="edit" color={color.primary} />
            </Pressable>
          </Row>
        </View>
        <Checkbox label="Send me a copy" checked={copy} onChange={setCopy} />
        <Field label="Message" value={message} onChangeText={setMessage} multiline />
        {firstTimer && !resend ? (
          <Text variant="bodySm">Your client pays by tapping Pay with M-Pesa on the invoice — they’ll get an M-Pesa prompt on their phone.</Text>
        ) : null}
      </Sheet>

      <Sheet
        visible={stage === 'connect'}
        onClose={() => setStage(null)}
        title="Connect M-Pesa to send this invoice"
        footer={
          <>
            <Button
              label="Connect M-Pesa"
              kind="primary"
              full
              onPress={() => {
                setStage(null);
                router.push('/onboarding/mpesa');
              }}
            />
            <Button label="Save as draft" full onPress={saveDraft} />
          </>
        }
      >
        <Text variant="body">Your client needs a way to pay. Connecting takes a few minutes if you have your Daraja keys to hand — your draft is saved either way.</Text>
      </Sheet>

      <Sheet
        visible={stage === 'limit'}
        onClose={() => setStage(null)}
        title="Plan limit reached"
        footer={
          <>
            <Button
              label="Upgrade to Pro"
              kind="primary"
              full
              onPress={async () => {
                const id = (await beforeSend?.()) ?? invoice?.id;
                setStage(null);
                router.push({ pathname: '/app/settings/upgrade', params: { plan: 'PRO', returnTo: id ?? '' } });
              }}
            />
            <Button label="Save as draft" full onPress={saveQueued} loading={busy} />
            <Text variant="bodySm" align="center">
              Your invoices reset on {nextPeriodStartLabel()}.
            </Text>
          </>
        }
      >
        <Text variant="body">
          You’ve sent {FREE_MONTHLY_LIMIT} invoices this month. Upgrade to Pro for unlimited invoices — {formatKesShort(PRO_PRICE_CENTS)} a month.
        </Text>
        <Text variant="bodySm">Save as draft and it sends itself the moment your plan allows.</Text>
      </Sheet>
    </>
  );
}
