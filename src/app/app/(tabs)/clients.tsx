import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../../state/api';
import { errorMessage, useResource } from '../../../state/useResource';
import { isApiError } from '../../../api/errors';
import type { Client } from '../../../domain/types';
import { formatDate } from '../../../domain/dates';
import { displayPhone } from '../../../domain/phone';
import { TabScreen } from '../../../features/shell/TabScreen';
import { ClientSheet } from '../../../features/clients/ClientSheet';
import { Amount } from '../../../ui/Amount';
import { Button } from '../../../ui/Button';
import { EmptyState, ErrorState, Row, Skeleton } from '../../../ui/Blocks';
import { Field } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ActionMenu, ConfirmDialog } from '../../../ui/Screen';
import { Text } from '../../../ui/Text';
import { useToast } from '../../../ui/Toast';
import { color, space } from '../../../ui/tokens';

/** D-6 Clients — searchable, Add client (M-1) as the primary. */
export default function Clients() {
  const [q, setQ] = useState('');
  const list = useResource(() => api.listClients({ q }), [q]);
  const toast = useToast();
  const [sheet, setSheet] = useState<{ editing?: Client | null } | null>(null);
  const [menu, setMenu] = useState<Client | null>(null);
  const [refused, setRefused] = useState<{ client: Client; count: number } | null>(null);

  const remove = async (c: Client) => {
    try {
      await api.deleteClient(c.id);
      toast.show(`${c.name} deleted`);
      void list.refetch();
    } catch (e) {
      if (isApiError(e, 'CLIENT_HAS_INVOICES')) setRefused({ client: c, count: Number(e.meta.count) });
      else toast.show(errorMessage(e), { kind: 'error' });
    }
  };

  return (
    <TabScreen
      title="Clients"
      scroll={false}
      header={
        <View style={{ gap: space[3] }}>
          <Button label="Add client" kind="primary" icon="plus" onPress={() => setSheet({})} />
          <Field label="Search" value={q} onChangeText={setQ} placeholder="Name, email or phone" autoCapitalize="none" />
        </View>
      }
    >
      {list.loading ? (
        <View style={{ paddingHorizontal: space[4] }}>
          <Skeleton rows={5} />
        </View>
      ) : list.error ? (
        <ErrorState message="Your clients didn’t load." onRetry={list.refetch} />
      ) : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(r) => r.client.id}
          style={{ backgroundColor: color.paper }}
          contentContainerStyle={{ paddingBottom: space[7] }}
          refreshing={list.refreshing}
          onRefresh={list.refetch}
          ListEmptyComponent={q ? <EmptyState text={`No clients match “${q}”.`} /> : <EmptyState text="No clients yet. Add one here or straight from a new invoice." action="Add client" onAction={() => setSheet({})} />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/app/clients/${item.client.id}`)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', padding: space[4], paddingRight: space[1], gap: space[2], backgroundColor: pressed ? color.canvas : color.paper, borderBottomWidth: 1, borderBottomColor: color.lineSoft })}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="section" numberOfLines={1}>
                  {item.client.name}
                </Text>
                <Text variant="bodySm" numberOfLines={1}>
                  {[item.client.email, item.client.phone ? displayPhone(item.client.phone) : null].filter(Boolean).join(' · ') || 'No contact details'}
                </Text>
                <Text variant="bodySm">{item.lastInvoiceDate ? `Last invoice ${formatDate(item.lastInvoiceDate)}` : 'No invoices yet'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Amount cents={item.outstandingCents} tone={item.outstandingCents ? 'ink' : 'ink3'} />
                <Text variant="bodySm">outstanding</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${item.client.name}`} onPress={() => setMenu(item.client)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="kebab" />
              </Pressable>
            </Pressable>
          )}
        />
      )}
      <ClientSheet
        visible={!!sheet}
        editing={sheet?.editing}
        onClose={() => setSheet(null)}
        onSaved={(c) => {
          setSheet(null);
          toast.show(sheet?.editing ? 'Client saved' : `${c.name} added`);
          void list.refetch();
        }}
      />
      <ActionMenu
        visible={!!menu}
        onClose={() => setMenu(null)}
        title={menu?.name ?? ''}
        items={
          menu
            ? [
                { label: 'Edit', onPress: () => setSheet({ editing: menu }) },
                { label: 'New invoice for this client', onPress: () => router.push({ pathname: '/app/invoices/new', params: { clientId: menu.id } }) },
                { label: 'Delete', destructive: true, onPress: () => void remove(menu) },
              ]
            : []
        }
      />
      <ConfirmDialog
        visible={!!refused}
        title={`This client has ${refused?.count} invoice${refused?.count === 1 ? '' : 's'}`}
        body={`Archive ${refused?.client.name ?? ''} instead. They disappear from the client picker; their invoices stay exactly as they are.`}
        confirmLabel="Archive client"
        destructive={false}
        onClose={() => setRefused(null)}
        onConfirm={async () => {
          if (!refused) return;
          await api.archiveClient(refused.client.id);
          toast.show(`${refused.client.name} archived`);
          setRefused(null);
          void list.refetch();
        }}
      >
        <Row>
          <Icon name="help" />
          <Text variant="bodySm" style={{ flex: 1 }}>
            Deleting would orphan financial history, so it isn’t allowed.
          </Text>
        </Row>
      </ConfirmDialog>
    </TabScreen>
  );
}
