import type { BusinessProfile, InvoiceDetail, PublicInvoice } from '../../domain/types';
import { displayPhone } from '../../domain/phone';

/** Build the document model the client sees, from the freelancer's own data. */
export function docFromDetail(d: InvoiceDetail, profile: BusinessProfile): PublicInvoice {
  const inv = d.invoice;
  const paid = d.payments[0];
  return {
    number: inv.number,
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    currency: 'KES',
    subtotalCents: inv.subtotalCents,
    discountCents: inv.discountCents,
    taxRateBp: inv.taxRateBp,
    taxCents: inv.taxCents,
    totalCents: inv.totalCents,
    amountDueCents: Math.max(0, inv.totalCents - inv.amountPaidCents),
    notes: inv.notes,
    terms: inv.terms,
    lineItems: inv.lineItems.map(({ description, quantityMilli, unitPriceCents, lineTotalCents }) => ({ description, quantityMilli, unitPriceCents, lineTotalCents })),
    business: {
      name: profile.businessName,
      logoUri: profile.logoUri,
      phone: profile.phone ? displayPhone(profile.phone) : null,
      email: profile.email,
      location: profile.location,
      kraPin: profile.kraPin,
    },
    billedTo: { name: d.client?.name ?? '', email: d.client?.email ?? null },
    payment: { mpesaEnabled: true, suggestedPhone: null },
    paid: paid
      ? { mpesaReceiptNumber: paid.mpesaReceiptNumber, amountCents: paid.amountCents, paidAt: paid.paidAt, payerPhone: paid.payerPhone ? displayPhone(paid.payerPhone) : null, source: paid.source }
      : null,
    inFlight: null,
  };
}
