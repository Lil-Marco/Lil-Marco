import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../../state/api';
import { useResource } from '../../../state/useResource';
import { TabScreen } from '../../../features/shell/TabScreen';
import { Amount } from '../../../ui/Amount';
import { Card, EmptyState, ErrorState, SectionTitle, Skeleton, StatCard } from '../../../ui/Blocks';
import { InvoiceRow } from '../../../ui/InvoiceRow';
import { Text } from '../../../ui/Text';
import { formatDateTime } from '../../../domain/dates';
import { displayPhone } from '../../../domain/phone';
import { color, space } from '../../../ui/tokens';

/** D-1 Dashboard home: four figures, then the only two lists that matter. */
export default function Home() {
  const summary = useResource(() => api.summary(), []);
  const attention = useResource(() => api.needsAttention(), []);
  const recent = useResource(() => api.recentPayments(), []);
  const [highlight, setHighlight] = useState(0);

  // A payment landing while the screen is open highlights the changed figure.
  useEffect(() => api.subscribe((e) => e.type === 'payment_received' && setHighlight((h) => h + 1)), []);

  const refresh = () => {
    void summary.refetch();
    void attention.refetch();
    void recent.refetch();
  };

  const s = summary.data;
  const link = (filter: string) => router.push({ pathname: '/app/invoices', params: { filter } });

  return (
    <TabScreen title="Dashboard" onRefresh={refresh} refreshing={summary.refreshing}>
      {summary.loading ? (
        <Skeleton rows={4} height={96} />
      ) : summary.error ? (
        <ErrorState message="Your figures didn’t load." onRetry={refresh} />
      ) : s && !s.hasAnyInvoice ? (
        <Card>
          <EmptyState text="You haven’t sent an invoice yet." action="Create your first invoice" onAction={() => router.push('/app/invoices/new')} />
        </Card>
      ) : s ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
            <StatCard
              label="Paid this month"
              value={<Amount cents={s.paidThisMonthCents} size="lg" short />}
              sub={`${s.paidThisMonthCount} invoice${s.paidThisMonthCount === 1 ? '' : 's'}`}
              onPress={() => link('PAID')}
              highlight={highlight > 0 ? true : undefined}
              key={`paid-${highlight}`}
            />
            <StatCard label="Outstanding" value={<Amount cents={s.outstandingCents} size="lg" short />} sub={`${s.outstandingCount} invoice${s.outstandingCount === 1 ? '' : 's'}`} onPress={() => link('SENT')} />
            <StatCard
              label="Overdue"
              value={<Amount cents={s.overdueCents} size="lg" short tone={s.overdueCount ? 'attention' : 'ink'} />}
              sub={s.overdueCount ? `${s.overdueCount} invoice${s.overdueCount === 1 ? '' : 's'} · ${s.oldestOverdueDays} day${s.oldestOverdueDays === 1 ? '' : 's'}` : 'Nothing overdue'}
              onPress={() => link('OVERDUE')}
            />
            <StatCard label="Drafts" value={<Text variant="amountLg">{s.draftCount}</Text>} sub="Not sent yet" onPress={() => link('DRAFT')} />
          </View>

          <SectionTitle
            action={
              <Pressable accessibilityRole="link" onPress={() => router.push('/app/invoices')} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text variant="label" tone="primary">
                  View all
                </Text>
              </Pressable>
            }
          >
            Needs attention
          </SectionTitle>
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {attention.loading ? (
              <Skeleton rows={2} />
            ) : (attention.data ?? []).length === 0 ? (
              <Text variant="bodySm" style={{ padding: space[4] }}>
                Nothing to chase right now.
              </Text>
            ) : (
              attention.data!.map((r) => <InvoiceRow key={r.invoice.id} invoice={r.invoice} clientName={r.clientName} onPress={() => router.push(`/app/invoices/${r.invoice.id}`)} />)
            )}
          </Card>

          <SectionTitle
            action={
              <Pressable accessibilityRole="link" onPress={() => router.push('/app/payments')} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text variant="label" tone="primary">
                  View all
                </Text>
              </Pressable>
            }
          >
            Recent payments
          </SectionTitle>
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {(recent.data ?? []).length === 0 ? (
              <Text variant="bodySm" style={{ padding: space[4] }}>
                Payments appear here the moment M-Pesa confirms them.
              </Text>
            ) : (
              recent.data!.map((p) => (
                <Pressable
                  key={p.payment.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/app/invoices/${p.payment.invoiceId}`)}
                  style={({ pressed }) => ({ padding: space[4], gap: 2, backgroundColor: pressed ? color.canvas : color.paper, borderBottomWidth: 1, borderBottomColor: color.lineSoft })}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[2] }}>
                    <Text variant="section" numberOfLines={1} style={{ flex: 1 }}>
                      {p.clientName}
                    </Text>
                    <Amount cents={p.payment.amountCents} tone="payHover" />
                  </View>
                  <Text variant="monoSm" tone="ink2" selectable>
                    {p.payment.mpesaReceiptNumber ?? (p.payment.manualMethod ? `Manual · ${p.payment.manualMethod}` : '—')} · {p.invoiceNumber}
                  </Text>
                  <Text variant="bodySm">
                    {formatDateTime(p.payment.paidAt)}
                    {p.payment.payerPhone ? ` · ${displayPhone(p.payment.payerPhone)}` : ''}
                  </Text>
                </Pressable>
              ))
            )}
          </Card>
        </>
      ) : null}
    </TabScreen>
  );
}
