import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from './TopBar';
import { BannerSlot } from './BannerSlot';
import { OfflineStrip } from '../../ui/Screen';
import { color, space } from '../../ui/tokens';

/** A D- screen inside the shell: top bar, offline strip, the banner slot, content. */
export function TabScreen({ title, children, onRefresh, refreshing = false, scroll = true, header }: { title: string; children: ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean; header?: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <TopBar title={title} />
      <OfflineStrip />
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.primary} /> : undefined}
        >
          <View style={styles.inner}>
            <BannerSlot />
            {children}
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={[styles.inner, { paddingBottom: space[2] }]}>
            <BannerSlot />
            {header}
          </View>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.canvas },
  content: { paddingBottom: space[7] },
  inner: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space[4], gap: space[4] },
});
