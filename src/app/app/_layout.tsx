import { useEffect } from 'react';
import { Redirect, Stack, router, usePathname } from 'expo-router';
import { api } from '../../state/api';
import { useSession } from '../../state/session';
import { useToast } from '../../ui/Toast';
import { formatKesShort } from '../../domain/money';
import { guardApp } from '../../state/guards';
import { color } from '../../ui/tokens';

export default function AppLayout() {
  const { me } = useSession();
  const pathname = usePathname();
  const toast = useToast();

  // A payment landing while the app is open raises a toast wherever the freelancer is.
  useEffect(
    () =>
      api.subscribe((e) => {
        if (e.type === 'payment_received') {
          toast.show(`${e.clientName} paid ${formatKesShort(e.amountCents)}`, { action: { label: 'View', onPress: () => router.push(`/app/invoices/${e.invoiceId}`) } });
        }
      }),
    [toast],
  );

  const redirect = guardApp(me, pathname);
  if (redirect) return <Redirect href={redirect} />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="invoices/[id]/preview" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}
