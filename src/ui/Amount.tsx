import { StyleSheet } from 'react-native';
import { formatKesDigits, formatKesShort } from '../domain/money';
import { Text } from './Text';
import type { ColorToken } from './tokens';

type Size = 'xl' | 'lg' | 'md';

/**
 * KES-prefixed, tabular, never truncated, never optimistic. The currency prefix
 * sits in a smaller, lighter span so the digits stay dominant.
 */
export function Amount({ cents, size = 'md', tone = 'ink', short, strike }: { cents: number; size?: Size; tone?: ColorToken; short?: boolean; strike?: boolean }) {
  const variant = size === 'xl' ? 'amountXl' : size === 'lg' ? 'amountLg' : 'amountMd';
  const digits = short ? formatKesShort(cents).slice(4) : formatKesDigits(cents);
  return (
    <Text variant={variant} tone={tone} strike={strike} accessibilityLabel={`KES ${digits}`} numberOfLines={1} adjustsFontSizeToFit={size === 'xl'}>
      <Text variant={size === 'md' ? 'bodySm' : 'section'} tone="ink2" style={size === 'xl' ? styles.prefixXl : undefined}>
        KES{' '}
      </Text>
      {digits}
    </Text>
  );
}

const styles = StyleSheet.create({
  prefixXl: { fontSize: 20 },
});
