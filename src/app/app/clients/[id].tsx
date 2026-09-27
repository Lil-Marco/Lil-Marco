import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../../state/api';
import { useResource } from '../../../state/useResource';
import { displayPhone } from '../../../domain/phone';
import { Screen } from '../../../ui/Screen';
import { Amount } from '../../../ui/Amount';
import { Button } from '../../../ui/Button';
import { Card, EmptyState, ErrorState, Row, SectionTitle, Skeleton, Toggle } from '../../../ui/Blocks';
import { InvoiceRow } from '../../../ui/InvoiceRow';
import { Text } from '../../../ui/Text';
import { ClientSheet } from '../../../features/clients/ClientSheet';
import { useToast } from '../../../ui/Toast';
import { space } from '../../../ui/tokens';

/** D-7 Client detail — primary is New invoice, the fastest path to a repeat invoice. */
export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const res = useResource(() => api.getClient(id), [id]);
  const toast = useToast();
  const [edit, setEdit] = useState(false);

  if (res.loading) {
    return (
      <Screen title="Client">
        <Skeleton rows={3} height={80} />
      </Screen>
    );
  }
  if (res.error || !res.data) {
    return (
      <Screen title="Client">
        <ErrorState message="This client didn’t load." onRetry={res.refetch} />
      </Screen>
    );
  }
  const { client, outstandingCents, invoices } = res.data;

  return (
    <Screen
      title={client.name}
      onRefresh={res.refetch}
      refreshing={res.refreshing}
      right={<Button label="Edit" kind="text" small onPress={() => setEdit(true)} />}
      footer={<Button label="New invoice" kind="primary" full onPress={() => router.push({ pathname: '/app/invoices/new', params: { clientId: client.id } })} />}
    >
      <Card style={{ gap: space[2] }}>
        <Text variant="micro">Outstanding</Text>
        <Amount cents={outstandingCents} size="lg" />
        {client.archivedAt ? <Text variant="bodySm" tone="attention">Archived — hidden from the client picker.</Text> : null}
      </Card>
      <Card style={{ gap: space[2] }}>
        <SectionTitle>Details</SectionTitle>
        {client.email ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="bodySm" tone="ink" selectable>
              {client.email}
            </Text>
            <Button label="Email" kind="text" small onPress={() => Linking.openURL(`mailto:${client.email}`)} />
          </Row>
        ) : (
          <Text variant="bodySm" tone="attention">
            No email — add one to send invoices.
          </Text>
        )}
        {client.phone ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="monoSm" tone="ink" selectable>
              {displayPhone(client.phone)}
            </Text>
            <Button label="Call" kind="text" small onPress={() => Linking.openURL(`tel:0${client.phone!.slice(3)}`)} />
          </Row>
        ) : null}
        {client.notes ? <Text variant="bodySm">{client.notes}</Text> : null}
        <Toggle
          label="Automatic reminders"
          value={client.remindersEnabled}
          onChange={async (v) => {
            await api.updateClient(client.id, { name: client.name, email: client.email, phone: client.phone, notes: client.notes, remindersEnabled: v });
            toast.show(v ? 'Reminders on for this client' : 'Reminders off for this client');
            void res.refetch();
          }}
        />
      </Card>
      <SectionTitle>Invoices</SectionTitle>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {invoices.length === 0 ? (
          <EmptyState text="No invoices for this client yet." />
        ) : (
          <View>
            {invoices.map((r) => (
              <InvoiceRow key={r.invoice.id} invoice={r.invoice} clientName={r.invoice.number} onPress={() => router.push(`/app/invoices/${r.invoice.id}`)} />
            ))}
          </View>
        )}
      </Card>
      <ClientSheet
        visible={edit}
        editing={client}
        onClose={() => setEdit(false)}
        onSaved={() => {
          setEdit(false);
          toast.show('Client saved');
          void res.refetch();
        }}
      />
    </Screen>
  );
}
