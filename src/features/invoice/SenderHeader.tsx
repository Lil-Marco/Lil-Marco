import { Image, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { color, radius, space } from '../../ui/tokens';

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '·'
  );
}

/** Sender logo (or a blue initial tile) and business name — the top of P-1, the PDF, and the A-8 preview. */
export function SenderHeader({ name, logoUri, sub, size = 44 }: { name: string; logoUri: string | null; sub?: string | null; size?: number }) {
  return (
    <View style={styles.row}>
      {logoUri ? (
        <Image source={{ uri: logoUri }} style={[styles.logo, { width: size, height: size }]} accessibilityIgnoresInvertColors accessibilityLabel={`${name} logo`} />
      ) : (
        <View style={[styles.tile, { width: size, height: size }]}>
          <Text variant="section" tone="onPrimary">
            {initials(name)}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text variant="section" numberOfLines={2}>
          {name || 'Your business name'}
        </Text>
        {sub ? (
          <Text variant="bodySm" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  logo: { borderRadius: radius.md, backgroundColor: color.canvas },
  tile: { borderRadius: radius.md, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
});
