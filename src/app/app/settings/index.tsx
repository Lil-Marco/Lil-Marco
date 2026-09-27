import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '../../../state/session';
import { Screen } from '../../../ui/Screen';
import { Card } from '../../../ui/Blocks';
import { Icon } from '../../../ui/Icon';
import { Text } from '../../../ui/Text';
import { color, space } from '../../../ui/tokens';
import { SETTINGS_TABS } from '../../../features/settings/tabs';


/** D-9 Settings. Each tab saves independently; nothing here autosaves. */
export default function Settings() {
  const { me } = useSession();
  return (
    <Screen title="Settings">
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {SETTINGS_TABS.map((t) => (
          <Pressable
            key={t.tab}
            accessibilityRole="link"
            onPress={() => router.push(`/app/settings/${t.tab}`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', padding: space[4], gap: space[3], minHeight: 64, backgroundColor: pressed ? color.canvas : color.paper, borderBottomWidth: 1, borderBottomColor: color.lineSoft })}
          >
            <View style={{ flex: 1 }}>
              <Text variant="section">{t.label}</Text>
              <Text variant="bodySm">
                {t.tab === 'mpesa' ? (me?.mpesa.status === 'ACTIVE' ? `Connected · ${me.mpesa.shortcode}` : me?.mpesa.status === 'INVALID' ? 'Keys rejected — needs attention' : 'Not connected') : t.tab === 'billing' ? `${me?.user.plan === 'FREE' ? 'Free' : 'Pro'} plan` : t.sub}
              </Text>
            </View>
            <Icon name="chevronRight" />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
