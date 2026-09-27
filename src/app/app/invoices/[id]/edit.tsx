import { useLocalSearchParams } from 'expo-router';
import { Composer } from '../../../../features/invoice/Composer';

/** D-3 in edit mode. An invoice with a completed payment redirects to D-5. */
export default function EditInvoice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Composer invoiceId={id} />;
}
