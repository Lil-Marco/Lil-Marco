import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MockServer } from '../src/api/mock/server';
import { isApiError } from '../src/api/errors';
import type { InvoiceInput, SimScenario } from '../src/api/types';
import { addDays, periodKeyEat, shiftIntoSendWindow, todayEat } from '../src/domain/dates';
import { mapResultCode, CLIENT_FAILURE_COPY } from '../src/domain/resultCodes';

let clock = new Date('2026-10-02T09:00:00Z');
let timers: { at: number; fn: () => void }[] = [];

function advance(ms: number) {
  const target = clock.getTime() + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const next = timers[0];
    if (!next || next.at > target) break;
    timers.shift();
    clock = new Date(next.at);
    next.fn();
  }
  clock = new Date(target);
}

function makeServer() {
  let stored: string | null = null;
  return new MockServer(
    { load: async () => stored, save: async (s) => void (stored = s) },
    {
      now: () => clock,
      randomBytes: (n) => new Uint8Array(randomBytes(n)),
      setTimer: (fn, ms) => void timers.push({ at: clock.getTime() + ms, fn }),
      latencyMs: 0,
      logger: { warn: () => {}, info: () => {} },
      publicBaseUrl: 'https://pay.test',
    },
  );
}

async function setup(scenario: SimScenario = 'SUCCESS') {
  const api = makeServer();
  await api.signup({ name: 'Brian', email: 'Brian@Example.com', password: 'password1' });
  await api.simulateVerificationLink();
  api.setSim({ scenario: 'SUCCESS', callbackDelayMs: 1000 });
  await api.saveMpesaStep({ shortcodeType: 'TILL', shortcode: '512345', consumerKey: 'k', consumerSecret: 's', passkey: 'p' });
  await api.verifyMpesaKeys();
  const test = await api.sendTestPayment('0712345678');
  advance(1500);
  expect((await api.attemptStatus(test.attemptId)).attemptStatus).toBe('SUCCESS');
  api.setSim({ scenario, callbackDelayMs: 1000 });
  const client = await api.createClient({ name: 'Kamau Designs', email: 'kamau@example.com', phone: '0722000111', notes: null });
  return { api, client };
}

function input(clientId: string, price = 1250000): InvoiceInput {
  const today = todayEat(clock);
  return {
    clientId,
    issueDate: today,
    dueDate: addDays(today, 14),
    lineItems: [{ description: 'Brand identity', quantityMilli: 1000, unitPriceCents: price }],
    discountMode: 'AMOUNT',
    discountInput: 0,
    vat: false,
    notes: '',
    terms: '',
    remindersEnabled: true,
  };
}

beforeEach(() => {
  clock = new Date('2026-10-02T09:00:00Z');
  timers = [];
});

describe('auth', () => {
  it('rejects a duplicate email differing only in case', async () => {
    const api = makeServer();
    await api.signup({ name: 'A', email: 'a@x.co', password: 'password1' });
    await expect(api.signup({ name: 'A', email: 'A@X.CO', password: 'password1' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('locks after five failed logins', async () => {
    const api = makeServer();
    await api.signup({ name: 'A', email: 'a@x.co', password: 'password1' });
    await api.logout();
    for (let i = 0; i < 4; i++) await expect(api.login({ email: 'a@x.co', password: 'nope', keepSignedIn: true })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(api.login({ email: 'a@x.co', password: 'nope', keepSignedIn: true })).rejects.toMatchObject({ code: 'LOCKED' });
    await expect(api.login({ email: 'a@x.co', password: 'password1', keepSignedIn: true })).rejects.toMatchObject({ code: 'LOCKED' });
  });
});

describe('invoices', () => {
  it('numbers invoices gaplessly', async () => {
    const { api, client } = await setup();
    const nums = [];
    for (let i = 0; i < 5; i++) nums.push((await api.createDraft(input(client.id))).number);
    expect(nums).toEqual(['INV-0001', 'INV-0002', 'INV-0003', 'INV-0004', 'INV-0005']);
  });

  it('cannot send a zero-total invoice or one whose client has no email', async () => {
    const { api } = await setup();
    const c = await api.createClient({ name: 'No Email', email: null, phone: null, notes: null });
    const inv = await api.createDraft(input(c.id, 0));
    const err = await api.sendInvoice(inv.id, { message: '', sendCopy: false }).catch((e) => e);
    expect(isApiError(err, 'VALIDATION')).toBe(true);
    expect(err.details.clientEmail).toBeDefined();
    expect(err.details.total).toBeDefined();
  });

  it('blocks sending until M-Pesa is connected', async () => {
    const api = makeServer();
    await api.signup({ name: 'A', email: 'a@x.co', password: 'password1' });
    const c = await api.createClient({ name: 'K', email: 'k@x.co', phone: null, notes: null });
    const inv = await api.createDraft(input(c.id));
    await expect(api.sendInvoice(inv.id, { message: '', sendCopy: false })).rejects.toMatchObject({ code: 'MPESA_NOT_CONNECTED' });
  });

  it('enforces the free cap on the sixth send and counts 5', async () => {
    const { api, client } = await setup();
    for (let i = 0; i < 5; i++) {
      const inv = await api.createDraft(input(client.id));
      await api.sendInvoice(inv.id, { message: '', sendCopy: false });
    }
    const sixth = await api.createDraft(input(client.id));
    await expect(api.sendInvoice(sixth.id, { message: '', sendCopy: false })).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
    expect((await api.me()).usage.invoicesSent).toBe(5);
  });

  it('materialises five reminders inside the send window', async () => {
    const { api, client } = await setup();
    const inv = await api.createDraft(input(client.id));
    await api.sendInvoice(inv.id, { message: '', sendCopy: false });
    const d = await api.getInvoice(inv.id);
    expect(d.reminders.filter((r) => r.status === 'SCHEDULED')).toHaveLength(5);
  });

  it('hides the public invoice for drafts and voided invoices', async () => {
    const { api, client } = await setup();
    const inv = await api.createDraft(input(client.id));
    expect((await api.getPublicInvoice(inv.publicToken)).kind).toBe('invalid');
    await api.sendInvoice(inv.id, { message: '', sendCopy: false });
    const ok = await api.getPublicInvoice(inv.publicToken);
    expect(ok.kind).toBe('ok');
    if (ok.kind === 'ok') {
      const json = JSON.stringify(ok.invoice);
      expect(json).not.toContain(inv.id);
      expect(json).not.toContain('kamau@example.com');
    }
    await api.voidInvoice(inv.id, false);
    const gone = await api.getPublicInvoice(inv.publicToken);
    expect(gone.kind).toBe('invalid');
    expect(JSON.stringify(gone)).not.toContain('12,500');
  });
});

describe('money path', () => {
  async function sentInvoice(scenario: SimScenario = 'SUCCESS') {
    const { api, client } = await setup(scenario);
    const inv = await api.createDraft(input(client.id));
    await api.sendInvoice(inv.id, { message: '', sendCopy: false });
    return { api, inv };
  }

  it('settles a successful callback: invoice PAID, one payment, receipt, audit row', async () => {
    const { api, inv } = await sentInvoice();
    const { attemptId } = await api.pay(inv.publicToken, '0712 345 678', 'k1');
    expect((await api.paymentStatus(inv.publicToken))!.attemptStatus).toBe('PENDING');
    advance(1500);
    const s = await api.paymentStatus(inv.publicToken);
    expect(s!.attemptStatus).toBe('SUCCESS');
    expect(s!.receipt!.mpesaReceiptNumber).toMatch(/^[A-Z0-9]{10}$/);
    const d = await api.getInvoice(inv.id);
    expect(d.invoice.status).toBe('PAID');
    expect(d.invoice.amountPaidCents).toBe(1250000);
    expect(d.payments).toHaveLength(1);
    expect(d.receipts).toHaveLength(1);
    expect(d.timeline.some((e) => e.action === 'payment.settled')).toBe(true);
    expect(d.reminders.every((r) => r.status !== 'SCHEDULED')).toBe(true);
    expect(attemptId).toBeTruthy();
  });

  it('a duplicate callback creates one payment', async () => {
    const { api, inv } = await sentInvoice('DUPLICATE_CALLBACK');
    await api.pay(inv.publicToken, '0712345678', 'k1');
    advance(5000);
    const d = await api.getInvoice(inv.id);
    expect(d.payments).toHaveLength(1);
    expect(d.invoice.amountPaidCents).toBe(1250000);
  });

  it('a double-tap produces one attempt', async () => {
    const { api, inv } = await sentInvoice();
    const [a, b] = await Promise.all([api.pay(inv.publicToken, '0712345678', 'k1'), api.pay(inv.publicToken, '0712345678', 'k2')]);
    expect(a.attemptId).toBe(b.attemptId);
    expect((await api.getInvoice(inv.id)).attempts).toHaveLength(1);
  });

  it('refuses to pay an already-paid invoice', async () => {
    const { api, inv } = await sentInvoice();
    await api.pay(inv.publicToken, '0712345678', 'k1');
    advance(1500);
    await expect(api.pay(inv.publicToken, '0712345678', 'k2')).rejects.toMatchObject({ code: 'INVOICE_ALREADY_PAID' });
  });

  it('rejects a bad phone number before any attempt exists', async () => {
    const { api, inv } = await sentInvoice();
    await expect(api.pay(inv.publicToken, '020 123 4567', 'k1')).rejects.toMatchObject({ code: 'INVALID_PHONE_NUMBER' });
    expect((await api.getInvoice(inv.id)).attempts).toHaveLength(0);
  });

  it('maps a wrong PIN to a plain reason and never exposes the code in the timeline', async () => {
    const { api, inv } = await sentInvoice('WRONG_PIN');
    await api.pay(inv.publicToken, '0712345678', 'k1');
    advance(1500);
    const s = await api.paymentStatus(inv.publicToken);
    expect(s!.failureReason).toBe('WRONG_PIN');
    const d = await api.getInvoice(inv.id);
    expect(d.invoice.status).not.toBe('PAID');
    expect(d.timeline.map((e) => e.message).join(' ')).not.toMatch(/2001/);
  });

  it('the sweeper recovers a payment whose callback never arrived', async () => {
    const { api, inv } = await sentInvoice('LATE_SUCCESS');
    await api.pay(inv.publicToken, '0712345678', 'k1');
    advance(60_000);
    expect((await api.paymentStatus(inv.publicToken))!.attemptStatus).toBe('PENDING');
    advance(40_000);
    const d = await api.getInvoice(inv.id);
    expect(d.invoice.status).toBe('PAID');
    expect(d.payments[0].source).toBe('RECONCILED');
  });

  it('refuses edits while a payment is in flight', async () => {
    const { api, inv } = await sentInvoice('NO_RESPONSE');
    await api.pay(inv.publicToken, '0712345678', 'k1');
    await expect(api.updateInvoice(inv.id, input(inv.clientId))).rejects.toMatchObject({ code: 'INVOICE_NOT_EDITABLE' });
  });

  it('rate-limits the sixth initiation for one invoice inside an hour', async () => {
    const { api, inv } = await sentInvoice('CANCELLED');
    for (let i = 0; i < 5; i++) {
      await api.pay(inv.publicToken, '0712345678', `k${i}`);
      advance(1500);
    }
    await expect(api.pay(inv.publicToken, '0712345678', 'k6')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('records money arriving on a voided invoice rather than dropping it', async () => {
    const { api, inv } = await sentInvoice();
    await api.pay(inv.publicToken, '0712345678', 'k1');
    await api.voidInvoice(inv.id, false);
    advance(1500);
    const d = await api.getInvoice(inv.id);
    expect(d.payments).toHaveLength(1);
    expect(d.banner?.kind).toBe('voided_invoice_paid');
  });
});

describe('plan & auth extras', () => {
  it('a draft saved from M-9 sends itself on upgrade', async () => {
    const { api, client } = await setup();
    for (let i = 0; i < 5; i++) {
      const inv = await api.createDraft(input(client.id));
      await api.sendInvoice(inv.id, { message: '', sendCopy: false });
    }
    const blocked = await api.createDraft(input(client.id));
    await expect(api.sendInvoice(blocked.id, { message: '', sendCopy: false })).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
    await api.queueForSend(blocked.id);
    await api.startUpgrade('PRO', '0712345678');
    advance(1500);
    expect((await api.me()).user.plan).toBe('PRO');
    expect((await api.getInvoice(blocked.id)).invoice.status).toBe('SENT');
  });

  it('resets a password with a single-use token and signs in', async () => {
    const api = makeServer();
    await api.signup({ name: 'A', email: 'a@x.co', password: 'password1' });
    await api.logout();
    await api.forgotPassword('nobody@x.co');
    expect(api.lastResetToken()).toBeNull();
    await api.forgotPassword('a@x.co');
    const t = api.lastResetToken()!;
    const me = await api.resetPassword(t, 'newpassword1');
    expect(me.user.email).toBe('a@x.co');
    await expect(api.resetPassword(t, 'again12345')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    await api.logout();
    await expect(api.login({ email: 'a@x.co', password: 'newpassword1', keepSignedIn: true })).resolves.toBeTruthy();
  });
});

describe('result codes (T15)', () => {
  it.each([
    [1032, 'CANCELLED_BY_USER'],
    [2001, 'WRONG_PIN'],
    [1, 'INSUFFICIENT_FUNDS'],
    [1037, 'UNREACHABLE'],
    [1019, 'TIMEOUT'],
  ] as const)('%i → %s', (code, reason) => {
    const m = mapResultCode(code);
    expect(m.reason).toBe(reason);
    expect(CLIENT_FAILURE_COPY[reason].title).not.toMatch(/\d{3,}/);
  });

  it('maps an unknown code to SYSTEM and warns once', () => {
    const warnings: string[] = [];
    expect(mapResultCode(9999, { warn: (m) => warnings.push(m) }).reason).toBe('SYSTEM');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('9999');
  });
});

describe('time', () => {
  it('rolls the plan period over at midnight Nairobi, not UTC', () => {
    // 22:30 UTC on 31 Oct is 01:30 EAT on 1 Nov.
    expect(periodKeyEat(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11');
    // 20:00 UTC on 31 Oct is 23:00 EAT, still October.
    expect(periodKeyEat(new Date('2026-10-31T20:00:00Z'))).toBe('2026-10');
  });

  it('a reminder due at 02:00 EAT sends at 08:00 the same day', () => {
    expect(shiftIntoSendWindow('2026-10-05T23:00:00Z')).toBe('2026-10-06T05:00:00.000Z');
  });
});
