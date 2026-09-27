import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../../../state/api';
import { useSession } from '../../../../state/session';
import { useResource } from '../../../../state/useResource';
import { Screen } from '../../../../ui/Screen';
import { Button } from '../../../../ui/Button';
import { Segmented, Skeleton } from '../../../../ui/Blocks';
import { useToast } from '../../../../ui/Toast';
import { docFromDetail } from '../../../../features/invoice/doc';
import { sharePdf } from '../../../../features/invoice/pdf';
import { InvoiceSheetPreview } from '../../../../features/invoice/InvoiceDocument';
import { PublicInvoiceView } from '../../../../features/pay/PublicInvoiceView';
import { SendFlow, type SendStage } from '../../../../features/invoice/SendFlow';
import { ClientSheet } from '../../../../features/clients/ClientSheet';
import { space } from '../../../../ui/tokens';

/**
 * D-4 Preview — the invoice exactly as the client will see P-1, with a
 * phone / document toggle because most clients open it on a phone.
 */
export default function Preview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const toast = useToast();
  const detail = useResource(() => api.getInvoice(id), [id]);
  const [mode, setMode] = useState<'phone' | 'document'>('phone');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<SendStage>(null);
  const [clientSheet, setClientSheet] = useState(false);

  const doc = detail.data ? { ...docFromDetail(detail.data, me!.profile), status: 'SENT' as const } : null;

  return (
    <Screen
      title="Preview"
      footer={
        <>
          <Button label="Looks good, send" kind="primary" full disabled={!detail.data} onPress={() => setStage('confirm')} />
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button label="Back to editing" kind="text" small onPress={() => router.back()} />
            <Button
              label="Download PDF"
              kind="text"
              small
              loading={busy}
              onPress={async () => {
                if (!doc) return;
                setBusy(true);
                try {
                  await sharePdf(doc);
                } catch {
                  toast.show('The PDF didn’t generate. Try again', { kind: 'error' });
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        </>
      }
    >
      <Segmented
        label="Preview as"
        options={[
          { value: 'phone', label: 'Phone' },
          { value: 'document', label: 'Document' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {!doc ? <Skeleton rows={3} height={120} /> : mode === 'phone' ? <PublicInvoiceView inv={doc} preview /> : <InvoiceSheetPreview inv={doc} />}
      <SendFlow
        stage={stage}
        setStage={setStage}
        invoice={detail.data?.invoice ?? null}
        client={detail.data?.client ?? null}
        onEditClient={() => {
          setStage(null);
          setClientSheet(true);
        }}
        onValidation={() => router.replace(`/app/invoices/${id}/edit`)}
      />
      <ClientSheet
        visible={clientSheet}
        editing={detail.data?.client}
        onClose={() => setClientSheet(false)}
        onSaved={() => {
          setClientSheet(false);
          void detail.refetch();
        }}
      />
    </Screen>
  );
}
