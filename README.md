# Invoice + M-Pesa — mobile app

A React Native (Expo) app for Kenyan freelancers: send an invoice, and your client pays it with an M-Pesa STK push straight to your own till or paybill.

It is built from the five spec documents (Engineering Plan, Backend Schema, Design Brief, UX Flow & Screen Specification, Technical Design Document). Screen IDs in the code (`A-1`, `D-5`, `P-3`, `M-9` …) match the UX spec.

## Run it

```bash
npm install
npx expo start          # then press a (Android), i (iOS) or w (web), or scan the QR code with Expo Go
```

Out of the box the app runs against a **built-in simulator**, not a server. On the login screen, tap **Explore with sample data** to get an account with clients, invoices and payments already set up. You can also sign up from scratch; the simulator stands in for the verification email.

To point the app at the real NestJS API from the TDD instead:

```bash
EXPO_PUBLIC_API_URL=https://api.example.co.ke EXPO_PUBLIC_PAY_URL=https://pay.example.co.ke npx expo start
```

### Checks

```bash
npm run typecheck      # tsc --noEmit, strict
npm run lint:tokens    # fails on any raw hex colour outside src/ui/tokens.ts (Design Brief §07)
npm test               # vitest: money, phone, totals, dates, and the simulated backend's money rules
npm run check          # all three
```

## What's in the app

| Area | Screens |
| --- | --- |
| Auth & onboarding | A-1 sign up, A-2 check email, A-3 verify, A-4 log in (lockout after 5 tries), A-5/A-6 password reset, A-8 business profile with live preview, A-9 four-step M-Pesa wizard with a KES 1 self-test, A-10 |
| Dashboard | D-1 home (four live figures, needs-attention, recent payments), D-2 invoice list (filters kept in the URL, row menus, bulk reminders), D-3 composer (autosave, totals on blur, inline add-client), D-4 preview, D-5 detail (share row, timeline, receipt block), D-6/D-7 clients, D-8 payments with CSV export, D-9 settings (7 tabs), D-10 plan, D-11 upgrade via STK, D-12 help, the notification bell |
| Modals | M-1 add client, M-2 confirm send, M-4 delete, M-5 mark paid, M-6 void, M-8 disconnect, M-9 plan limit |
| Client pay flow | P-1 invoice, P-2 pay sheet, P-3 waiting (120 s countdown ring), P-4 paid, P-5 six failure variants, P-6 already paid, P-7 invalid link, P-8 receipt. Open these from any sent invoice with **Open what your client sees**. |

Invoice and receipt PDFs are rendered on-device from one HTML template (`expo-print`) and shared through the OS share sheet.

### The M-Pesa simulator

**More → M-Pesa simulator** chooses what the simulated Safaricom does on the next STK push: approve, wrong PIN, cancel, insufficient funds, unreachable, unknown error, no response, a lost callback that the reconciliation sweeper recovers, or a callback delivered twice. This is how every failure state in UX spec §9 can be seen on a phone.

## How it's built

```
src/
  app/            Expo Router routes: (auth)/, onboarding/, app/ (dashboard), i/[token] (client pages)
  domain/         pure TypeScript: money (integer cents, half-up once per line), phone, EAT dates,
                  totals, Daraja result-code mapping, invoice action rules, plan limits
  api/            the Api contract, HttpApi (TDD §6 /v1 endpoints, refresh-on-401), and
  api/mock/       MockServer — an in-process backend with the schema's guarantees
  features/       composer, send flow, pay flow, PDF, profile, clients, dashboard shell
  ui/             tokens.ts (Design Brief §08, the only file with colours) and the component kit
tests/            vitest suites for the domain and the money path
```

The simulated backend enforces the Backend Schema §09 invariants, and the tests cover them. A receipt number is never credited twice. An invoice has at most one pending attempt. Totals always reconcile. `amount_paid_cents` always equals the sum of payments. Invoice numbering has no gaps. The callback and the sweeper settle through one function. It also covers overpayment, double payment, payment on a voided invoice, rate limiting, the free-tier cap counted in Nairobi time, reminders shifted into the 08:00–18:00 EAT window, and a draft saved from M-9 that sends itself after an upgrade.

## Decisions and gaps

- **Native app, not a PWA.** UX spec open question 7 assumed mobile web. This build is a native app for the freelancer. The client pages (P-1…P-8) live in the same codebase, so the flow can be previewed and demoed on a phone. In production they belong on `pay.…` as the small, server-rendered web page the TDD describes.
- **No backend in this repo.** The NestJS/Postgres/BullMQ service and the real Daraja integration (Engineering Plan P0–P2) aren't included. `HttpApi` follows the TDD's endpoint table. It adds a few endpoints under `/v1/me/…` that the screens need but the table doesn't list (reminder rules, notification preferences, the bell, billing); these are marked in `src/api/http.ts`.
- **Not built:** "Continue with Google", pay by card (P-9, post-MVP), push notifications. Date fields are typed `YYYY-MM-DD` with a formatted hint rather than using a native date picker.
- **Free plan includes the M-Pesa pay link**, capped at 5 sends a month (UX spec §8 assumption).
