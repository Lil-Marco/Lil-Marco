import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../state/api';
import { useSession } from '../../state/session';
import type { SimScenario } from '../../api/types';
import { Screen, ConfirmDialog } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { Card, SectionTitle } from '../../ui/Blocks';
import { Text } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import { color, radius, space } from '../../ui/tokens';

const SCENARIOS: { value: SimScenario; label: string; body: string }[] = [
  { value: 'SUCCESS', label: 'Payer approves', body: 'The callback arrives and the invoice flips to Paid.' },
  { value: 'WRONG_PIN', label: 'Wrong PIN', body: 'Result code 2001.' },
  { value: 'CANCELLED', label: 'Payer cancels the prompt', body: 'Result code 1032.' },
  { value: 'INSUFFICIENT', label: 'Not enough balance', body: 'Result code 1.' },
  { value: 'UNREACHABLE', label: 'Phone unreachable', body: 'Result code 1037.' },
  { value: 'SYSTEM', label: 'Unknown M-Pesa error', body: 'An unmapped code — shown as “something went wrong on M-Pesa’s side”.' },
  { value: 'NO_RESPONSE', label: 'Prompt ignored', body: 'No callback. The payer’s screen times out at 120 s.' },
  { value: 'LATE_SUCCESS', label: 'Paid, but the callback is lost', body: 'The reconciliation sweeper recovers it after 90 s.' },
  { value: 'DUPLICATE_CALLBACK', label: 'Safaricom sends the callback twice', body: 'Exactly one payment is recorded.' },
];

/** Controls for the built-in Daraja simulator. Not part of the product; only in simulator builds. */
export default function Simulator() {
  const toast = useToast();
  const { signOut } = useSession();
  const [sim, setSim] = useState(() => api.getSim?.() ?? { scenario: 'SUCCESS' as SimScenario, callbackDelayMs: 6000 });
  const [reset, setReset] = useState(false);

  const update = (s: typeof sim) => {
    setSim(s);
    api.setSim?.(s);
  };

  if (!api.getSim) {
    return (
      <Screen title="Simulator">
        <Text variant="body">This build talks to a real server.</Text>
      </Screen>
    );
  }

  return (
    <Screen title="M-Pesa simulator">
      <Text variant="body">This build has no server and no Safaricom connection. Choose what happens on the next STK Push — for your clients’ payments, your KES 1 test and the Pro upgrade.</Text>
      <SectionTitle>Next payment</SectionTitle>
      <View style={{ gap: space[2] }}>
        {SCENARIOS.map((s) => {
          const on = sim.scenario === s.value;
          return (
            <Pressable
              key={s.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => update({ ...sim, scenario: s.value })}
              style={{ borderRadius: radius.md, borderWidth: on ? 2 : 1, borderColor: on ? color.primary : color.line, backgroundColor: on ? color.primaryTint : color.paper, padding: space[3], minHeight: 56 }}
            >
              <Text variant="section">{s.label}</Text>
              <Text variant="bodySm">{s.body}</Text>
            </Pressable>
          );
        })}
      </View>
      <SectionTitle>How long M-Pesa takes</SectionTitle>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {[3000, 6000, 15000].map((ms) => (
          <Button key={ms} label={`${ms / 1000}s`} kind={sim.callbackDelayMs === ms ? 'primary' : 'secondary'} small onPress={() => update({ ...sim, callbackDelayMs: ms })} />
        ))}
      </View>
      <Card style={{ gap: space[2] }}>
        <Text variant="section">Try it as your client would</Text>
        <Text variant="bodySm">Open any sent invoice and tap “Open what your client sees”. That’s the page behind the link your client gets.</Text>
      </Card>
      <Button label="Erase all simulator data" kind="dangerText" onPress={() => setReset(true)} />
      <ConfirmDialog
        visible={reset}
        title="Erase all simulator data?"
        body="Every account, client, invoice and payment on this phone is deleted."
        confirmLabel="Erase everything"
        onClose={() => setReset(false)}
        onConfirm={async () => {
          await api.resetAll?.();
          await signOut().catch(() => undefined);
          setReset(false);
          toast.show('Simulator reset');
          router.replace('/login');
        }}
      />
    </Screen>
  );
}
