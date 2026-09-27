import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { api } from '../../state/api';
import { useResource } from '../../state/useResource';
import { addDays, eatDate, formatDateTime, todayEat } from '../../domain/dates';
import { toKes } from '../../domain/money';
import { displayPhone } from '../../domain/phone';
import type { PaymentRow } from '../../api/types';
import { Screen } from '../../ui/Screen';
import { Amount } from '../../ui/Amount';
import { Button } from '../../ui/Button';
import { Card, EmptyState, ErrorState, FilterChip, Skeleton } from '../../ui/Blocks';
import { Text } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import { color, space } from '../../ui/tokens';

type Range = 'all' | 'month' | '30d' | '90d';

function range(r: Range) {
  const t = todayEat();
  if (r === 'month') return { from: `${t.slice(0, 7)}-01`, to: t };
  if (r === '30d') return { from: addDays(t, -30), to: t };
  if (r === '90d') return { from: addDays(t, -90), to: t };
  return {};
}

/** Amounts as plain numbers (no separators) so Excel reads them as numbers, not text. */
function csv(rows: PaymentRow[]) {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [
    'Date (EAT),Client,Invoice,Amount (KES),M-Pesa receipt,Paying number,Source',
    ...rows.map((r) =>
      [
        eatDate(r.payment.paidAt),
        q(r.clientName),
        q(r.invoiceNumber),
        toKes(r.payment.amountCents),
        r.payment.mpesaReceiptNumber ?? '',
        r.payment.payerPhone ? displayPhone(r.payment.payerPhone).replace(/\s/g, '') : '',
        r.payment.source === 'MANUAL' ? `Manual (${r.payment.manualMethod ?? ''})` : r.payment.source === 'RECONCILED' ? 'M-Pesa (recovered)' : 'M-Pesa',
      ].join(','),
    ),
  ];
  return lines.join('\r\n');
}

/** D-8 Payments — the reconciliation surface. */
export default function Payments() {
  const [r, setR] = useState<Range>('all');
  const list = useResource(() => api.listPayments(range(r)), [r]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const exportCsv = async () => {
    const rows = list.data ?? [];
    if (rows.length >= 1000) {
      toast.show('That’s a big export — we’ll email you a link when it’s ready');
      return;
    }
    setBusy(true);
    try {
      const file = new File(Paths.cache, `payments-${todayEat()}.csv`);
      file.write(csv(rows));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export payments' });
      else await Print.printAsync({ html: `<pre>${csv(rows)}</pre>` });
    } catch {
      toast.show('The export didn’t work. Try again', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Payments" right={<Button label="Export" kind="text" small onPress={exportCsv} loading={busy} disabled={!list.data?.length} />} onRefresh={list.refetch} refreshing={list.refreshing}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
        {(
          [
            ['all', 'All time'],
            ['month', 'This month'],
            ['30d', 'Last 30 days'],
            ['90d', 'Last 90 days'],
          ] as [Range, string][]
        ).map(([v, l]) => (
          <FilterChip key={v} label={l} selected={r === v} onPress={() => setR(v)} />
        ))}
      </ScrollView>
      {list.loading ? (
        <Skeleton rows={5} height={84} />
      ) : list.error ? (
        <ErrorState message="Payments didn’t load." onRetry={list.refetch} />
      ) : (list.data ?? []).length === 0 ? (
        <Card>
          <EmptyState text={r === 'all' ? 'No payments yet. They appear here the moment M-Pesa confirms them.' : 'No payments in this period.'} />
        </Card>
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {list.data!.map((p) => (
            <Pressable
              key={p.payment.id}
              accessibilityRole="button"
              onPress={() => router.push(`/app/invoices/${p.payment.invoiceId}`)}
              style={({ pressed }) => ({ padding: space[4], gap: 2, backgroundColor: pressed ? color.canvas : color.paper, borderBottomWidth: 1, borderBottomColor: color.lineSoft })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[2] }}>
                <Text variant="section" style={{ flex: 1 }} numberOfLines={1}>
                  {p.clientName}
                </Text>
                <Amount cents={p.payment.amountCents} tone="payHover" />
              </View>
              <Text variant="monoSm" tone="ink" selectable>
                {p.payment.mpesaReceiptNumber ?? `Manual · ${p.payment.manualMethod ?? ''}`} · {p.invoiceNumber}
              </Text>
              <Text variant="bodySm">
                {formatDateTime(p.payment.paidAt)}
                {p.payment.payerPhone ? ` · ${displayPhone(p.payment.payerPhone)}` : ''}
                {p.payment.source === 'RECONCILED' ? ' · recovered' : ''}
              </Text>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}
