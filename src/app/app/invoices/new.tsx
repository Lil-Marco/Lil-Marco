import { useLocalSearchParams } from 'expo-router';
import { Composer } from '../../../features/invoice/Composer';

/** D-3 — new invoice, optionally pre-filled for a client (from D-7). */
export default function NewInvoice() {
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  return <Composer presetClientId={clientId} />;
}
