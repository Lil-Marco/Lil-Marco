import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { api } from '../../../../state/api';
import { useSession } from '../../../../state/session';
import { errorMessage, useResource } from '../../../../state/useResource';
import { formatDate, formatDateTime, relativeTime } from '../../../../domain/dates';
import { formatKes } from '../../../../domain/money';
import { displayPhone, maskPhone } from '../../../../domain/phone';
import { canRemindNow } from '../../../../domain/invoiceRules';
import { Screen, ActionMenu } from '../../../../ui/Screen';
import { Text } from '../../../../ui/Text';
import { Button } from '../../../../ui/Button';
import { Amount } from '../../../../ui/Amount';
import { StatusChip } from '../../../../ui/StatusChip';
import { Banner, Card, EmptyState, ErrorState, ReceiptBlock, Row, SectionTitle, Skeleton } from '../../../../ui/Blocks';
import { Field } from '../../../../ui/Field';
import { Sheet } from '../../../../ui/Sheet';
import { Icon } from '../../../../ui/Icon';
import { useToast } from '../../../../ui/Toast';
import { useInvoiceActions } from '../../../../features/invoice/useInvoiceActions';
import { SendFlow, type SendStage } from '../../../../features/invoice/SendFlow';
import { ClientSheet } from '../../../../features/clients/ClientSheet';
import { InvoiceBody } from '../../../../features/invoice/InvoiceDocument';
import { docFromDetail } from '../../../../features/invoice/doc';
import { sharePdf } from '../../../../features/invoice/pdf';
import { color, radius, space } from '../../../../ui/tokens';

/** D-5 Invoice detail — the destination after every send. */
export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const toast = useToast();
  const detail = useResource(() => api.getInvoice(id), [id]);
  const actions = useInvoiceActions(() => void detail.refetch());
  const [menu, setMenu] = useState(false);
  const [sendStage, setSendStage] = useState<SendStage>(null);
  const [clientSheet, setClientSheet] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [resolve, setResolve] = useState(false);
  const [resolveNote, setResolveNote] = useState('');

  if (detail.loading) {
    return (
      <Screen title="Invoice">
        <Skeleton rows={4} height={88} />
      </Screen>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <Screen title="Invoice">
        {(detail.error as { code?: string })?.code === 'NOT_FOUND' ? (
          <EmptyState text="This invoice doesn’t exist." action="Back to invoices" onAction={() => router.replace('/app/invoices')} />
        ) : (
          <ErrorState message="This invoice didn’t load." onRetry={detail.refetch} />
        )}
      </Screen>
    );
  }

  const d = detail.data;
  const inv = d.invoice;
  const doc = docFromDetail(d, me!.profile);
  const link = api.publicLink(inv);
  const shareable = inv.status !== 'DRAFT' && inv.status !== 'VOID';
  const unpaidSent = ['SENT', 'VIEWED', 'OVERDUE'].includes(inv.status);
  const payment = d.payments[d.payments.length - 1];
  const receipt = payment ? d.receipts.find((r) => r.paymentId === payment.id) : undefined;
  const remindable = canRemindNow(inv);

  const pdf = async (kind: 'invoice' | 'receipt') => {
    setPdfBusy(true);
    try {
      await sharePdf(doc, kind, kind === 'receipt' ? receipt?.number : undefined);
    } catch {
      toast.show('The PDF didn’t generate. Try again', { kind: 'error', action: { label: 'Try again', onPress: () => void pdf(kind) } });
    } finally {
      setPdfBusy(false);
    }
  };

  const remind = async () => {
    setReminding(true);
    try {
      await api.remind(inv.id);
      toast.show('Reminder sent');
      void detail.refetch();
    } catch (e) {
      toast.show(errorMessage(e), { kind: 'error' });
    } finally {
      setReminding(false);
    }
  };

  const whatsapp = () => {
    const text = `Hi ${d.client?.name ?? ''}, here’s invoice ${inv.number} for ${formatKes(inv.totalCents)} from ${me!.profile.businessName}. You can pay by M-Pesa here: ${link}`;
    const phone = d.client?.phone ? `/${d.client.phone}` : '';
    void Linking.openURL(`https://wa.me${phone}?text=${encodeURIComponent(text)}`);
  };

  // State-dependent primary action — exactly one filled button.
  let primary: React.ReactNode = null;
  if (inv.status === 'DRAFT') primary = <Button label="Send invoice" kind="primary" full onPress={() => setSendStage('confirm')} />;
  else if (unpaidSent)
    primary = (
      <View style={{ gap: space[1] }}>
        <Button label="Send reminder" kind="primary" full onPress={remind} loading={reminding} disabled={!remindable || !!d.pendingAttempt} />
        {inv.lastReminderAt ? (
          <Text variant="bodySm" align="center">
            Reminded {relativeTime(inv.lastReminderAt)}
          </Text>
        ) : null}
      </View>
    );
  else if (inv.status === 'PAID') primary = <Button label="Download receipt" kind="primary" full onPress={() => pdf('receipt')} loading={pdfBusy} />;
  else if (inv.status === 'VOID') primary = <Button label="Duplicate" kind="primary" full onPress={() => actions.perform(inv, 'duplicate')} />;

  return (
    <Screen
      title={inv.number}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel="More actions" onPress={() => setMenu(true)} style={styles.iconBtn}>
          <Icon name="kebab" color={color.ink} />
        </Pressable>
      }
      onRefresh={detail.refetch}
      refreshing={detail.refreshing}
      footer={primary}
    >
      {d.banner ? (
        <Banner
          title={d.banner.kind === 'double_payment' ? 'This invoice was paid twice.' : d.banner.kind === 'voided_invoice_paid' ? 'Payment received on a voided invoice.' : d.banner.kind === 'bounced' ? 'The invoice couldn’t be delivered.' : 'Part-payment received.'}
          body={d.banner.text}
          action="Mark as resolved"
          onAction={() => setResolve(true)}
        />
      ) : null}
      {inv.status === 'VOID' ? <Banner title="This invoice is void." body="The link no longer works. Duplicate it to bill again." tone="primary" /> : null}
      {d.pendingAttempt ? (
        <Banner title="A payment is in progress." body={`Prompt sent to ${maskPhone(d.pendingAttempt.payerPhone)} ${relativeTime(d.pendingAttempt.initiatedAt)}. This updates by itself.`} tone="primary" />
      ) : null}

      <Card style={{ gap: space[3] }}>
        <StatusChip status={inv.status} />
        <Amount cents={inv.totalCents} size="xl" strike={inv.status === 'VOID'} />
        <Pressable accessibilityRole="link" onPress={() => d.client && router.push(`/app/clients/${d.client.id}`)} style={{ minHeight: 32, justifyContent: 'center' }}>
          <Text variant="section" tone="primary">
            {d.client?.name ?? 'No client'}
          </Text>
        </Pressable>
        <Text variant="bodySm" tone={inv.status === 'OVERDUE' ? 'attention' : 'ink2'}>
          Issued {formatDate(inv.issueDate)} · Due {formatDate(inv.dueDate)}
        </Text>
      </Card>

      {shareable ? (
        <Card style={{ gap: space[3] }}>
          <SectionTitle>Share</SectionTitle>
          <Text variant="monoSm" selectable numberOfLines={1}>
            {link}
          </Text>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button
              label="Copy link"
              icon="copy"
              small
              onPress={async () => {
                await Clipboard.setStringAsync(link);
                toast.show('Link copied');
              }}
            />
            <Button label="Share on WhatsApp" icon="whatsapp" small onPress={whatsapp} />
            <Button label="Download PDF" icon="download" small onPress={() => pdf('invoice')} loading={pdfBusy} />
          </Row>
          <Button label="Open what your client sees" kind="text" small onPress={() => router.push(`/i/${inv.publicToken}`)} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      {d.payments.length > 0 ? (
        <View style={{ gap: space[2] }}>
          <SectionTitle>Payment</SectionTitle>
          {d.payments.map((p) =>
            p.mpesaReceiptNumber ? (
              <View key={p.id} style={{ gap: space[1] }}>
                <ReceiptBlock code={p.mpesaReceiptNumber} amountLine={`${formatKes(p.amountCents)}${p.payerPhone ? ` from ${displayPhone(p.payerPhone)}` : ''}`} when={formatDateTime(p.paidAt)} />
                {p.source === 'RECONCILED' ? <Text variant="bodySm">Recovered by reconciliation — M-Pesa’s confirmation arrived late.</Text> : null}
              </View>
            ) : (
              <Card key={p.id} style={{ gap: space[1] }}>
                <Text variant="micro">Marked as paid manually</Text>
                <Text variant="section">{formatKes(p.amountCents)}</Text>
                <Text variant="bodySm">
                  {p.manualMethod} · {formatDate(p.paidAt.slice(0, 10))}
                  {p.manualReference ? ` · ${p.manualReference}` : ''}
                </Text>
                {p.note ? <Text variant="bodySm">{p.note}</Text> : null}
                <Text variant="bodySm">Not verified with Safaricom.</Text>
              </Card>
            ),
          )}
        </View>
      ) : null}

      <Card>
        <InvoiceBody inv={doc} />
      </Card>

      {d.reminders.some((r) => r.status === 'SCHEDULED') ? (
        <View style={{ gap: space[2] }}>
          <SectionTitle>Scheduled reminders</SectionTitle>
          <Card style={{ gap: space[2] }}>
            {d.reminders
              .filter((r) => r.status === 'SCHEDULED')
              .map((r) => (
                <Row key={r.id} style={{ justifyContent: 'space-between' }}>
                  <Text variant="bodySm" tone="ink">
                    {r.offsetDays === 0 ? 'On the due date' : r.offsetDays! < 0 ? `${-r.offsetDays!} days before due` : `${r.offsetDays} days after due`}
                  </Text>
                  <Text variant="bodySm">{formatDateTime(r.scheduledFor)}</Text>
                </Row>
              ))}
          </Card>
        </View>
      ) : null}

      <View style={{ gap: space[2] }}>
        <SectionTitle>Activity</SectionTitle>
        <Card style={{ gap: 0 }}>
          {d.timeline.map((e, i) => (
            <View key={e.id} style={styles.event}>
              <View style={styles.rail}>
                <View style={[styles.dot, { backgroundColor: e.action === 'payment.settled' ? color.live : e.action === 'payment.failed' ? color.attention : color.ink3 }]} />
                {i < d.timeline.length - 1 ? <View style={styles.line} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: space[3] }}>
                <Text variant="bodySm" tone="ink" selectable>
                  {e.message}
                </Text>
                <Text variant="bodySm">{relativeTime(e.createdAt)}</Text>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <ActionMenu visible={menu} onClose={() => setMenu(false)} title={inv.number} items={actions.menuFor(inv).filter((m) => m.label !== 'View')} />
      {actions.modals}
      <SendFlow stage={sendStage} setStage={setSendStage} invoice={inv} client={d.client} onEditClient={() => { setSendStage(null); setClientSheet(true); }} onValidation={() => router.push(`/app/invoices/${inv.id}/edit`)} />
      <ClientSheet
        visible={clientSheet}
        editing={d.client}
        onClose={() => setClientSheet(false)}
        onSaved={() => {
          setClientSheet(false);
          void detail.refetch();
        }}
      />
      <Sheet
        visible={resolve}
        onClose={() => setResolve(false)}
        title="Mark as resolved"
        footer={
          <Button
            label="Mark as resolved"
            kind="primary"
            full
            onPress={async () => {
              await api.dismissInvoiceBanner(inv.id, resolveNote);
              setResolve(false);
              void detail.refetch();
            }}
          />
        }
      >
        <Text variant="body">Refunds happen outside the app. Leave a note for your records — it goes in the activity timeline.</Text>
        <Field label="Note" optional value={resolveNote} onChangeText={setResolveNote} placeholder="Refunded KES 12,500 on 3 Oct" />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  event: { flexDirection: 'row', gap: space[3] },
  rail: { width: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: radius.full, marginTop: 6 },
  line: { flex: 1, width: 1, backgroundColor: color.line, marginTop: 2 },
});
