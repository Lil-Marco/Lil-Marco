import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../../state/api';
import { useSession } from '../../../state/session';
import { useResource } from '../../../state/useResource';
import { formatDate, formatDateTime, nextPeriodStartLabel } from '../../../domain/dates';
import { formatKes, formatKesShort } from '../../../domain/money';
import { FREE_MONTHLY_LIMIT, PRO_PRICE_CENTS } from '../../../domain/plan';
import { Screen, ConfirmDialog } from '../../../ui/Screen';
import { Button } from '../../../ui/Button';
import { Banner, Card, Row, SectionTitle, Skeleton } from '../../../ui/Blocks';
import { Text } from '../../../ui/Text';
import { useToast } from '../../../ui/Toast';
import { color, radius, space } from '../../../ui/tokens';

/** D-10 Plan and billing. Nothing is ever held hostage behind a plan — the cap is on new sends only. */
export default function Billing() {
  const res = useResource(() => api.billing(), []);
  const { refreshMe } = useSession();
  const toast = useToast();
  const [cancel, setCancel] = useState(false);

  if (res.loading || !res.data) {
    return (
      <Screen title="Plan and billing">
        <Skeleton rows={3} height={120} />
      </Screen>
    );
  }
  const { subscription: sub, usage, charges } = res.data;
  const onFree = sub.plan === 'FREE';

  return (
    <Screen title="Plan and billing" onRefresh={res.refetch} refreshing={res.refreshing}>
      {sub.status === 'PAST_DUE' ? (
        <Banner title="We couldn’t collect your subscription." body="Everything keeps working during the grace period." action="Retry payment" onAction={() => router.push({ pathname: '/app/settings/upgrade', params: { plan: 'PRO' } })} />
      ) : null}

      <Card style={{ gap: space[2], borderColor: color.primary, borderWidth: 2 }}>
        <Text variant="micro">Your plan</Text>
        <Text variant="title">{onFree ? 'Free' : 'Pro'}</Text>
        {onFree ? (
          <>
            <Text variant="body">
              {usage.invoicesSent} of {FREE_MONTHLY_LIMIT} invoices sent this month. Resets on {nextPeriodStartLabel()}.
            </Text>
            <View style={{ height: 6, borderRadius: radius.full, backgroundColor: color.lineSoft, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, (usage.invoicesSent / FREE_MONTHLY_LIMIT) * 100)}%`, height: 6, backgroundColor: usage.invoicesSent >= FREE_MONTHLY_LIMIT ? color.attention : color.primary }} />
            </View>
          </>
        ) : (
          <Text variant="body">
            {formatKes(PRO_PRICE_CENTS)} a month ·{' '}
            {sub.cancelAtPeriodEnd && sub.currentPeriodEnd ? `Ends ${formatDate(sub.currentPeriodEnd.slice(0, 10))}, then Free` : sub.currentPeriodEnd ? `Renews ${formatDate(sub.currentPeriodEnd.slice(0, 10))}` : ''}
          </Text>
        )}
        <Text variant="bodySm">Free includes the M-Pesa pay link, clients, drafts, receipts and reminders.</Text>
      </Card>

      <Card style={{ gap: space[2] }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="section">Pro</Text>
          <Text variant="section" tabular>
            {formatKesShort(PRO_PRICE_CENTS)} / month
          </Text>
        </Row>
        <Text variant="bodySm">Unlimited invoices. Paid by M-Pesa, like your clients pay you.</Text>
        {onFree || sub.status === 'PAST_DUE' ? <Button label={sub.status === 'PAST_DUE' ? 'Retry payment' : 'Upgrade to Pro'} kind="primary" onPress={() => router.push({ pathname: '/app/settings/upgrade', params: { plan: 'PRO' } })} /> : <Text variant="label" tone="primary">Current plan</Text>}
      </Card>

      <Card style={{ gap: space[2] }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="section">Business</Text>
          <Text variant="bodySm">Coming later</Text>
        </Row>
        <Text variant="bodySm">Team members, recurring invoices and reports.</Text>
      </Card>

      {!onFree && !sub.cancelAtPeriodEnd ? <Button label="Cancel subscription" kind="dangerText" onPress={() => setCancel(true)} /> : null}

      <SectionTitle>Our receipts</SectionTitle>
      <Card style={{ gap: space[2] }}>
        {charges.length === 0 ? (
          <Text variant="bodySm">No charges yet.</Text>
        ) : (
          charges.map((c) => (
            <Row key={c.id} style={{ justifyContent: 'space-between' }}>
              <View>
                <Text variant="bodySm" tone="ink">
                  Pro · {formatDateTime(c.paidAt)}
                </Text>
                <Text variant="monoSm" selectable>
                  {c.mpesaReceiptNumber}
                </Text>
              </View>
              <Text variant="bodySm" tone="ink" tabular>
                {formatKes(c.amountCents)}
              </Text>
            </Row>
          ))
        )}
      </Card>

      <ConfirmDialog
        visible={cancel}
        title="Cancel your Pro subscription?"
        body={`Pro keeps running until ${sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd.slice(0, 10)) : 'the end of the period'}. Then your account drops to Free and the ${FREE_MONTHLY_LIMIT}-invoice monthly cap returns. You keep all your data, and invoices you’ve sent stay payable.`}
        confirmLabel="Cancel subscription"
        onClose={() => setCancel(false)}
        onConfirm={async () => {
          await api.cancelSubscription();
          await refreshMe();
          setCancel(false);
          toast.show('Subscription cancelled');
          void res.refetch();
        }}
      />
    </Screen>
  );
}
