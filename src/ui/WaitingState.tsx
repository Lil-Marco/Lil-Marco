import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from './Text';
import { Icon } from './Icon';
import { color, space } from './tokens';

export const WAIT_BUDGET_S = 120;
const SIZE = 132;
const STROKE = 8;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * P-3 / A-9.4 / D-11. A ring that counts DOWN 120 s so waiting feels finite, a
 * three-step checklist, a help link after 20 s, and no cancel button. The
 * countdown runs on the client clock so the screen never appears frozen.
 * Nothing else on this screen moves.
 */
export function WaitingState({
  startedAt,
  maskedPhone,
  onDifferentNumber,
  onTimeout,
  confirming,
}: {
  startedAt: number;
  maskedPhone: string;
  onDifferentNumber?: () => void;
  onTimeout: () => void;
  confirming?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const [helpOpen, setHelpOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const timedOut = useRef(false);
  const elapsed = Math.max(0, (now - startedAt) / 1000);
  const left = Math.max(0, Math.ceil(WAIT_BUDGET_S - elapsed));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let reduce = false;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => (reduce = r));
    const start = Math.min(1, (Date.now() - startedAt) / 1000 / WAIT_BUDGET_S);
    progress.setValue(start);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(0, (1 - start) * WAIT_BUDGET_S * 1000),
      easing: Easing.linear,
      useNativeDriver: false,
    });
    if (!reduce) anim.start();
    return () => anim.stop();
  }, [progress, startedAt]);

  useEffect(() => {
    if (left === 0 && !timedOut.current) {
      timedOut.current = true;
      onTimeout();
    }
  }, [left, onTimeout]);

  const dashoffset = progress.interpolate({ inputRange: [0, 1], outputRange: [0, C] });
  const step = confirming ? 3 : elapsed > 4 ? 2 : 1;

  return (
    <View style={styles.wrap}>
      <View style={styles.ring} accessibilityLabel={`${left} seconds left`}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={color.lineSoft} strokeWidth={STROKE} fill="none" />
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={color.live}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${C} ${C}`}
            strokeDashoffset={dashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.ringLabel}>
          <Text variant="amountLg" tabular>
            {left}s
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: space[1] }}>
        <Text variant="title" align="center">
          Check your phone
        </Text>
        <Text variant="body" align="center">
          Prompt sent to{' '}
          <Text variant="monoSm" tone="ink" style={{ fontSize: 15 }}>
            {maskedPhone}
          </Text>
        </Text>
      </View>
      <View style={styles.list}>
        <Step done={step > 1} active={step === 1} label="Request sent" />
        <Step done={step > 2} active={step === 2} label="Check your phone and enter your M-Pesa PIN" />
        <Step done={false} active={step === 3} label="Confirming payment" />
      </View>
      {elapsed >= 20 ? (
        <View style={styles.help}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: helpOpen }} onPress={() => setHelpOpen((o) => !o)} style={styles.helpLink}>
            <Text variant="label" tone="primary">
              Didn’t get the prompt?
            </Text>
          </Pressable>
          {helpOpen ? (
            <View style={{ gap: space[2] }}>
              <Text variant="bodySm">• Check the phone is on and has signal.</Text>
              <Text variant="bodySm">• Look for a pending M-Pesa menu on the phone and close it.</Text>
              <Text variant="bodySm">• Make sure the number above is right.</Text>
              {onDifferentNumber ? (
                <Pressable accessibilityRole="button" onPress={onDifferentNumber} style={styles.helpLink}>
                  <Text variant="label" tone="primary">
                    Use a different number
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Step({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepDot, done ? { backgroundColor: color.live, borderColor: color.live } : active ? { borderColor: color.live } : null]}>
        {done ? <Icon name="check" size={14} color={color.onPay} /> : null}
      </View>
      <Text variant="bodySm" tone={done || active ? 'ink' : 'ink3'} style={{ flex: 1 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space[5], paddingVertical: space[4] },
  ring: { width: SIZE, height: SIZE },
  ringLabel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  list: { alignSelf: 'stretch', gap: space[3] },
  step: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  stepDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  help: { alignSelf: 'stretch', gap: space[2] },
  helpLink: { minHeight: 44, justifyContent: 'center' },
});
