import { useCallback } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../../state/api';
import { useResource } from '../../../state/useResource';
import { PublicInvoiceView } from '../../../features/pay/PublicInvoiceView';
import { Text } from '../../../ui/Text';
import { Button } from '../../../ui/Button';
import { ErrorState } from '../../../ui/Blocks';
import { color, space } from '../../../ui/tokens';

/**
 * /i/:token — the client's page. No session, no navigation, no account prompt.
 * Token validity is the only check.
 */
export default function PublicInvoiceScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const res = useResource(() => api.getPublicInvoice(token), [token]);
  const reload = useCallback(async () => {
    const r = await api.getPublicInvoice(token);
    return r.kind === 'ok' ? r.invoice : null;
  }, [token]);

  if (res.loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.paper }}>
        <ActivityIndicator color={color.primary} />
      </View>
    );
  }
  if (res.error || !res.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: color.paper, justifyContent: 'center' }}>
        <ErrorState message="This invoice didn’t load. Check your connection." onRetry={res.refetch} />
      </SafeAreaView>
    );
  }
  if (res.data.kind === 'invalid') {
    const d = res.data;
    // P-7: one line, the sender if we can resolve it, a contact link. Never an amount.
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: color.paper, justifyContent: 'center' }}>
        <View style={{ padding: space[5], gap: space[4], maxWidth: 480, alignSelf: 'center', width: '100%' }}>
          <Text variant="title">This invoice link isn’t valid any more</Text>
          {d.businessName ? <Text variant="body">If you think this is a mistake, contact {d.businessName}.</Text> : <Text variant="body">If you think this is a mistake, contact whoever sent it.</Text>}
          {d.contactEmail ? <Button label={`Email ${d.businessName ?? 'the sender'}`} onPress={() => Linking.openURL(`mailto:${d.contactEmail}`)} /> : null}
          {d.contactPhone ? <Button label={`Call ${d.contactPhone}`} kind="text" onPress={() => Linking.openURL(`tel:${d.contactPhone!.replace(/\s/g, '')}`)} /> : null}
        </View>
      </SafeAreaView>
    );
  }
  return <PublicInvoiceView inv={res.data.invoice} token={token} onReload={reload} />;
}
