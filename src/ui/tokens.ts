/**
 * Design Brief §08 — the contract. This is the ONLY file in the app allowed to
 * contain a raw hex colour (enforced by `npm run lint:tokens`). If a component
 * needs a value that is not here, add it here first.
 */

export const color = {
  // brand — product chrome, links, freelancer actions
  primary: '#1D4ED8',
  primaryHover: '#1E3A8A',
  primaryTint: '#EEF2FF',
  onPrimary: '#FFFFFF',
  inkBlue: '#172554',
  // money — pay action and funds received. Nothing else.
  pay: '#047857',
  payHover: '#065F46',
  payTint: '#ECFDF5',
  onPay: '#FFFFFF',
  live: '#059669',
  // state
  attention: '#B45309',
  attentionTint: '#FFFBEB',
  danger: '#B91C1C',
  dangerTint: '#FEF2F2',
  viewed: '#4338CA',
  neutral: '#334155',
  // neutrals
  ink: '#0B1220',
  ink2: '#5A6473',
  ink3: '#8A93A3',
  paper: '#FFFFFF',
  canvas: '#F6F7F9',
  line: '#E4E7EC',
  lineSoft: '#F1F3F6',
  scrim: 'rgba(11,18,32,0.45)',
  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof color;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoSemibold: 'JetBrainsMono_600SemiBold',
} as const;

/** size / line-height pairs from the type scale. */
export const type = {
  amountXl: { fontSize: 36, lineHeight: 38, fontFamily: font.bold },
  amountLg: { fontSize: 24, lineHeight: 28, fontFamily: font.bold },
  amountMd: { fontSize: 16, lineHeight: 22, fontFamily: font.semibold },
  display: { fontSize: 28, lineHeight: 32, fontFamily: font.bold, letterSpacing: -0.7 },
  title: { fontSize: 20, lineHeight: 25, fontFamily: font.semibold },
  section: { fontSize: 16, lineHeight: 22, fontFamily: font.semibold },
  body: { fontSize: 16, lineHeight: 26, fontFamily: font.regular },
  bodySm: { fontSize: 14, lineHeight: 22, fontFamily: font.regular },
  label: { fontSize: 13, lineHeight: 18, fontFamily: font.semibold },
  micro: { fontSize: 11.5, lineHeight: 16, fontFamily: font.semibold, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  mono: { fontSize: 15, lineHeight: 21, fontFamily: font.monoSemibold, letterSpacing: 1.35 },
  monoSm: { fontSize: 12.5, lineHeight: 18, fontFamily: font.mono },
} as const;

export type TypeToken = keyof typeof type;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;

export const radius = { sm: 6, md: 10, lg: 14, full: 999 } as const;

export const controlHeight = 44;
export const controlHeightSm = 34;

export const elevation = {
  1: { shadowColor: color.ink, shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  2: { shadowColor: color.ink, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  3: { shadowColor: color.ink, shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
} as const;

export const duration = { fast: 120, base: 200, slow: 320 } as const;

export const breakpoint = { sm: 360, md: 640, lg: 860, xl: 1280 } as const;
