import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { api } from '../../../state/api';
import { useSession } from '../../../state/session';
import { errorMessage, useResource } from '../../../state/useResource';
import { isApiError } from '../../../api/errors';
import type { NotificationPrefs, ReminderRule } from '../../../domain/types';
import { formatDateTime } from '../../../domain/dates';
import { Screen, ConfirmDialog } from '../../../ui/Screen';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Banner, Card, KeyValue, SectionTitle, Skeleton, Toggle } from '../../../ui/Blocks';
import { Text } from '../../../ui/Text';
import { useToast } from '../../../ui/Toast';
import { ProfileForm, draftFrom, type ProfileDraft } from '../../../features/profile/ProfileForm';
import { SETTINGS_TABS } from '../../../features/settings/tabs';
import { space } from '../../../ui/tokens';

export default function SettingsTab() {
  const { tab } = useLocalSearchParams<{ tab: string }>();
  const meta = SETTINGS_TABS.find((t) => t.tab === tab);
  if (!meta) return <Redirect href="/app/settings" />;
  const Body = { business: Business, mpesa: Mpesa, defaults: Defaults, reminders: Reminders, notifications: NotificationsTab, account: Account, billing: () => <Redirect href="/app/settings/billing" /> }[meta.tab];
  return <Body />;
}

function useSaver() {
  const toast = useToast();
  const { refreshMe } = useSession();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = async (fn: () => Promise<unknown>, msg = 'Saved') => {
    setBusy(true);
    setErrors({});
    try {
      await fn();
      await refreshMe();
      toast.show(msg);
      return true;
    } catch (e) {
      if (isApiError(e, 'VALIDATION') && e.details) setErrors(e.details);
      else toast.show(errorMessage(e), { kind: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, errors, save };
}

function Business() {
  const { me } = useSession();
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(me!.profile));
  const [email, setEmail] = useState(me!.profile.email ?? '');
  const [footer, setFooter] = useState(me!.profile.footerText);
  const { busy, errors, save } = useSaver();
  return (
    <Screen
      title="Business"
      footer={
        <Button
          label="Save business details"
          kind="primary"
          full
          loading={busy}
          disabled={!draft.businessName.trim()}
          onPress={() =>
            save(() =>
              api.updateProfile({
                businessName: draft.businessName,
                logoUri: draft.logoUri,
                phone: draft.phone || null,
                location: draft.location || null,
                kraPin: draft.kraPin || null,
                invoicePrefix: draft.invoicePrefix || 'INV-',
                email: email.trim() || null,
                footerText: footer,
              }),
            )
          }
        />
      }
    >
      <ProfileForm draft={draft} onChange={setDraft} errors={errors} prefixLocked={me!.profile.invoicesSentEver > 0} />
      <Field label="Contact email on invoices" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Invoice footer" optional value={footer} onChangeText={setFooter} multiline />
    </Screen>
  );
}

function Mpesa() {
  const { me } = useSession();
  const m = me!.mpesa;
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const live = useResource(() => api.liveUnpaidInvoiceCount(), []);
  const { refreshMe } = useSession();
  const statusText = { ACTIVE: 'Connected and working', UNVERIFIED: 'Keys saved — not tested yet', INVALID: 'Safaricom rejected your keys', DISCONNECTED: 'Not connected' }[m.status];
  return (
    <Screen title="M-Pesa">
      {m.status === 'INVALID' ? <Banner title="M-Pesa isn’t accepting your keys." body="Your clients can’t pay right now." /> : null}
      <Card style={{ gap: space[2] }}>
        <KeyValue k="Status" v={statusText} />
        <KeyValue k={m.shortcodeType === 'PAYBILL' ? 'Paybill' : 'Till'} v={m.shortcode ?? '—'} />
        {m.accountNumber ? <KeyValue k="Account number" v={m.accountNumber} /> : null}
        <KeyValue k="Last verified" v={m.lastVerifiedAt ? formatDateTime(m.lastVerifiedAt) : '—'} />
      </Card>
      {m.status === 'DISCONNECTED' ? (
        <Button label="Connect M-Pesa" kind="primary" full onPress={() => router.push({ pathname: '/onboarding/mpesa', params: { from: 'settings' } })} />
      ) : (
        <>
          <Button label="Send a test payment" kind="primary" full onPress={() => router.push({ pathname: '/onboarding/mpesa', params: { step: '4', from: 'settings' } })} />
          <Button label="Update keys" full onPress={() => router.push({ pathname: '/onboarding/mpesa', params: { step: '3', from: 'settings' } })} />
          <Button label="Disconnect M-Pesa" kind="dangerText" onPress={() => setConfirm(true)} />
        </>
      )}
      <ConfirmDialog
        visible={confirm}
        title={`Disconnect M-Pesa till ${m.shortcode ?? ''}?`}
        body={`${live.data ?? 0} unpaid invoice${live.data === 1 ? '' : 's'} you’ve already sent will stop being payable. Their links will say payment is temporarily unavailable until you reconnect.`}
        confirmLabel="Disconnect M-Pesa"
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await api.disconnectMpesa();
          await refreshMe();
          setConfirm(false);
          toast.show('M-Pesa disconnected');
        }}
      />
    </Screen>
  );
}

function Defaults() {
  const { me } = useSession();
  const p = me!.profile;
  const [terms, setTerms] = useState(String(p.paymentTermsDays));
  const [notes, setNotes] = useState(p.defaultNotes);
  const [termsLine, setTermsLine] = useState(p.defaultTerms);
  const [vat, setVat] = useState(p.vatEnabled);
  const [prefix, setPrefix] = useState(p.invoicePrefix);
  const [next, setNext] = useState(String(p.nextInvoiceNo));
  const { busy, errors, save } = useSaver();
  return (
    <Screen
      title="Invoice defaults"
      footer={
        <Button
          label="Save defaults"
          kind="primary"
          full
          loading={busy}
          onPress={() =>
            save(() =>
              api.updateProfile({
                paymentTermsDays: Number(terms) || 0,
                defaultNotes: notes,
                defaultTerms: termsLine,
                vatEnabled: vat && !!p.kraPin,
                invoicePrefix: prefix || 'INV-',
                nextInvoiceNo: Number(next) || p.nextInvoiceNo,
              }),
            )
          }
        />
      }
    >
      <Field label="Payment terms (days)" value={terms} onChangeText={(t) => setTerms(t.replace(/\D/g, ''))} keyboardType="number-pad" error={errors.paymentTermsDays} hint="New invoices are due this many days after issue" />
      <Field label="Default note to client" value={notes} onChangeText={setNotes} multiline />
      <Field label="Default terms" value={termsLine} onChangeText={setTermsLine} />
      <Toggle label="Add VAT at 16% by default" value={vat} onChange={setVat} disabled={!p.kraPin} hint={p.kraPin ? undefined : 'Add your KRA PIN under Business first'} />
      <SectionTitle>Numbering</SectionTitle>
      <Field label="Prefix" value={prefix} onChangeText={(t) => setPrefix(t.toUpperCase().slice(0, 8))} mono editable={p.invoicesSentEver === 0} hint={p.invoicesSentEver > 0 ? 'Locked after your first invoice so the sequence stays unbroken.' : undefined} />
      <Field label="Next number" value={next} onChangeText={(t) => setNext(t.replace(/\D/g, ''))} keyboardType="number-pad" mono error={errors.nextInvoiceNo} hint={`Next invoice: ${prefix}${String(Number(next) || 1).padStart(4, '0')}. Can only move forward.`} />
    </Screen>
  );
}

function Reminders() {
  const rules = useResource(() => api.getReminderRules(), []);
  const [draft, setDraft] = useState<ReminderRule[] | null>(null);
  const { busy, save } = useSaver();
  useEffect(() => {
    if (rules.data && !draft) setDraft(rules.data);
  }, [rules.data, draft]);
  const label = (o: number) => (o === 0 ? 'On the due date — “Due today”' : o < 0 ? `${-o} days before — a heads-up` : o === 14 ? '14 days after — final automatic reminder' : o === 7 ? '7 days after — firmer, restates the amount' : `${o} days after — “Just a reminder”`);
  return (
    <Screen title="Reminders" footer={<Button label="Save reminders" kind="primary" full loading={busy} disabled={!draft} onPress={() => draft && save(() => api.setReminderRules(draft))} />}>
      <Text variant="body">Reminders go out between 8 AM and 6 PM, at most one per invoice per day, and stop the moment an invoice is paid or voided. A failed payment pauses the next one for 24 hours.</Text>
      {!draft ? (
        <Skeleton rows={5} height={48} />
      ) : (
        <Card style={{ gap: space[1] }}>
          {draft.map((r) => (
            <Toggle key={r.offsetDays} label={label(r.offsetDays)} value={r.enabled} onChange={(v) => setDraft(draft.map((x) => (x.offsetDays === r.offsetDays ? { ...x, enabled: v } : x)))} />
          ))}
        </Card>
      )}
      <Text variant="bodySm">Changes apply to invoices you send from now on. You can also turn reminders off per invoice and per client.</Text>
    </Screen>
  );
}

function NotificationsTab() {
  const prefs = useResource(() => api.getNotificationPrefs(), []);
  const [p, setP] = useState<NotificationPrefs | null>(null);
  const { busy, save } = useSaver();
  useEffect(() => {
    if (prefs.data && !p) setP(prefs.data);
  }, [prefs.data, p]);
  const set = (k: keyof NotificationPrefs) => (v: boolean) => p && setP({ ...p, [k]: v });
  return (
    <Screen title="Notifications" footer={<Button label="Save notifications" kind="primary" full loading={busy} disabled={!p} onPress={() => p && save(() => api.setNotificationPrefs(p))} />}>
      {!p ? (
        <Skeleton rows={4} height={48} />
      ) : (
        <>
          <Card style={{ gap: space[1] }}>
            <SectionTitle>Payment received</SectionTitle>
            <Toggle label="Email" value={p.paymentReceivedEmail} onChange={set('paymentReceivedEmail')} />
            <Toggle label="In the app" value={p.paymentReceivedInApp} onChange={set('paymentReceivedInApp')} />
          </Card>
          <Card style={{ gap: space[1] }}>
            <SectionTitle>Invoice viewed</SectionTitle>
            <Toggle label="Email" value={p.invoiceViewedEmail} onChange={set('invoiceViewedEmail')} />
            <Toggle label="In the app" value={p.invoiceViewedInApp} onChange={set('invoiceViewedInApp')} />
          </Card>
          <Card style={{ gap: space[1] }}>
            <SectionTitle>Payment failed</SectionTitle>
            <Toggle label="Email" value={p.paymentFailedEmail} onChange={set('paymentFailedEmail')} />
            <Toggle label="In the app" value={p.paymentFailedInApp} onChange={set('paymentFailedInApp')} />
          </Card>
          <Card>
            <Toggle label="Weekly summary email" hint="Mondays at 8 AM" value={p.weeklySummaryEmail} onChange={set('weeklySummaryEmail')} />
          </Card>
        </>
      )}
    </Screen>
  );
}

function Account() {
  const { me, signOut } = useSession();
  const [name, setName] = useState(me!.user.name);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [del, setDel] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const nameSaver = useSaver();
  const pwSaver = useSaver();
  const toast = useToast();
  return (
    <Screen title="Account">
      <Card style={{ gap: space[3] }}>
        <Field label="Your name" value={name} onChangeText={setName} />
        <Field label="Email" value={me!.user.email} editable={false} hint="Contact support to change your login email" />
        <Button label="Save name" kind="primary" loading={nameSaver.busy} onPress={() => nameSaver.save(() => api.updateAccount({ name }))} />
      </Card>
      <Card style={{ gap: space[3] }}>
        <SectionTitle>Change password</SectionTitle>
        <Field label="Current password" value={current} onChangeText={setCurrent} secure error={pwSaver.errors.current} />
        <Field label="New password" value={next} onChangeText={setNext} secure error={pwSaver.errors.next} hint="At least 8 characters. Signs you out everywhere else." />
        <Button
          label="Change password"
          disabled={!current || next.length < 8}
          loading={pwSaver.busy}
          onPress={async () => {
            if (await pwSaver.save(() => api.changePassword(current, next), 'Password changed')) {
              setCurrent('');
              setNext('');
            }
          }}
        />
      </Card>
      <Card style={{ gap: space[3] }}>
        <SectionTitle>Delete account</SectionTitle>
        <Text variant="bodySm">Your clients and drafts are deleted. Invoices, payments and receipts are kept for 7 years because tax law requires it, then removed.</Text>
        <Button label="Delete account" kind="danger" onPress={() => setDel(true)} />
      </Card>
      <ConfirmDialog
        visible={del}
        title={`Delete ${me!.profile.businessName}?`}
        body="Type your business name to confirm. This can’t be undone."
        confirmLabel="Delete account"
        onClose={() => setDel(false)}
        onConfirm={async () => {
          try {
            await api.deleteAccount(confirmName);
            await signOut().catch(() => undefined);
            router.replace('/signup');
          } catch (e) {
            toast.show(errorMessage(e), { kind: 'error' });
          }
        }}
      >
        <View>
          <Field label="Business name" value={confirmName} onChangeText={setConfirmName} placeholder={me!.profile.businessName} />
        </View>
      </ConfirmDialog>
    </Screen>
  );
}
