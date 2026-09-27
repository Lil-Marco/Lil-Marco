/**
 * Small layout pieces and the remaining components from Design Brief §05:
 * Card, Banner, StatCard, ReceiptBlock, EmptyState, Skeleton, FilterChip,
 * Checkbox, Toggle, Segmented, Divider, KeyValue.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { Button } from './Button';
import { color, controlHeight, elevation, radius, space, type ColorToken } from './tokens';

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && styles.cardPad, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function Row({ children, style, gap = space[2] }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function KeyValue({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <Row style={styles.kv}>
      <Text variant={strong ? 'section' : 'bodySm'} tone={strong ? 'ink' : 'ink2'}>
        {k}
      </Text>
      {typeof v === 'string' ? (
        <Text variant={strong ? 'section' : 'bodySm'} tone="ink" tabular selectable>
          {v}
        </Text>
      ) : (
        v
      )}
    </Row>
  );
}

// ---------------------------------------------------------------------------

type BannerTone = 'attention' | 'primary' | 'danger';

export function Banner({
  title,
  body,
  action,
  onAction,
  onDismiss,
  tone = 'attention',
}: {
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  tone?: BannerTone;
}) {
  const bg: ColorToken = tone === 'attention' ? 'attentionTint' : tone === 'danger' ? 'dangerTint' : 'primaryTint';
  const fg: ColorToken = tone;
  return (
    <View style={[styles.banner, { backgroundColor: color[bg], borderColor: color[fg] }]} accessibilityRole="alert">
      <Icon name={tone === 'primary' ? 'help' : 'alert'} color={color[fg]} />
      <View style={styles.bannerText}>
        <Text variant="section" tone="ink">
          {title}
        </Text>
        {body ? <Text variant="bodySm">{body}</Text> : null}
        {action && onAction ? (
          <Pressable accessibilityRole="link" onPress={onAction} style={styles.bannerAction} hitSlop={8}>
            <Text variant="label" tone="primary">
              {action} →
            </Text>
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} style={styles.bannerClose}>
          <Icon name="close" size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

export function StatCard({ label, value, sub, onPress, highlight }: { label: string; value: ReactNode; sub: string; onPress?: () => void; highlight?: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!highlight) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      pulse.setValue(1);
      Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: false }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [highlight, pulse]);
  const bg = pulse.interpolate({ inputRange: [0, 1], outputRange: [color.paper, color.payTint] });
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${sub}`} onPress={onPress} style={styles.statWrap}>
      {({ pressed }) => (
        <Animated.View style={[styles.card, styles.cardPad, styles.stat, { backgroundColor: pressed ? color.canvas : bg }]}>
          <Text variant="micro">{label}</Text>
          {value}
          <Text variant="bodySm" numberOfLines={1}>
            {sub}
          </Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

/** The single most-copied string in the product — large, mono, letter-spaced, selectable. Never truncated. */
export function ReceiptBlock({ code, amountLine, when, label = 'M-PESA RECEIPT' }: { code: string; amountLine: string; when: string; label?: string }) {
  return (
    <View style={styles.receipt}>
      <Text variant="micro" tone="payHover">
        {label}
      </Text>
      <Text variant="mono" tone="ink" selectable style={styles.receiptCode} accessibilityLabel={`Receipt code ${code.split('').join(' ')}`}>
        {code}
      </Text>
      <Text variant="bodySm" tone="ink" tabular selectable>
        {amountLine}
      </Text>
      <Text variant="bodySm" selectable>
        {when}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

/** One line of plain copy plus the screen's primary action. No illustration with a character. */
export function EmptyState({ text, action, onAction, kind = 'primary' }: { text: string; action?: string; onAction?: () => void; kind?: 'primary' | 'secondary' }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyArt}>
        <Icon name="invoice" size={28} color={color.ink3} />
      </View>
      <Text variant="body" align="center">
        {text}
      </Text>
      {action && onAction ? <Button label={action} kind={kind} onPress={onAction} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.empty}>
      <Text variant="section" align="center">
        {message}
      </Text>
      <Button label="Try again" onPress={onRetry} />
    </View>
  );
}

/** Skeleton rows shaped like the content they replace. Pulses no faster than 1.5 s. */
export function Skeleton({ rows = 4, height = 56 }: { rows?: number; height?: number }) {
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(o, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(o, { toValue: 0.5, duration: 800, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [o]);
  return (
    <View style={{ gap: space[2] }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }).map((_, i) => (
        <Animated.View key={i} style={[styles.skel, { height, opacity: o }]}>
          <View style={styles.skelA} />
          <View style={styles.skelB} />
        </Animated.View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------

export function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.filter, { backgroundColor: selected ? color.primaryTint : color.paper, borderColor: selected ? color.primary : color.line }]}
    >
      <Text variant="label" tone={selected ? 'primary' : 'ink2'}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={styles.check}>
      <View style={[styles.box, { backgroundColor: checked ? color.primary : color.paper, borderColor: checked ? color.primary : color.ink3 }]}>
        {checked ? <Icon name="check" size={16} color={color.onPrimary} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodySm" tone="ink">
          {label}
        </Text>
        {hint ? <Text variant="bodySm">{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Toggle({ label, value, onChange, hint, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text variant="bodySm" tone="ink">
          {label}
        </Text>
        {hint ? <Text variant="bodySm">{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: color.primary, false: color.line }}
        thumbColor={color.paper}
        ios_backgroundColor={color.line}
      />
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View style={styles.seg} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, on && styles.segOn]}
          >
            <Text variant="label" tone={on ? 'ink' : 'ink2'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <Row style={styles.sectionTitle}>
      <Text variant="section" accessibilityRole="header" style={{ flex: 1 }}>
        {children}
      </Text>
      {action}
    </Row>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.paper, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, ...elevation[1] },
  cardPad: { padding: space[4] },
  divider: { height: 1, backgroundColor: color.line },
  kv: { justifyContent: 'space-between', minHeight: 28 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], padding: space[3], paddingLeft: space[4], borderRadius: radius.md, borderLeftWidth: 3 },
  bannerText: { flex: 1, gap: 2 },
  bannerAction: { marginTop: space[1], minHeight: 28, justifyContent: 'center' },
  bannerClose: { width: controlHeight, height: controlHeight, alignItems: 'center', justifyContent: 'center', marginTop: -space[2], marginRight: -space[2] },
  statWrap: { flexGrow: 1, flexBasis: '45%' },
  stat: { gap: space[1], minHeight: 104 },
  receipt: { backgroundColor: color.payTint, borderRadius: radius.md, padding: space[4], gap: space[1] },
  receiptCode: { fontSize: 22, lineHeight: 30, letterSpacing: 3 },
  empty: { alignItems: 'center', gap: space[4], paddingVertical: space[7], paddingHorizontal: space[5] },
  emptyArt: { width: 56, height: 56, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  skel: { backgroundColor: color.paper, borderRadius: radius.md, borderWidth: 1, borderColor: color.lineSoft, padding: space[3], justifyContent: 'center', gap: space[2] },
  skelA: { height: 12, width: '45%', borderRadius: radius.sm, backgroundColor: color.lineSoft },
  skelB: { height: 10, width: '28%', borderRadius: radius.sm, backgroundColor: color.lineSoft },
  filter: { minHeight: controlHeight - 8, paddingHorizontal: space[3], borderRadius: radius.full, borderWidth: 1, justifyContent: 'center' },
  check: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: controlHeight },
  box: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: controlHeight },
  seg: { flexDirection: 'row', backgroundColor: color.lineSoft, borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, minHeight: controlHeight - 6, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm + 2 },
  segOn: { backgroundColor: color.paper, ...elevation[1] },
  sectionTitle: { marginTop: space[2] },
});
