import { useEffect, useState } from 'react';
import { api } from '../../state/api';
import { isApiError } from '../../api/errors';
import type { Client } from '../../domain/types';
import { displayPhone, formatPhoneInput, normalisePhone } from '../../domain/phone';
import { Sheet } from '../../ui/Sheet';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { Toggle } from '../../ui/Blocks';

/**
 * M-1 Add client (and edit). Four fields. A duplicate email offers to select
 * the existing client instead.
 */
export function ClientSheet({
  visible,
  onClose,
  onSaved,
  initialName,
  editing,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: (c: Client) => void;
  initialName?: string;
  editing?: Client | null;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [reminders, setReminders] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? initialName ?? '');
    setEmail(editing?.email ?? '');
    setPhone(editing?.phone ? displayPhone(editing.phone) : '');
    setNotes(editing?.notes ?? '');
    setReminders(editing?.remindersEnabled ?? true);
    setErrors({});
    setDup(null);
  }, [visible, editing, initialName]);

  const save = async () => {
    setBusy(true);
    setErrors({});
    setDup(null);
    try {
      const input = { name, email: email.trim() || null, phone: phone.trim() || null, notes: notes || null, remindersEnabled: reminders };
      const c = editing ? await api.updateClient(editing.id, input) : await api.createClient(input);
      onSaved(c);
    } catch (e) {
      if (isApiError(e, 'CLIENT_EMAIL_TAKEN')) {
        setDup({ id: String(e.meta.existingId), name: String(e.meta.existingName) });
        setErrors({ email: 'You already have a client with this email' });
      } else if (isApiError(e, 'VALIDATION') && e.details) setErrors(e.details);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit client' : 'Add client'}
      footer={
        <>
          <Button label={editing ? 'Save client' : 'Add client'} kind="primary" full onPress={save} disabled={!name.trim()} loading={busy} />
          <Button label="Cancel" kind="text" full onPress={onClose} />
        </>
      }
    >
      <Field label="Name" value={name} onChangeText={setName} error={errors.name} autoCapitalize="words" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        onBlur={() => setEmail((v) => v.trim().toLowerCase())}
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.email}
        hint={editing ? 'Changing this doesn’t change invoices already sent — resend them if needed.' : 'Where the invoice is sent'}
      />
      {dup ? (
        <Button
          label={`Use ${dup.name} instead`}
          onPress={async () => {
            const r = await api.getClient(dup.id);
            onSaved(r.client);
          }}
        />
      ) : null}
      <Field
        label="Phone"
        optional
        value={phone}
        onChangeText={(t) => setPhone(formatPhoneInput(t))}
        onBlur={() => setErrors((e) => ({ ...e, phone: phone && !normalisePhone(phone).ok ? 'Enter a phone number starting 07 or 01' : '' }))}
        keyboardType="phone-pad"
        mono
        error={errors.phone || null}
        hint="Pre-fills the M-Pesa number when they pay"
      />
      <Field label="Note" optional value={notes} onChangeText={setNotes} multiline hint="Private to you — never on the invoice" />
      {editing ? <Toggle label="Automatic reminders" hint="Turn off for clients you’d rather chase yourself" value={reminders} onChange={setReminders} /> : null}
      {!editing ? <Text variant="bodySm">You can add more details later.</Text> : null}
    </Sheet>
  );
}
