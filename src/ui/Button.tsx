import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { color, controlHeight, controlHeightSm, radius, space } from './tokens';
import { Icon, type IconName } from './Icon';

export type ButtonKind = 'primary' | 'pay' | 'secondary' | 'danger' | 'text' | 'dangerText';

interface Props {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  small?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * One filled button per screen. Green (`pay`) only for paying.
 * Working state: label replaced by a spinner, width held, disabled. It never disappears.
 */
export function Button({ label, onPress, kind = 'secondary', disabled, loading, full, small, icon, style, accessibilityHint, testID }: Props) {
  const inactive = disabled || loading;
  const filled = kind === 'primary' || kind === 'pay';
  const bg = kind === 'primary' ? color.primary : kind === 'pay' ? color.pay : kind === 'secondary' || kind === 'danger' ? color.paper : color.transparent;
  const bgPressed = kind === 'primary' ? color.primaryHover : kind === 'pay' ? color.payHover : kind === 'danger' ? color.dangerTint : color.primaryTint;
  const fg = filled ? 'onPrimary' : kind === 'danger' || kind === 'dangerText' ? 'danger' : 'primary';
  const border = kind === 'secondary' ? color.line : kind === 'danger' ? color.danger : color.transparent;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={small ? 5 : 0}
      style={({ pressed }) => [
        styles.base,
        {
          height: small ? controlHeightSm : controlHeight,
          minWidth: controlHeight,
          backgroundColor: pressed && !inactive ? bgPressed : bg,
          borderColor: border,
          borderWidth: kind === 'secondary' || kind === 'danger' ? 1 : 0,
          paddingHorizontal: kind === 'text' || kind === 'dangerText' ? space[2] : small ? space[3] : space[4],
          opacity: disabled && !loading ? 0.45 : 1,
        },
        full && styles.full,
        style,
      ]}
    >
      <View style={styles.inner}>
        {loading ? (
          <>
            <ActivityIndicator color={filled ? color.onPrimary : color.primary} />
            {/* Invisible label keeps the width steady while working. */}
            <Text variant="section" style={styles.ghost}>
              {label}
            </Text>
          </>
        ) : (
          <>
            {icon ? <Icon name={icon} size={18} color={filled ? color.onPrimary : fg === 'danger' ? color.danger : color.primary} /> : null}
            <Text variant={small ? 'label' : 'section'} tone={fg} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  full: { alignSelf: 'stretch' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  ghost: { opacity: 0, position: 'absolute' },
});
