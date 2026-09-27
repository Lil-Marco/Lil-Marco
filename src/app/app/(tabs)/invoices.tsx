import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../../state/api';
import { useSession } from '../../../state/session';
import { useResource } from '../../../state/useResource';
import type { InvoiceFilter } from '../../../api/types';
import type { Invoice } from '../../../domain/types';
import { addDays, todayEat } from '../../../domain/dates';
import { TabScreen } from '../../../features/shell/TabScreen';
import { useInvoiceActions } from '../../../features/invoice/useInvoiceActions';
import { InvoiceRow } from '../../../ui/InvoiceRow';
import { EmptyState, ErrorState, FilterChip, Row, Skeleton } from '../../../ui/Blocks';
import { Field } from '../../../ui/Field';
import { Button } from '../../../ui/Button';
import { ActionMenu } from '../../../ui/Screen';
import { Text } from '../../../ui/Text';
import { useToast } from '../../../ui/Toast';
import { color, space } from '../../../ui/tokens';

const FILTERS: { value: InvoiceFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'PAID', label: 'Paid' },
];

type Range = 'any' | '30d' | 'month' | '90d';
const RANGES: { value: Range; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'month', label: 'This month' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

function rangeDates(r: Range): { from: string | null; to: string | null } {
  const today = todayEat();
  if (r === '30d') return { from: addDays(today, -30), to: today };
  if (r === '90d') return { from: addDays(today, -90), to: today };
  if (r === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: null, to: null };
}

/**
 * D-2 Invoice list. Filter, search and range live in the route params so a
 * filtered list survives a reload and is what the D-1 cards link to.
 */
export default function Invoices() {
  const params = useLocalSearchParams<{ filter?: InvoiceFilter; q?: string; range?: Range }>();
  const filter = (params.filter as InvoiceFilter) ?? 'ALL';
  const range = (params.range as Range) ?? 'any';
  const [q, setQ] = useState(params.q ?? '');
  const { me } = useSession();
  const toast = useToast();
  const setParam = (p: Record<string, string | undefined>) => router.setParams(p);

  const list = useResource(() => api.listInvoices({ filter, q: params.q, ...rangeDates(range) }), [filter, params.q, range]);
  const actions = useInvoiceActions(() => void list.refetch());
  const [menu, setMenu] = useState<Invoice | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const usage = me?.usage;
  const usageLine = usage && usage.limit !== null && usage.invoicesSent >= 3 ? `${usage.invoicesSent} of ${usage.limit} invoices this month${usage.invoicesSent >= usage.limit ? ' · used' : ''}` : null;

  const rows = list.data ?? [];
  const filtered = filter !== 'ALL' || !!params.q || range !== 'any';
  const selecting = selected.size > 0;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulk = async () => {
    setBulkBusy(true);
    try {
      const r = await api.bulkRemind([...selected]);
      toast.show(`${r.sent} reminder${r.sent === 1 ? '' : 's'} sent${r.skipped ? `, ${r.skipped} skipped (reminded today or not payable)` : ''}`);
      setSelected(new Set());
      void list.refetch();
    } finally {
      setBulkBusy(false);
    }
  };

  const header = useMemo(
    () => (
      <View style={{ gap: space[3] }}>
        {usageLine ? (
          <Text variant="label" tone={usage!.invoicesSent >= usage!.limit! ? 'attention' : 'ink2'}>
            {usageLine}
          </Text>
        ) : null}
        <Field
          label="Search"
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => setParam({ q: q || undefined })}
          onBlur={() => setParam({ q: q || undefined })}
          placeholder="Invoice number, client or amount"
          returnKeyType="search"
          autoCapitalize="none"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {FILTERS.map((f) => (
            <FilterChip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setParam({ filter: f.value === 'ALL' ? undefined : f.value })} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {RANGES.map((r) => (
            <FilterChip key={r.value} label={r.label} selected={range === r.value} onPress={() => setParam({ range: r.value === 'any' ? undefined : r.value })} />
          ))}
        </ScrollView>
        {selecting ? (
          <Row style={styles.bulk}>
            <Text variant="label" style={{ flex: 1 }}>
              {selected.size} selected
            </Text>
            <Button label="Clear" kind="text" small onPress={() => setSelected(new Set())} />
            <Button label="Send reminders" kind="primary" small onPress={bulk} loading={bulkBusy} />
          </Row>
        ) : null}
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, filter, range, usageLine, selected, bulkBusy],
  );

  return (
    <TabScreen title="Invoices" scroll={false} header={header}>
      {list.loading ? (
        <View style={{ paddingHorizontal: space[4] }}>
          <Skeleton rows={6} height={64} />
        </View>
      ) : list.error ? (
        <ErrorState message="Your invoices didn’t load." onRetry={list.refetch} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.invoice.id}
          refreshing={list.refreshing}
          onRefresh={list.refetch}
          contentContainerStyle={{ paddingBottom: space[7] }}
          style={{ backgroundColor: color.paper }}
          ListEmptyComponent={
            filtered ? (
              <EmptyState
                text="No invoices match these filters."
                action="Clear filters"
                kind="secondary"
                onAction={() => {
                  setQ('');
                  setParam({ filter: undefined, q: undefined, range: undefined });
                }}
              />
            ) : (
              <EmptyState text="No invoices yet. Your first one takes about two minutes." action="New invoice" onAction={() => router.push('/app/invoices/new')} />
            )
          }
          renderItem={({ item }) => (
            <InvoiceRow
              invoice={item.invoice}
              clientName={item.clientName}
              onPress={() => (selecting ? toggle(item.invoice.id) : router.push(`/app/invoices/${item.invoice.id}`))}
              onMenu={() => setMenu(item.invoice)}
              selected={selecting ? selected.has(item.invoice.id) : undefined}
              onToggleSelect={['SENT', 'VIEWED', 'OVERDUE'].includes(item.invoice.status) ? () => toggle(item.invoice.id) : undefined}
            />
          )}
        />
      )}
      <ActionMenu visible={!!menu} onClose={() => setMenu(null)} title={menu ? `${menu.number}` : ''} items={menu ? actions.menuFor(menu) : []} />
      {actions.modals}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  bulk: { backgroundColor: color.primaryTint, borderRadius: 10, paddingLeft: space[3], paddingRight: space[1], minHeight: 48 },
});
