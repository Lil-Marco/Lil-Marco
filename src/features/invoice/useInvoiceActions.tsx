import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { api } from '../../state/api';
import { errorMessage } from '../../state/useResource';
import type { Invoice } from '../../domain/types';
import { availableActions, type InvoiceAction } from '../../domain/invoiceRules';
import { todayEat, formatDate } from '../../domain/dates';
import { formatKes } from '../../domain/money';
import { ConfirmDialog, type MenuItem } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { Checkbox, Segmented } from '../../ui/Blocks';
import { Text } from '../../ui/Text';
import { useToast } from '../../ui/Toast';
import { space } from '../../ui/tokens';

const LABELS: Record<InvoiceAction, string> = {
  view: 'View',
  edit: 'Edit',
  copyLink: 'Copy link',
  remind: 'Send reminder',
  duplicate: 'Duplicate',
  markPaid: 'Mark as paid',
  void: 'Void invoice',
  delete: 'Delete',
};

const METHODS = ['Cash', 'Bank transfer', 'M-Pesa sent directly'] as const;

/**
 * Shared invoice actions for D-2 row menus and D-5: M-4 confirm delete,
 * M-5 mark as paid manually, M-6 void. Every destructive confirm names the invoice.
 */
export function useInvoiceActions(onDone?: () => void) {
  const toast = useToast();
  const [target, setTarget] = useState<{ inv: Invoice; kind: 'delete' | 'void' | 'markPaid' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useState(true);
  const [method, setMethod] = useState<(typeof METHODS)[number]>('Cash');
  const [date, setDate] = useState(todayEat());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.show(success);
      setTarget(null);
      onDone?.();
    } catch (e) {
      toast.show(errorMessage(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const perform = async (inv: Invoice, action: InvoiceAction) => {
    switch (action) {
      case 'view':
        router.push(`/app/invoices/${inv.id}`);
        break;
      case 'edit':
        router.push(`/app/invoices/${inv.id}/edit`);
        break;
      case 'copyLink':
        await Clipboard.setStringAsync(api.publicLink(inv));
        toast.show('Link copied');
        break;
      case 'remind':
        try {
          await api.remind(inv.id);
          toast.show('Reminder sent');
          onDone?.();
        } catch (e) {
          toast.show(errorMessage(e), { kind: 'error' });
        }
        break;
      case 'duplicate':
        try {
          const copy = await api.duplicateInvoice(inv.id);
          router.push(`/app/invoices/${copy.id}/edit`);
        } catch (e) {
          toast.show(errorMessage(e), { kind: 'error' });
        }
        break;
      case 'markPaid':
        setDate(todayEat());
        setReference('');
        setNote('');
        setDateError(null);
        setTarget({ inv, kind: 'markPaid' });
        break;
      case 'void':
        setNotify(true);
        setTarget({ inv, kind: 'void' });
        break;
      case 'delete':
        setTarget({ inv, kind: 'delete' });
        break;
    }
  };

  const menuFor = (inv: Invoice): MenuItem[] =>
    availableActions(inv).map((a) => ({ label: LABELS[a], onPress: () => void perform(inv, a), destructive: a === 'void' || a === 'delete' }));

  const modals = (
    <>
      <ConfirmDialog
        visible={target?.kind === 'delete'}
        title={`Delete invoice ${target?.inv.number ?? ''}?`}
        body="The draft is removed for good. Its number is not reused."
        confirmLabel="Delete draft"
        busy={busy}
        onClose={() => setTarget(null)}
        onConfirm={() => target && run(() => api.deleteDraft(target.inv.id), 'Draft deleted')}
      />
      <ConfirmDialog
        visible={target?.kind === 'void'}
        title={`Void invoice ${target?.inv.number ?? ''}?`}
        body="The payment link stops working straight away and reminders stop. Voiding can’t be undone."
        confirmLabel="Void invoice"
        busy={busy}
        onClose={() => setTarget(null)}
        onConfirm={() => target && run(() => api.voidInvoice(target.inv.id, notify), `${target.inv.number} voided`)}
      >
        <Checkbox label="Let the client know" hint="Sends a short cancellation email" checked={notify} onChange={setNotify} />
      </ConfirmDialog>
      <Sheet
        visible={target?.kind === 'markPaid'}
        onClose={() => setTarget(null)}
        title={`Mark ${target?.inv.number ?? ''} as paid`}
        footer={
          <>
            <Button
              label="Mark as paid"
              kind="primary"
              full
              loading={busy}
              onPress={() => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayEat()) {
                  setDateError('Enter a date like 2026-10-06, not in the future');
                  return;
                }
                if (target) void run(() => api.markPaidManually(target.inv.id, { method, date, reference, note }), `${target.inv.number} marked as paid`);
              }}
            />
            <Button label="Cancel" kind="text" full onPress={() => setTarget(null)} />
          </>
        }
      >
        {target ? (
          <Text variant="body">
            Record {formatKes(target.inv.totalCents - target.inv.amountPaidCents)} received outside the payment link. This doesn’t check anything with Safaricom.
          </Text>
        ) : null}
        <View style={{ gap: space[2] }}>
          <Text variant="label">How were you paid?</Text>
          <Segmented label="Payment method" options={METHODS.map((m) => ({ value: m, label: m === 'M-Pesa sent directly' ? 'M-Pesa direct' : m }))} value={method} onChange={setMethod} />
        </View>
        <Field label="Date received" value={date} onChangeText={setDate} mono hint={date.match(/^\d{4}-\d{2}-\d{2}$/) ? formatDate(date) : 'YYYY-MM-DD'} error={dateError} />
        <Field label="Reference" optional value={reference} onChangeText={setReference} mono autoCapitalize="characters" />
        <Field label="Note" optional value={note} onChangeText={setNote} multiline />
      </Sheet>
    </>
  );

  return { menuFor, perform, modals };
}
