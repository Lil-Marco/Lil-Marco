import { router } from 'expo-router';
import { View } from 'react-native';
import { useSession } from '../../state/session';
import { AuthShell } from '../../features/auth/AuthShell';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { space } from '../../ui/tokens';

/** A-10 You're ready — never reachable again; two options, no third. */
export default function Ready() {
  const { me } = useSession();
  const m = me!.mpesa;
  return (
    <AuthShell title="You’re ready to get paid">
      <View style={{ gap: space[1] }}>
        <Text variant="body">M-Pesa is connected. Clients will pay straight to your {m.shortcodeType === 'PAYBILL' ? 'paybill' : 'till'}:</Text>
        <Text variant="mono" selectable>
          {m.shortcode}
        </Text>
      </View>
      <Button label="Create your first invoice" kind="primary" full onPress={() => router.replace('/app/invoices/new')} />
      <Button label="Go to dashboard" full onPress={() => router.replace('/app')} />
    </AuthShell>
  );
}
