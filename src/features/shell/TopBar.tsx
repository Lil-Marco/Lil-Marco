import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '../../state/session';
import { useResource } from '../../state/useResource';
import { api } from '../../state/api';
import { Text } from '../../ui/Text';
import { Icon } from '../../ui/Icon';
import { ActionMenu } from '../../ui/Screen';
import { initials } from '../invoice/SenderHeader';
import { color, controlHeight, radius, space } from '../../ui/tokens';

/** Top bar: business name, the bell, and the avatar menu. */
export function TopBar({ title }: { title?: string }) {
  const { me, signOut } = useSession();
  const unread = useResource(() => api.unreadCount(), []);
  const [menu, setMenu] = useState(false);
  const count = unread.data ?? 0;
  return (
    <View style={styles.bar}>
      <View style={{ flex: 1 }}>
        <Text variant="micro" numberOfLines={1}>
          {me?.profile.businessName}
        </Text>
        <Text variant="title" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={count ? `Notifications, ${count} unread` : 'Notifications'} onPress={() => router.push('/app/notifications')} style={styles.icon}>
        <Icon name="bell" size={22} color={color.ink} />
        {count > 0 ? (
          <View style={styles.badge}>
            <Text variant="label" tone="onPrimary" style={{ fontSize: 11, lineHeight: 14 }}>
              {count > 9 ? '9+' : count}
            </Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Account menu" onPress={() => setMenu(true)} style={styles.icon}>
        <View style={styles.avatar}>
          <Text variant="label" tone="primary">
            {initials(me?.user.name ?? '')}
          </Text>
        </View>
      </Pressable>
      <ActionMenu
        visible={menu}
        onClose={() => setMenu(false)}
        title={me?.user.email ?? 'Account'}
        items={[
          { label: 'Settings', onPress: () => router.push('/app/settings') },
          { label: 'Plan and billing', onPress: () => router.push('/app/settings/billing') },
          { label: 'Help and support', onPress: () => router.push('/app/help') },
          {
            label: 'Log out',
            onPress: async () => {
              await signOut();
              router.replace('/login');
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingLeft: space[4], paddingRight: space[2], minHeight: 60, gap: space[1] },
  icon: { width: controlHeight, height: controlHeight, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 4, minWidth: 18, height: 18, borderRadius: radius.full, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  avatar: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' },
});
