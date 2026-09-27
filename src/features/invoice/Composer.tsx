import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../state/api';
import { useSession } from '../../state/session';
import { useResource, errorMessage } from '../../state/useResource';
import type { InvoiceInput } from '../../api/types';
import type { Client, DiscountMode, Invoice, PublicInvoice } from '../../domain/types';
import { addDays, formatDate, formatTime, todayEat } from '../../domain/dates';
import { formatKesDigits, formatQuantity, parseQuantity, tryFromKes } from '../../domain/money';
import { displayPhone } from '../../domain/phone';
import { computeTotals, VAT_BP } from '../../domain/totals';
import { Screen, ActionMenu, ConfirmDialog } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Amount } from '../../ui/Amount';
import { Banner, Card, Divider, FilterChip, KeyValue, Row, Segmented, SectionTitle, Skeleton, Toggle } from '../../ui/Blocks';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { ClientSheet } from '../clients/ClientSheet';
import { InvoiceSheetPreview } from './InvoiceDocument';
import { SendFlow, type SendStage } from './SendFlow';
import { color, radius, space } from '../../ui/tokens';

interface LineDraft {
  key: string;
  description: string;
  qty: string;
  price: string;
}

let lineSeq = 0;
const newLine = (p: Partial<LineDraft> = {}): LineDraft => ({ key: `l${++lineSeq}`, description: '', qty: '1', price: '', ...p });

function parseLines(lines: LineDraft[]) {
  return lines.map((l) => ({
    description: l.description.trim(),
    quantityMilli: parseQuantity(l.qty) ?? 1000,
    unitPriceCents: tryFromKes(l.price || '0') ?? 0,
  }));
}

/**
 * D-3 Invoice composer. Opens with everything defaulted; totals recompute on
 * blur, never on keystroke; the draft autosaves two seconds after the last
 * keystroke; sending is blocked only at the last moment.
 */
export function Composer({ invoiceId, presetClientId }: { invoiceId?: string; presetClientId?: string }) {
  const { me } = useSession();
  const toast = useToast();
  const profile = me!.profile;
  const today = todayEat();

  const existing = useResource(() => (invoiceId ? api.getInvoice(invoiceId) : Promise.resolve(null)), [invoiceId]);
  const clients = useResource(() => api.listClients({}), []);
  const nextNumber = useResource(() => api.previewNextNumber(), []);

  const [id, setId] = useState<string | null>(invoiceId ?? null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [clientId, setClientId] = useState<string | null>(presetClientId ?? null);
  const [clientQuery, setClientQuery] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, profile.paymentTermsDays));
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [committed, setCommitted] = useState<LineDraft[]>(lines);
  const [discountMode, setDiscountMode] = useState<DiscountMode>('AMOUNT');
  const [discount, setDiscount] = useState('');
  const [committedDiscount, setCommittedDiscount] = useState('');
  const [vat, setVat] = useState(profile.vatEnabled && !!profile.kraPin);
  const [notes, setNotes] = useState(profile.defaultNotes);
  const [terms, setTerms] = useState(profile.defaultTerms);
  const [remindersOn, setRemindersOn] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientSheet, setClientSheet] = useState<{ name?: string; editing?: Client | null } | null>(null);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const [sendStage, setSendStage] = useState<SendStage>(null);
  const [preview, setPreview] = useState(false);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceRefs = useRef<Record<string, TextInput | null>>({});
  const descRefs = useRef<Record<string, TextInput | null>>({});

  // Hydrate from an existing invoice once.
  useEffect(() => {
    const d = existing.data;
    if (!d || loadedRef.current) return;
    loadedRef.current = true;
    if (d.invoice.status === 'PAID' || d.invoice.status === 'VOID' || d.payments.length > 0) {
      router.replace(`/app/invoices/${d.invoice.id}`);
      return;
    }
    const inv = d.invoice;
    setInvoice(inv);
    setClientId(inv.clientId || null);
    setIssueDate(inv.issueDate);
    setDueDate(inv.dueDate);
    const ls = inv.lineItems.length
      ? inv.lineItems.map((l) => newLine({ description: l.description, qty: formatQuantity(l.quantityMilli), price: formatKesDigits(l.unitPriceCents).replace(/\.00$/, '') }))
      : [newLine()];
    setLines(ls);
    setCommitted(ls);
    setDiscountMode(inv.discountMode);
    const disc = inv.discountInput ? (inv.discountMode === 'PERCENT' ? String(inv.discountInput / 100) : formatKesDigits(inv.discountInput).replace(/\.00$/, '')) : '';
    setDiscount(disc);
    setCommittedDiscount(disc);
    setVat(inv.taxRateBp > 0);
    setNotes(inv.notes);
    setTerms(inv.terms);
    setRemindersOn(inv.remindersEnabled);
    setSavedAt(inv.updatedAt);
  }, [existing.data]);

  const client = (clients.data ?? []).find((c) => c.client.id === clientId)?.client ?? existing.data?.client ?? null;
  const pendingPayment = !!existing.data?.pendingAttempt;
  const isSent = !!invoice && invoice.status !== 'DRAFT';
  const locked = pendingPayment;

  const discountInput = useMemo(() => {
    if (!committedDiscount.trim()) return 0;
    if (discountMode === 'PERCENT') {
      const p = Number(committedDiscount);
      return Number.isFinite(p) ? Math.round(Math.min(100, Math.max(0, p)) * 100) : 0;
    }
    return tryFromKes(committedDiscount) ?? 0;
  }, [committedDiscount, discountMode]);

  // Totals are computed from the COMMITTED (blurred) values only — no flicker while typing.
  const totals = useMemo(() => computeTotals(parseLines(committed), discountMode, discountInput, vat ? VAT_BP : 0), [committed, discountMode, discountInput, vat]);

  const buildInput = useCallback(
    (): InvoiceInput => ({
      clientId,
      issueDate,
      dueDate,
      lineItems: parseLines(lines),
      discountMode,
      discountInput,
      vat,
      notes,
      terms,
      remindersEnabled: remindersOn,
    }),
    [clientId, issueDate, dueDate, lines, discountMode, discountInput, vat, notes, terms, remindersOn],
  );

  const hasContent = !!clientId || lines.some((l) => l.description.trim() || l.price.trim());

  /** Persist now. Returns the invoice id. */
  const flush = useCallback(async (): Promise<string | null> => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (locked) return id;
    if (!hasContent && !id) return null;
    setSaving(true);
    try {
      const input = buildInput();
      const saved = id ? await api.updateInvoice(id, input) : await api.createDraft(input);
      setId(saved.id);
      setInvoice(saved);
      setSavedAt(saved.updatedAt);
      setDirty(false);
      return saved.id;
    } catch (e) {
      toast.show(errorMessage(e), { kind: 'error', action: { label: 'Retry', onPress: () => void flush() } });
      return id;
    } finally {
      setSaving(false);
    }
  }, [buildInput, hasContent, id, locked, toast]);

  // Autosave drafts two seconds after the last keystroke. Sent invoices save explicitly.
  useEffect(() => {
    if (!dirty || isSent || locked) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 2000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, lines, clientId, issueDate, dueDate, discount, discountMode, vat, notes, terms, remindersOn, flush, isSent, locked]);

  const touch = () => setDirty(true);

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    touch();
  };
  const commit = () => setCommitted(lines);
  const addLine = () => {
    const l = newLine();
    setLines((ls) => {
      const next = [...ls, l];
      setCommitted(next);
      return next;
    });
    touch();
    setTimeout(() => descRefs.current[l.key]?.focus(), 50);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!clientId) e.client = 'Choose who this invoice is for';
    else if (!client?.email) e.clientEmail = 'Add an email so we can send the invoice';
    lines.forEach((l, i) => {
      if (!l.description.trim()) e[`line.${i}.description`] = 'Describe this item';
      if (!tryFromKes(l.price || '0')) e[`line.${i}.price`] = 'Enter a price';
      if (!parseQuantity(l.qty)) e[`line.${i}.qty`] = 'Enter a quantity';
    });
    if (dueDate < issueDate) e.dueDate = 'Due date can’t be before the issue date';
    if (totals.totalCents <= 0 && !Object.keys(e).some((k) => k.startsWith('line'))) e.total = 'The total must be more than KES 0.00';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const canSend = !!clientId && lines.length > 0 && lines.every((l) => l.description.trim() && l.price.trim());

  const startSend = async () => {
    commit();
    if (!validate()) {
      toast.show('Fix the highlighted fields to send', { kind: 'info' });
      return;
    }
    await flush();
    setSendStage('confirm');
  };

  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    const all = (clients.data ?? []).filter((c) => !c.client.archivedAt);
    if (!q) return all.slice(0, 5);
    return all.filter((c) => c.client.name.toLowerCase().includes(q) || (c.client.email ?? '').includes(q)).slice(0, 5);
  }, [clientQuery, clients.data]);
  const exact = matches.some((m) => m.client.name.toLowerCase() === clientQuery.trim().toLowerCase());

  const previewModel: PublicInvoice = {
    number: invoice?.number ?? nextNumber.data ?? '',
    status: invoice?.status ?? 'DRAFT',
    issueDate,
    dueDate,
    currency: 'KES',
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    taxRateBp: vat ? VAT_BP : 0,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    amountDueCents: totals.totalCents,
    notes,
    terms,
    lineItems: parseLines(committed).map((l, i) => ({ ...l, lineTotalCents: totals.lineTotals[i] })),
    business: { name: profile.businessName, logoUri: profile.logoUri, phone: profile.phone ? displayPhone(profile.phone) : null, email: profile.email, location: profile.location, kraPin: profile.kraPin },
    billedTo: { name: client?.name ?? '', email: null },
    payment: { mpesaEnabled: true, suggestedPhone: null },
    paid: null,
    inFlight: null,
  };

  if (invoiceId && existing.loading) {
    return (
      <Screen title="Edit invoice">
        <Skeleton rows={5} height={72} />
      </Screen>
    );
  }

  const title = invoice?.number ?? nextNumber.data ?? 'New invoice';

  return (
    <Screen
      title={invoiceId ? `Edit ${title}` : 'New invoice'}
      subtitle={
        <Text variant="bodySm" accessibilityLiveRegion="polite">
          {saving ? 'Saving…' : savedAt && !isSent ? `Saved · ${formatTime(savedAt)}` : isSent ? 'Sent invoice' : 'Draft'}
        </Text>
      }
      right={<Button label="Preview" kind="text" small onPress={() => { commit(); setPreview(true); }} disabled={!canSend} />}
      footer={
        locked ? null : (
          <>
            <Button label={isSent ? 'Save and resend' : 'Send invoice'} kind="primary" full onPress={startSend} disabled={!canSend} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Button
                label="Save as draft"
                kind="text"
                small
                disabled={!hasContent || isSent}
                onPress={async () => {
                  await flush();
                  toast.show('Draft saved');
                  router.replace('/app/invoices');
                }}
              />
              {!isSent ? <Button label="Discard" kind="dangerText" small onPress={() => (id ? setDiscard(true) : router.back())} /> : null}
            </Row>
          </>
        )
      }
    >
      {locked ? <Banner title="A payment is in progress. You can edit once it finishes." tone="attention" /> : null}
      {isSent && !locked ? <Banner title="This invoice has been sent." body="Changes will be emailed to the client again." tone="primary" /> : null}

      <View pointerEvents={locked ? 'none' : 'auto'} style={{ gap: space[4], opacity: locked ? 0.6 : 1 }}>
        {/* Client region */}
        <Card style={{ gap: space[3] }}>
          <SectionTitle>Client</SectionTitle>
          {client ? (
            <View style={styles.clientChip}>
              <View style={{ flex: 1 }}>
                <Text variant="section">{client.name}</Text>
                <Text variant="bodySm" tone={client.email ? 'ink2' : 'attention'}>
                  {client.email ?? 'No email yet'}
                </Text>
                {client.phone ? <Text variant="monoSm">{displayPhone(client.phone)}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Edit client" onPress={() => setClientSheet({ editing: client })} style={styles.iconBtn}>
                <Icon name="edit" color={color.primary} />
              </Pressable>
              {!isSent ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change client"
                  onPress={() => {
                    setClientId(null);
                    touch();
                  }}
                  style={styles.iconBtn}
                >
                  <Icon name="close" />
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={{ gap: space[2] }}>
              <Field label="Bill to" value={clientQuery} onChangeText={setClientQuery} placeholder="Search or add a client" autoFocus={!invoiceId} error={errors.client} autoCapitalize="words" />
              <View style={styles.combo}>
                {clientQuery.trim() && !exact ? (
                  <Pressable accessibilityRole="button" onPress={() => setClientSheet({ name: clientQuery.trim() })} style={styles.comboRow}>
                    <Icon name="plus" color={color.primary} />
                    <Text variant="bodySm" tone="primary">
                      Add “{clientQuery.trim()}” as a new client
                    </Text>
                  </Pressable>
                ) : null}
                {matches.map((m) => (
                  <Pressable
                    key={m.client.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setClientId(m.client.id);
                      setClientQuery('');
                      setErrors((e) => ({ ...e, client: '', clientEmail: '' }));
                      touch();
                    }}
                    style={styles.comboRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="bodySm" tone="ink">
                        {m.client.name}
                      </Text>
                      <Text variant="bodySm">{m.client.email ?? 'No email'}</Text>
                    </View>
                  </Pressable>
                ))}
                {!clientQuery.trim() && matches.length === 0 && !clients.loading ? (
                  <Text variant="bodySm" style={{ padding: space[3] }}>
                    Type a name to add your first client.
                  </Text>
                ) : null}
              </View>
            </View>
          )}
          {errors.clientEmail && client && !client.email ? (
            <Row style={{ flexWrap: 'wrap' }}>
              <Text variant="bodySm" tone="danger">
                {errors.clientEmail}
              </Text>
              <Button label="Add email" kind="text" small onPress={() => setClientSheet({ editing: client })} />
            </Row>
          ) : null}
        </Card>

        {/* Header region */}
        <Card style={{ gap: space[3] }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <SectionTitle>Details</SectionTitle>
            <Text variant="monoSm" tone="ink">
              {title}
            </Text>
          </Row>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Issue date"
                value={issueDate}
                onChangeText={(t) => {
                  setIssueDate(t);
                  touch();
                }}
                mono
                hint={/^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? formatDate(issueDate) : 'YYYY-MM-DD'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Due date"
                value={dueDate}
                onChangeText={(t) => {
                  setDueDate(t);
                  touch();
                }}
                onBlur={() => setErrors((e) => ({ ...e, dueDate: dueDate < issueDate ? 'Due date can’t be before the issue date' : '' }))}
                mono
                error={errors.dueDate || null}
                hint={/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? formatDate(dueDate) : 'YYYY-MM-DD'}
              />
            </View>
          </Row>
          <Row style={{ flexWrap: 'wrap' }}>
            {[7, 14, 30].map((d) => (
              <FilterChip
                key={d}
                label={`${d} days`}
                selected={dueDate === addDays(issueDate, d)}
                onPress={() => {
                  setDueDate(addDays(issueDate, d));
                  touch();
                }}
              />
            ))}
          </Row>
        </Card>

        {/* Line items */}
        <Card style={{ gap: space[3] }}>
          <SectionTitle>Items</SectionTitle>
          {lines.map((l, i) => {
            const amount = totals.lineTotals[i] ?? 0;
            const last = i === lines.length - 1;
            return (
              <View key={l.key} style={styles.lineCard}>
                <Row style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      ref={(r) => {
                        descRefs.current[l.key] = r;
                      }}
                      label="Description"
                      value={l.description}
                      onChangeText={(t) => updateLine(l.key, { description: t })}
                      onBlur={commit}
                      error={errors[`line.${i}.description`] || null}
                    />
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Actions for item ${i + 1}`} onPress={() => setRowMenu(l.key)} style={[styles.iconBtn, { marginTop: 22 }]}>
                    <Icon name="kebab" />
                  </Pressable>
                </Row>
                <Row style={{ alignItems: 'flex-start' }}>
                  <View style={{ width: 84 }}>
                    <Field label="Qty" value={l.qty} onChangeText={(t) => updateLine(l.key, { qty: t.replace(/[^\d.]/g, '') })} onBlur={commit} keyboardType="decimal-pad" align="right" error={errors[`line.${i}.qty`] || null} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      ref={(r) => {
                        priceRefs.current[l.key] = r;
                      }}
                      label="Unit price"
                      prefix="KES"
                      value={l.price}
                      onChangeText={(t) => updateLine(l.key, { price: t.replace(/[^\d.,]/g, '') })}
                      onBlur={() => {
                        const c = tryFromKes(l.price);
                        if (c !== null && l.price) updateLine(l.key, { price: formatKesDigits(c).replace(/\.00$/, '') });
                        commit();
                      }}
                      keyboardType="decimal-pad"
                      align="right"
                      returnKeyType={last ? 'next' : 'done'}
                      onSubmitEditing={() => last && addLine()}
                      error={errors[`line.${i}.price`] || null}
                    />
                  </View>
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="label" tone="ink2">
                    Amount
                  </Text>
                  <Amount cents={amount} />
                </Row>
              </View>
            );
          })}
          <Button label="Add item" icon="plus" kind="text" onPress={addLine} style={{ alignSelf: 'flex-start' }} />
        </Card>

        {/* Totals */}
        <Card style={{ gap: space[3] }}>
          <KeyValue k="Subtotal" v={formatKesDigits(totals.subtotalCents)} />
          <View style={{ gap: space[2] }}>
            <Segmented
              label="Discount type"
              options={[
                { value: 'AMOUNT', label: 'Discount KES' },
                { value: 'PERCENT', label: 'Discount %' },
              ]}
              value={discountMode}
              onChange={(v) => {
                setDiscountMode(v);
                touch();
              }}
            />
            <Field
              label={discountMode === 'PERCENT' ? 'Discount (%)' : 'Discount (KES)'}
              optional
              value={discount}
              onChangeText={(t) => {
                setDiscount(t.replace(/[^\d.,]/g, ''));
                touch();
              }}
              onBlur={() => setCommittedDiscount(discount)}
              keyboardType="decimal-pad"
              align="right"
            />
          </View>
          {totals.discountCents > 0 ? <KeyValue k="Discount" v={`−${formatKesDigits(totals.discountCents)}`} /> : null}
          <Toggle
            label="Add VAT at 16%"
            hint={profile.kraPin ? undefined : 'Add your KRA PIN in Settings to charge VAT'}
            value={vat}
            disabled={!profile.kraPin}
            onChange={(v) => {
              setVat(v);
              touch();
            }}
          />
          {totals.taxCents > 0 ? <KeyValue k="VAT 16%" v={formatKesDigits(totals.taxCents)} /> : null}
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="section">Total</Text>
            <Amount cents={totals.totalCents} size="lg" />
          </Row>
          {errors.total ? (
            <Text variant="bodySm" tone="danger">
              {errors.total}
            </Text>
          ) : null}
        </Card>

        {/* Notes and terms */}
        <Card style={{ gap: space[3] }}>
          <Field
            label="Note to client"
            optional
            value={notes}
            onChangeText={(t) => {
              setNotes(t);
              touch();
            }}
            multiline
          />
          <Field
            label="Terms"
            optional
            value={terms}
            onChangeText={(t) => {
              setTerms(t);
              touch();
            }}
          />
          <Toggle
            label="Automatic reminders"
            hint="3 days before, on the day, then 3, 7 and 14 days after"
            value={remindersOn}
            onChange={(v) => {
              setRemindersOn(v);
              touch();
            }}
          />
        </Card>
      </View>

      <ClientSheet
        visible={!!clientSheet}
        initialName={clientSheet?.name}
        editing={clientSheet?.editing}
        onClose={() => setClientSheet(null)}
        onSaved={(c) => {
          setClientSheet(null);
          setClientId(c.id);
          setClientQuery('');
          setErrors((e) => ({ ...e, client: '', clientEmail: '' }));
          touch();
          void clients.refetch();
        }}
      />

      <ActionMenu
        visible={!!rowMenu}
        onClose={() => setRowMenu(null)}
        title="Item"
        items={[
          {
            label: 'Duplicate row',
            onPress: () => {
              const src = lines.find((l) => l.key === rowMenu);
              if (!src) return;
              const idx = lines.indexOf(src);
              const next = [...lines.slice(0, idx + 1), newLine({ description: src.description, qty: src.qty, price: src.price }), ...lines.slice(idx + 1)];
              setLines(next);
              setCommitted(next);
              touch();
            },
          },
          ...(lines.length > 1
            ? [
                {
                  label: 'Delete row',
                  destructive: true,
                  onPress: () => {
                    const next = lines.filter((l) => l.key !== rowMenu);
                    setLines(next);
                    setCommitted(next);
                    touch();
                  },
                },
              ]
            : []),
        ]}
      />

      <ConfirmDialog
        visible={discard}
        title={`Discard ${invoice?.number ?? 'this draft'}?`}
        body="The draft is deleted. This can’t be undone."
        confirmLabel="Discard draft"
        onClose={() => setDiscard(false)}
        onConfirm={async () => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          if (id) await api.deleteDraft(id).catch(() => undefined);
          setDiscard(false);
          router.replace('/app/invoices');
        }}
      />

      <Sheet
        visible={preview}
        onClose={() => setPreview(false)}
        title="Preview"
        footer={
          <>
            <Button
              label="Looks good, send"
              kind="primary"
              full
              onPress={() => {
                setPreview(false);
                void startSend();
              }}
            />
            <Button
              label="Open full preview"
              full
              onPress={async () => {
                const saved = await flush();
                setPreview(false);
                if (saved) router.push(`/app/invoices/${saved}/preview`);
              }}
            />
            <Button label="Back to editing" kind="text" full onPress={() => setPreview(false)} />
          </>
        }
      >
        <InvoiceSheetPreview inv={previewModel} />
      </Sheet>

      <SendFlow
        stage={sendStage}
        setStage={setSendStage}
        invoice={invoice}
        client={client}
        onEditClient={() => {
          setSendStage(null);
          setClientSheet({ editing: client });
        }}
        onValidation={(d) => setErrors(d)}
        beforeSend={flush}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  clientChip: { flexDirection: 'row', alignItems: 'center', gap: space[1], backgroundColor: color.canvas, borderRadius: radius.md, padding: space[3] },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  combo: { borderWidth: 1, borderColor: color.line, borderRadius: radius.md, overflow: 'hidden' },
  comboRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48, paddingHorizontal: space[3], paddingVertical: space[2], borderBottomWidth: 1, borderBottomColor: color.lineSoft, backgroundColor: color.paper },
  lineCard: { gap: space[2], paddingBottom: space[3], borderBottomWidth: 1, borderBottomColor: color.lineSoft },
});
