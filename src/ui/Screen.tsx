import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Text } from './Text';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { useOnline } from '../state/net';
import { color, controlHeight, space } from './tokens';

/** "You're offline" strip — thin, amber, never blocking. */
export function OfflineStrip({ publicPage }: { publicPage?: boolean }) {
  const online = useOnline();
  if (online) return null;
  return (
    <View style={styles.offline} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Icon name="offline" size={16} color={color.attention} />
      <Text variant="label" tone="attention">
        {publicPage ? 'You’re offline — the payment can’t start' : 'You’re offline. Changes won’t save.'}
      </Text>
    </View>
  );
}

export function Header({ title, back = true, right, subtitle }: { title: string; back?: boolean; right?: ReactNode; subtitle?: ReactNode }) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/app'))}
          style={styles.iconBtn}
        >
          <Icon name="back" size={22} color={color.ink} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, paddingLeft: back ? 0 : space[4] }}>
        <Text variant="title" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

/**
 * Page scaffold. Content is single-column and max 720 wide, so a phone and a
 * tablet read the same; the bottom action bar is pinned for thumb reach.
 */
export function Screen({
  title,
  back = true,
  right,
  subtitle,
  children,
  footer,
  onRefresh,
  refreshing = false,
  scroll = true,
  noHeader,
  banner,
  publicPage,
}: {
  title?: string;
  back?: boolean;
  right?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  noHeader?: boolean;
  banner?: ReactNode;
  publicPage?: boolean;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {!noHeader && title !== undefined ? <Header title={title} back={back} right={right} subtitle={subtitle} /> : null}
      <OfflineStrip publicPage={publicPage} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.primary} /> : undefined}
          >
            <View style={styles.inner}>
              {banner}
              {children}
            </View>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {banner ? <View style={styles.fixedBanner}>{banner}</View> : null}
            {children}
          </View>
        )}
        {footer ? <SafeAreaView edges={['bottom']} style={styles.footer}>{footer}</SafeAreaView> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export interface MenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

/** Row menus. Inapplicable actions are hidden rather than disabled. */
export function ActionMenu({ visible, title, items, onClose }: { visible: boolean; title: string; items: MenuItem[]; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View>
        {items.map((it) => (
          <Pressable
            key={it.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              setTimeout(it.onPress, 250);
            }}
            style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: color.canvas }]}
          >
            <Text variant="body" tone={it.destructive ? 'danger' : 'ink'}>
              {it.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

/** Destructive confirms name the object in the sentence — never "Are you sure?". */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  destructive = true,
  busy,
  children,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  destructive?: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button label={confirmLabel} kind={destructive ? 'danger' : 'primary'} onPress={onConfirm} loading={busy} full />
          <Button label="Cancel" kind="text" onPress={onClose} full />
        </>
      }
    >
      {body ? <Text variant="body">{body}</Text> : null}
      {children}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.canvas },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingRight: space[2], backgroundColor: color.canvas },
  iconBtn: { width: controlHeight + 4, height: controlHeight + 4, alignItems: 'center', justifyContent: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  content: { flexGrow: 1, paddingBottom: space[7] },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space[4], gap: space[4], paddingTop: space[2] },
  fixedBanner: { paddingHorizontal: space[4], paddingTop: space[2] },
  footer: {
    backgroundColor: color.paper,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[3],
    gap: space[2],
  },
  offline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], backgroundColor: color.attentionTint, paddingVertical: space[1] + 2 },
  menuItem: { minHeight: 52, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: color.lineSoft },
});
