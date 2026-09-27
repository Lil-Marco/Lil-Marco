import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { color, type ColorToken, type TypeToken, type as typeScale } from './tokens';

export interface Props extends TextProps {
  variant?: TypeToken;
  tone?: ColorToken;
  align?: TextStyle['textAlign'];
  tabular?: boolean;
  strike?: boolean;
}

const DEFAULT_TONE: Partial<Record<TypeToken, ColorToken>> = {
  body: 'ink2',
  bodySm: 'ink2',
  micro: 'ink3',
  label: 'ink',
};

export function Text({ variant = 'body', tone, align, tabular, strike, style, ...rest }: Props) {
  const isAmount = variant.startsWith('amount');
  return (
    <RNText
      {...rest}
      style={[
        typeScale[variant],
        { color: color[tone ?? DEFAULT_TONE[variant] ?? 'ink'] },
        align ? { textAlign: align } : null,
        tabular || isAmount ? { fontVariant: ['tabular-nums'] } : null,
        strike ? { textDecorationLine: 'line-through' } : null,
        style,
      ]}
    />
  );
}
