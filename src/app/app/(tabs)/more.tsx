import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../../state/api';
import { useSession } from '../../../state/session';
import { TabScreen } from '../../../features/shell/TabScreen';
import { Card } from '../../../ui/Blocks';
import { Icon, type IconName } from '../../../ui/Icon';
import { Text } from '../../../ui/Text';
import { color, space } from '../../../ui/tokens';

const ITEMS: { label: string; sub: string; icon: IconName; href: string; mockOnly?: boolean }[] = [
  { label: 'Payments', sub: 'Every M-Pesa payment, with receipt codes', icon: 'wallet', href: '/app/payments' },
  { label: 'Notifications', sub: 'Payments, views and anything that needs you', icon: 'bell', href: '/app/notifications' },
  { label: 'Settings', sub: 'Business, M-Pesa, invoice defaults, reminders', icon: 'settings', href: '/app/settings' },
  { label: 'Plan and billing', sub: 'Your plan and our receipts', icon: 'receipt', href: '/app/settings/billing' },
  { label: 'Help and support', sub: 'Answers and how to reach us', icon: 'help', href: '/app/help' },
  { label: 'M-Pesa simulator', sub: 'Choose what the simulated Safaricom does', icon: 'phone', href: '/app/simulator', mockOnly: true },
];

export default function More() {
  const { me, signOut } = useSession();
  return (
    <TabScreen title="More">
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {ITEMS.filter((i) => !i.mockOnly || api.mode === 'mock').map((i) => (
          <Pressable
            key={i.href}
            accessibilityRole="link"
            onPress={() => router.push(i.href as never)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], minHeight: 64, backgroundColor: pressed ? color.canvas : color.paper, borderBottomWidth: 1, borderBottomColor: color.lineSoft })}
          >
            <Icon name={i.icon} color={color.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="section">{i.label}</Text>
              <Text variant="bodySm">{i.sub}</Text>
            </View>
            <Icon name="chevronRight" />
          </Pressable>
        ))}
      </Card>
      <Card style={{ gap: space[1] }}>
        <Text variant="bodySm">Signed in as</Text>
        <Text variant="section">{me?.user.email}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            await signOut();
            router.replace('/login');
          }}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="label" tone="primary">
            Log out
          </Text>
        </Pressable>
      </Card>
    </TabScreen>
  );
}
