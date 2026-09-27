import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../ui/Text';
import { OfflineStrip } from '../../ui/Screen';
import { color, radius, space } from '../../ui/tokens';

export function Wordmark() {
  return (
    <View style={styles.wordmark} accessibilityLabel="Invoice plus M-Pesa">
      <View style={styles.tile}>
        <Text variant="section" tone="onPrimary">
          I
        </Text>
      </View>
      <Text variant="section">Invoice + M-Pesa</Text>
    </View>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <OfflineStrip />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.col}>
            <Wordmark />
            <View style={{ gap: space[2] }}>
              <Text variant="display" accessibilityRole="header">
                {title}
              </Text>
              {typeof subtitle === 'string' ? <Text variant="body">{subtitle}</Text> : subtitle}
            </View>
            <View style={styles.card}>{children}</View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.canvas },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space[4] },
  col: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: space[5], paddingVertical: space[5] },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  tile: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: color.paper, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, padding: space[5], gap: space[4] },
});
