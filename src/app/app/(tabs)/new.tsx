import { Redirect } from 'expo-router';

/** The centre slot opens D-3 directly; this route only exists to hold the slot. */
export default function NewSlot() {
  return <Redirect href="/app/invoices/new" />;
}
