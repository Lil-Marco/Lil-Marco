export const SETTINGS_TABS = [
  { tab: 'business', label: 'Business', sub: 'Name, logo, contact details, footer' },
  { tab: 'mpesa', label: 'M-Pesa', sub: 'Your till or paybill and its status' },
  { tab: 'defaults', label: 'Invoice defaults', sub: 'Payment terms, notes, VAT, numbering' },
  { tab: 'reminders', label: 'Reminders', sub: 'When clients get nudged' },
  { tab: 'notifications', label: 'Notifications', sub: 'What we tell you, and how' },
  { tab: 'billing', label: 'Plan and billing', sub: 'Your plan and our receipts' },
  { tab: 'account', label: 'Account', sub: 'Name, password, delete account' },
] as const;
