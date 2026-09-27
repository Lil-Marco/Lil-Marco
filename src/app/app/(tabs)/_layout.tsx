import { Tabs } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../ui/Text';
import { Icon, type IconName } from '../../../ui/Icon';
import { color, controlHeight, radius, space } from '../../../ui/tokens';

const SLOTS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'invoices', label: 'Invoices', icon: 'invoice' },
  { name: 'new', label: 'New', icon: 'plus' },
  { name: 'clients', label: 'Clients', icon: 'clients' },
  { name: 'more', label: 'More', icon: 'more' },
];

type BarProps = { state: { index: number; routes: { name: string; key: string }[] }; navigation: { navigate: (name: string) => void } };

/** Five-slot bottom bar: Home, Invoices, a centre + that opens D-3, Clients, More. */
function BottomBar({ state, navigation }: BarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space[2]) }]} accessibilityRole="tablist">
      {SLOTS.map((s) => {
        if (s.name === 'new') {
          return (
            <Pressable key={s.name} accessibilityRole="button" accessibilityLabel="New invoice" onPress={() => router.push('/app/invoices/new')} style={styles.slot}>
              <View style={styles.plus}>
                <Icon name="plus" size={24} color={color.onPrimary} />
              </View>
            </Pressable>
          );
        }
        const active = current === s.name;
        return (
          <Pressable key={s.name} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={s.label} onPress={() => navigation.navigate(s.name)} style={styles.slot}>
            <Icon name={s.icon} size={22} color={active ? color.primary : color.ink3} />
            <Text variant="label" tone={active ? 'primary' : 'ink2'} style={{ fontSize: 11.5 }}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BottomBar {...(props as unknown as BarProps)} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="invoices" />
      <Tabs.Screen name="new" />
      <Tabs.Screen name="clients" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: color.paper, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space[1] },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: controlHeight + 8, gap: 2 },
  plus: { width: 48, height: 40, borderRadius: radius.md, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
});
