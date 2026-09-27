import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../state/api';
import { useResource } from '../../state/useResource';
import { relativeTime } from '../../domain/dates';
import { Screen } from '../../ui/Screen';
import { Card, EmptyState, Skeleton } from '../../ui/Blocks';
import { Text } from '../../ui/Text';
import { color, radius, space } from '../../ui/tokens';

/** The bell. Unread counts clear on opening the panel, not on clicking through. */
export default function Notifications() {
  const list = useResource(() => api.listNotifications(), []);

  useEffect(() => {
    void api.markNotificationsRead();
  }, []);

  return (
    <Screen title="Notifications" onRefresh={list.refetch} refreshing={list.refreshing}>
      {list.loading ? (
        <Skeleton rows={4} />
      ) : (list.data ?? []).length === 0 ? (
        <Card>
          <EmptyState text="Nothing yet. Payments, views and anything that needs you will show up here." />
        </Card>
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {list.data!.map((n) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              onPress={() => (n.invoiceId ? router.push(`/app/invoices/${n.invoiceId}`) : n.kind === 'subscription' ? router.push('/app/settings/billing') : undefined)}
              style={({ pressed }) => ({ flexDirection: 'row', gap: space[3], padding: space[4], backgroundColor: pressed ? color.canvas : color.paper, borderBottomWidth: 1, borderBottomColor: color.lineSoft })}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: radius.full,
                  marginTop: 8,
                  backgroundColor: n.readAt ? color.transparent : color.primary,
                }}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="section">{n.title}</Text>
                <Text variant="bodySm">{n.body}</Text>
                <Text variant="bodySm" tone="ink3">
                  {relativeTime(n.createdAt)}
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}
