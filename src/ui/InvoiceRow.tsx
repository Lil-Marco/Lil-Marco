import { Pressable, StyleSheet, View } from 'react-native';
import type { Invoice } from '../domain/types';
import { dueRelative, formatDate } from '../domain/dates';
import { Text } from './Text';
import { StatusChip } from './StatusChip';
import { Amount } from './Amount';
import { Icon } from './Icon';
import { color, controlHeight, space } from './tokens';

function subline(inv: Invoice): { text: string; attention: boolean } {
  switch (inv.status) {
    case 'PAID':
      return { text: `paid ${inv.paidAt ? formatDate(inv.paidAt.slice(0, 10)).replace(/ \d{4}$/, '') : ''}`, attention: false };
    case 'DRAFT':
      return { text: 'not sent yet', attention: false };
    case 'VOID':
      return { text: 'voided', attention: false };
    case 'OVERDUE':
      return { text: `due ${dueRelative(inv.dueDate)}`, attention: true };
    default:
      return { text: dueRelative(inv.dueDate), attention: false };
  }
}

/**
 * The whole row is the target. Client name leads; the number is secondary and
 * set in mono. Amount is right-aligned and tabular so the column scans.
 */
export function InvoiceRow({
  invoice,
  clientName,
  onPress,
  onMenu,
  selected,
  onToggleSelect,
}: {
  invoice: Invoice;
  clientName: string;
  onPress: () => void;
  onMenu?: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const sub = subline(invoice);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${clientName}, ${invoice.number}, ${sub.text}`}
      onPress={onPress}
      onLongPress={onToggleSelect}
      style={({ pressed }) => [styles.row, { backgroundColor: selected ? color.primaryTint : pressed ? color.canvas : color.paper }]}
    >
      {onToggleSelect && selected !== undefined ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={`Select ${invoice.number}`}
          onPress={onToggleSelect}
          style={styles.select}
        >
          <View style={[styles.box, { backgroundColor: selected ? color.primary : color.paper, borderColor: selected ? color.primary : color.ink3 }]}>
            {selected ? <Icon name="check" size={14} color={color.onPrimary} /> : null}
          </View>
        </Pressable>
      ) : null}
      <View style={styles.main}>
        <Text variant="section" numberOfLines={1}>
          {clientName}
        </Text>
        <Text variant="bodySm" tone={sub.attention ? 'attention' : 'ink2'} numberOfLines={1}>
          <Text variant="monoSm" tone={sub.attention ? 'attention' : 'ink2'}>
            {invoice.number}
          </Text>
          {` · ${sub.text}`}
        </Text>
      </View>
      <View style={styles.right}>
        <Amount cents={invoice.totalCents} strike={invoice.status === 'VOID'} />
        <StatusChip status={invoice.status} />
      </View>
      {onMenu ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${invoice.number}`} onPress={onMenu} style={styles.menu} hitSlop={4}>
          <Icon name="kebab" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    paddingVertical: space[3],
    paddingLeft: space[4],
    paddingRight: space[2],
    gap: space[2],
    borderBottomWidth: 1,
    borderBottomColor: color.lineSoft,
  },
  main: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: space[1] },
  menu: { width: controlHeight, height: controlHeight, alignItems: 'center', justifyContent: 'center' },
  select: { width: 32, height: controlHeight, justifyContent: 'center' },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
