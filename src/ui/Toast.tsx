import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { color, duration, elevation, radius, space } from './tokens';

interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
  action?: { label: string; onPress: () => void };
}

interface Ctx {
  show: (message: string, opts?: { kind?: Toast['kind']; action?: Toast['action'] }) => void;
}

const ToastContext = createContext<Ctx>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Bottom-centre on mobile. Success toasts auto-dismiss after four seconds; error
 * toasts stay until dismissed and carry the retry action where one exists.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<Ctx['show']>(
    (message, opts = {}) => {
      const id = nextId.current++;
      const kind = opts.kind ?? 'success';
      setToasts((t) => [...t.slice(-2), { id, message, kind, action: opts.action }]);
      AccessibilityInfo.announceForAccessibility(message);
      if (kind !== 'error') setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 104 }]}>
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const y = useRef(new Animated.Value(16)).current;
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: 0, duration: duration.base, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: duration.base, useNativeDriver: true }),
    ]).start();
  }, [o, y]);
  return (
    <Animated.View style={[styles.toast, { opacity: o, transform: [{ translateY: y }], borderLeftColor: toast.kind === 'error' ? color.attention : toast.kind === 'success' ? color.live : color.primary }]} accessibilityLiveRegion="polite">
      <Text variant="bodySm" tone="ink" style={{ flex: 1 }}>
        {toast.message}
      </Text>
      {toast.action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            toast.action!.onPress();
            onDismiss();
          }}
          style={styles.btn}
        >
          <Text variant="label" tone="primary">
            {toast.action.label}
          </Text>
        </Pressable>
      ) : null}
      {toast.kind === 'error' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} style={styles.btn}>
          <Text variant="label" tone="ink2">
            Dismiss
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space[4], right: space[4], alignItems: 'center', gap: space[2] },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    maxWidth: 480,
    width: '100%',
    backgroundColor: color.paper,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    paddingVertical: space[2],
    paddingLeft: space[4],
    paddingRight: space[2],
    minHeight: 48,
    ...elevation[2],
  },
  btn: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space[2] },
});
