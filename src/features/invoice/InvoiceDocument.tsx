import { StyleSheet, View } from 'react-native';
import type { PublicInvoice } from '../../domain/types';
import { formatDate } from '../../domain/dates';
import { formatKesDigits, formatQuantity } from '../../domain/money';
import { Amount } from '../../ui/Amount';
import { Text } from '../../ui/Text';
import { Divider, KeyValue } from '../../ui/Blocks';
import { SenderHeader } from './SenderHeader';
import { color, space } from '../../ui/tokens';

/**
 * The line items, totals and notes of an invoice — the part below the fold on
 * P-1, the body of D-4 and the composer preview. The PDF renders from the
 * same data (features/invoice/pdf.ts).
 */
export function InvoiceBody({ inv }: { inv: PublicInvoice }) {
  return (
    <View style={{ gap: space[4] }}>
      <View style={{ gap: space[2] }}>
        <Text variant="micro">What this is for</Text>
        {inv.lineItems.map((l, i) => (
          <View key={i} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text variant="bodySm" tone="ink">
                {l.description || 'Item'}
              </Text>
              <Text variant="bodySm" tabular>
                {formatQuantity(l.quantityMilli)} × {formatKesDigits(l.unitPriceCents)}
              </Text>
            </View>
            <Text variant="bodySm" tone="ink" tabular>
              {formatKesDigits(l.lineTotalCents)}
            </Text>
          </View>
        ))}
      </View>
      <Divider />
      <View style={{ gap: space[1] }}>
        <KeyValue k="Subtotal" v={formatKesDigits(inv.subtotalCents)} />
        {inv.discountCents > 0 ? <KeyValue k="Discount" v={`−${formatKesDigits(inv.discountCents)}`} /> : null}
        {inv.taxCents > 0 ? <KeyValue k={`VAT ${inv.taxRateBp / 100}%`} v={formatKesDigits(inv.taxCents)} /> : null}
        <KeyValue k="Total" v={<Amount cents={inv.totalCents} />} strong />
      </View>
      {inv.notes ? (
        <View style={{ gap: space[1] }}>
          <Text variant="micro">Note</Text>
          <Text variant="bodySm">{inv.notes}</Text>
        </View>
      ) : null}
      {inv.terms ? (
        <View style={{ gap: space[1] }}>
          <Text variant="micro">Terms</Text>
          <Text variant="bodySm">{inv.terms}</Text>
        </View>
      ) : null}
      <View style={{ gap: space[1] }}>
        <Text variant="micro">From</Text>
        <Text variant="bodySm" tone="ink">
          {inv.business.name}
        </Text>
        {inv.business.location ? <Text variant="bodySm">{inv.business.location}</Text> : null}
        {inv.business.phone ? <Text variant="monoSm">{inv.business.phone}</Text> : null}
        {inv.business.email ? <Text variant="bodySm">{inv.business.email}</Text> : null}
        {inv.business.kraPin ? <Text variant="monoSm">KRA PIN {inv.business.kraPin}</Text> : null}
      </View>
    </View>
  );
}

/** Compact, PDF-like rendering for the composer and D-4 previews. */
export function InvoiceSheetPreview({ inv }: { inv: PublicInvoice }) {
  return (
    <View style={styles.paper}>
      <SenderHeader name={inv.business.name} logoUri={inv.business.logoUri} sub={inv.business.location} size={36} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View>
          <Text variant="micro">Invoice</Text>
          <Text variant="monoSm" tone="ink">
            {inv.number}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="micro">Billed to</Text>
          <Text variant="bodySm" tone="ink">
            {inv.billedTo.name || '—'}
          </Text>
        </View>
      </View>
      <View>
        <Text variant="micro">Amount due</Text>
        <Amount cents={inv.amountDueCents} size="lg" />
        <Text variant="bodySm">Due {formatDate(inv.dueDate)}</Text>
      </View>
      <InvoiceBody inv={inv} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  paper: { backgroundColor: color.paper, borderRadius: 14, borderWidth: 1, borderColor: color.line, padding: space[5], gap: space[4] },
});
