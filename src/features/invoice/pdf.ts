import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { PublicInvoice } from '../../domain/types';
import { formatDate, formatDateTime } from '../../domain/dates';
import { formatKes, formatKesDigits, formatQuantity } from '../../domain/money';
import { color } from '../../ui/tokens';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STATUS: Record<string, [string, string, string]> = {
  DRAFT: ['Draft', color.neutral, color.lineSoft],
  SENT: ['Sent', color.primary, color.primaryTint],
  VIEWED: ['Viewed', color.viewed, color.primaryTint],
  OVERDUE: ['Overdue', color.attention, color.attentionTint],
  PAID: ['Paid', color.payHover, color.payTint],
  VOID: ['Void', color.neutral, color.lineSoft],
};

/**
 * One template, two outputs (TDD §11.1): the same data renders the on-screen
 * invoice and this PDF. Colours come from the tokens so the PDF matches.
 */
export function invoiceHtml(inv: PublicInvoice, kind: 'invoice' | 'receipt' = 'invoice', receiptNumber?: string): string {
  const [label, fg, bg] = STATUS[inv.status] ?? STATUS.SENT;
  const rows = inv.lineItems
    .map(
      (l) => `<tr><td>${esc(l.description)}</td><td class="n">${formatQuantity(l.quantityMilli)}</td><td class="n">${formatKesDigits(l.unitPriceCents)}</td><td class="n">${formatKesDigits(l.lineTotalCents)}</td></tr>`,
    )
    .join('');
  const logo = inv.business.logoUri && /^(https?:|data:)/.test(inv.business.logoUri) ? `<img class="logo" src="${esc(inv.business.logoUri)}"/>` : `<div class="tile">${esc(inv.business.name.slice(0, 1).toUpperCase())}</div>`;
  const receipt =
    kind === 'receipt' && inv.paid
      ? `<div class="receipt"><div class="micro" style="color:${color.payHover}">${inv.paid.mpesaReceiptNumber ? 'M-PESA RECEIPT' : 'PAYMENT RECORDED'}</div>
         ${inv.paid.mpesaReceiptNumber ? `<div class="code">${esc(inv.paid.mpesaReceiptNumber)}</div>` : ''}
         <div>${formatKes(inv.paid.amountCents)}${inv.paid.payerPhone ? ` from ${esc(inv.paid.payerPhone)}` : ''}</div>
         <div class="muted">${formatDateTime(inv.paid.paidAt)} EAT</div></div>`
      : '';
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  @page { margin: 32px; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Inter, sans-serif; color: ${color.ink}; font-size: 12px; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; }
  .head { background: ${color.inkBlue}; color: ${color.paper}; padding: 20px 24px; border-radius: 10px; }
  .head .muted { color: ${color.line}; }
  .brand { display: flex; gap: 12px; align-items: center; font-size: 16px; font-weight: 700; }
  .tile { width: 36px; height: 36px; border-radius: 8px; background: ${color.primary}; color: ${color.paper}; display:flex; align-items:center; justify-content:center; font-weight:700; }
  .logo { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; }
  .micro { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; font-weight: 600; color: ${color.ink3}; }
  .mono { font-family: 'JetBrains Mono', Menlo, monospace; }
  .amount { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .chip { display:inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 600; color: ${fg}; background: ${bg}; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { text-align: left; font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: ${color.ink3}; border-bottom: 1px solid ${color.line}; padding: 8px 0; }
  td { padding: 10px 0; border-bottom: 1px solid ${color.lineSoft}; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin-left: auto; width: 260px; margin-top: 12px; }
  .totals div { display:flex; justify-content: space-between; padding: 4px 0; font-variant-numeric: tabular-nums; }
  .total { font-weight: 700; font-size: 15px; border-top: 1px solid ${color.line}; padding-top: 8px !important; }
  .muted { color: ${color.ink2}; }
  .receipt { background: ${color.payTint}; border-radius: 10px; padding: 16px; margin-top: 20px; }
  .code { font-family: 'JetBrains Mono', Menlo, monospace; font-size: 22px; letter-spacing: .15em; font-weight: 600; margin: 4px 0; }
  .foot { margin-top: 28px; color: ${color.ink2}; }
  </style></head><body>
  <div class="head row">
    <div class="brand">${logo}<div>${esc(inv.business.name)}<div class="muted" style="font-size:11px;font-weight:400">${esc([inv.business.location, inv.business.phone, inv.business.email].filter(Boolean).join(' · '))}</div></div></div>
    <div style="text-align:right"><div class="micro" style="color:${color.line}">${kind === 'receipt' ? 'Receipt' : 'Invoice'}</div><div class="mono" style="font-size:14px">${esc(receiptNumber ?? inv.number)}</div></div>
  </div>
  <div class="row" style="margin-top:20px">
    <div><div class="micro">Billed to</div><div style="font-size:14px;font-weight:600">${esc(inv.billedTo.name)}</div></div>
    <div style="text-align:right"><div class="micro">Issued</div><div>${formatDate(inv.issueDate)}</div><div class="micro" style="margin-top:6px">Due</div><div>${formatDate(inv.dueDate)}</div></div>
  </div>
  <div style="margin-top:20px"><div class="micro">${kind === 'receipt' ? 'Amount paid' : 'Amount due'}</div><div class="amount"><span style="font-size:14px;color:${color.ink2}">KES </span>${formatKesDigits(kind === 'receipt' && inv.paid ? inv.paid.amountCents : inv.amountDueCents)}</div><span class="chip">● ${label}</span> <span class="mono muted">${esc(inv.number)}</span></div>
  ${receipt}
  <table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="totals">
    <div><span class="muted">Subtotal</span><span>${formatKesDigits(inv.subtotalCents)}</span></div>
    ${inv.discountCents ? `<div><span class="muted">Discount</span><span>−${formatKesDigits(inv.discountCents)}</span></div>` : ''}
    ${inv.taxCents ? `<div><span class="muted">VAT ${inv.taxRateBp / 100}%</span><span>${formatKesDigits(inv.taxCents)}</span></div>` : ''}
    <div class="total"><span>Total</span><span>${formatKes(inv.totalCents)}</span></div>
  </div>
  <div class="foot">
    ${inv.notes ? `<p>${esc(inv.notes)}</p>` : ''}
    ${inv.terms ? `<p class="muted">${esc(inv.terms)}</p>` : ''}
    ${inv.business.kraPin ? `<p class="mono muted">KRA PIN ${esc(inv.business.kraPin)}</p>` : ''}
    ${kind === 'invoice' && inv.status !== 'PAID' ? `<p>Pay by M-Pesa from the invoice link.</p>` : ''}
  </div>
  </body></html>`;
}

/** Generate and hand the PDF to the OS share sheet. Failure leaves the invoice untouched. */
export async function sharePdf(inv: PublicInvoice, kind: 'invoice' | 'receipt' = 'invoice', receiptNumber?: string) {
  const { uri } = await Print.printToFileAsync({ html: invoiceHtml(inv, kind, receiptNumber) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${kind === 'receipt' ? 'Receipt' : 'Invoice'} ${inv.number}`, UTI: 'com.adobe.pdf' });
  } else {
    await Print.printAsync({ uri });
  }
}
