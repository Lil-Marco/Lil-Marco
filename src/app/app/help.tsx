import { Linking, View } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import { Card, SectionTitle } from '../../ui/Blocks';
import { Text } from '../../ui/Text';
import { space } from '../../ui/tokens';

const FAQ: [string, string][] = [
  ['How does my client pay?', 'They open the link, tap Pay with M-Pesa, enter their number and approve the prompt on their phone with their PIN. The money goes straight to your till or paybill — we never hold it.'],
  ['A client says they paid but the invoice shows unpaid.', 'M-Pesa sometimes confirms late. We check every pending payment again within a few minutes, and the invoice updates by itself. If they paid your till directly instead of through the link, use Mark as paid on the invoice.'],
  ['A client paid twice.', 'Both payments are recorded and the invoice shows a banner with the second receipt code. Refund them from your M-Pesa account, then mark the banner as resolved.'],
  ['Why did my keys stop working?', 'Safaricom occasionally rotates the passkey, or an app is still in sandbox. Go to Settings › M-Pesa › Update keys and paste fresh ones from the Daraja portal.'],
  ['When do reminders go out?', 'By default 3 days before the due date, on the day, and 3, 7 and 14 days after — only between 8 AM and 6 PM, never more than once a day, and never after the invoice is paid.'],
];

/** D-12 Help and support. */
export default function Help() {
  return (
    <Screen title="Help and support">
      {FAQ.map(([q, a]) => (
        <Card key={q} style={{ gap: space[2] }}>
          <Text variant="section">{q}</Text>
          <Text variant="body">{a}</Text>
        </Card>
      ))}
      <SectionTitle>Still need help?</SectionTitle>
      <View style={{ gap: space[2] }}>
        <Button label="Email support" kind="primary" onPress={() => Linking.openURL('mailto:support@invoicempesa.co.ke')} />
        <Text variant="bodySm">We reply within one working day, 8 AM – 6 PM EAT.</Text>
      </View>
    </Screen>
  );
}
