import { StyleSheet, View } from 'react-native';
import type { InvoiceStatus } from '../domain/types';
import { Text } from './Text';
import { color, radius, space, type ColorToken } from './tokens';

/** Six states, identical wording in every surface. Colour always paired with a word and a dot. */
const MAP: Record<InvoiceStatus, { label: string; fg: ColorToken; bg: ColorToken }> = {
  DRAFT: { label: 'Draft', fg: 'neutral', bg: 'lineSoft' },
  SENT: { label: 'Sent', fg: 'primary', bg: 'primaryTint' },
  VIEWED: { label: 'Viewed', fg: 'viewed', bg: 'primaryTint' },
  OVERDUE: { label: 'Overdue', fg: 'attention', bg: 'attentionTint' },
  PAID: { label: 'Paid', fg: 'payHover', bg: 'payTint' },
  VOID: { label: 'Void', fg: 'neutral', bg: 'lineSoft' },
};

export function statusLabel(s: InvoiceStatus) {
  return MAP[s].label;
}

export function StatusChip({ status }: { status: InvoiceStatus }) {
  const m = MAP[status];
  return (
    <View style={[styles.chip, { backgroundColor: color[m.bg] }]} accessibilityLabel={`Status: ${m.label}`}>
      <View style={[styles.dot, { backgroundColor: color[m.fg] }]} />
      <Text variant="label" tone={m.fg} strike={status === 'VOID'}>
        {m.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[1] + 2,
    paddingHorizontal: space[2] + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  dot: { width: 7, height: 7, borderRadius: radius.full },
});
