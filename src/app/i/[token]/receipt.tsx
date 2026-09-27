import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../../state/api';
import { useResource } from '../../../state/useResource';
import { formatDateTime } from '../../../domain/dates';
import { formatKes } from '../../../domain/money';
import { Text } from '../../../ui/Text';
import { Button } from '../../../ui/Button';
import { Card, ReceiptBlock, Skeleton } from '../../../ui/Blocks';
import { useToast } from '../../../ui/Toast';
import { SenderHeader } from '../../../features/invoice/SenderHeader';
import { InvoiceBody } from '../../../features/invoice/InvoiceDocument';
import { sharePdf } from '../../../features/invoice/pdf';
import { color, space } from '../../../ui/tokens';

/** P-8 Receipt — the link in the receipt email; the receipt exactly as the PDF renders it. */
export default function ReceiptPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const toast = useToast();
  const res = useResource(() => api.getPublicInvoice(token), [token]);
  const inv = res.data?.kind === 'ok' ? res.data.invoice : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.paper }}>
      <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: space[7] }}>
        <View style={{ maxWidth: 480, width: '100%', alignSelf: 'center', gap: space[5] }}>
          {res.loading ? (
            <Skeleton rows={3} height={96} />
          ) : !inv || !inv.paid ? (
            <Card style={{ gap: space[3] }}>
              <Text variant="title">There’s no receipt for this invoice yet</Text>
              <Button label="Back to invoice" onPress={() => router.replace(`/i/${token}`)} />
            </Card>
          ) : (
            <>
              <SenderHeader name={inv.business.name} logoUri={inv.business.logoUri} sub={`Receipt for ${inv.number}`} />
              <ReceiptBlock
                code={inv.paid.mpesaReceiptNumber ?? 'Recorded by sender'}
                label={inv.paid.mpesaReceiptNumber ? 'M-PESA RECEIPT' : 'PAYMENT'}
                amountLine={`${formatKes(inv.paid.amountCents)}${inv.paid.payerPhone ? ` from ${inv.paid.payerPhone}` : ''}`}
                when={formatDateTime(inv.paid.paidAt)}
              />
              <InvoiceBody inv={inv} />
              <Button label="Download PDF" kind="primary" full onPress={() => void sharePdf(inv, 'receipt').catch(() => toast.show('The PDF didn’t generate. Try again', { kind: 'error' }))} />
              <Button label="Back to invoice" kind="text" onPress={() => router.replace(`/i/${token}`)} />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
