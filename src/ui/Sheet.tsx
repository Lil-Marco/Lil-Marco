import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Icon } from './Icon';
import { breakpoint, color, controlHeight, elevation, radius, space } from './tokens';

interface Props {
  visible: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
  /** P-3 cannot be dismissed: cancelling here would not cancel Safaricom's prompt. */
  dismissible?: boolean;
  footer?: ReactNode;
  /** P-3 has no close control; the system back gesture still returns to P-1. */
  showClose?: boolean;
}

/**
 * Bottom sheet on mobile, centred modal above 640 px. Android's back gesture
 * closes it (onRequestClose) rather than leaving the screen behind it.
 */
export function Sheet({ visible, onClose, title, children, dismissible = true, footer, showClose = true }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const centred = width >= breakpoint.md;
  return (
    <Modal
      visible={visible}
      transparent
      animationType={centred ? 'fade' : 'slide'}
      onRequestClose={() => dismissible && onClose?.()}
      statusBarTranslucent
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.scrim, centred ? styles.scrimCentred : styles.scrimBottom]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={() => dismissible && showClose && onClose?.()} />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, centred ? styles.sheetCentred : styles.sheetBottom, { paddingBottom: centred ? space[5] : Math.max(insets.bottom, space[4]) }]}
        >
          {!centred ? <View style={styles.grabber} /> : null}
          {title || (dismissible && onClose && showClose) ? (
            <View style={styles.header}>
              <Text variant="title" style={styles.title} accessibilityRole="header">
                {title ?? ''}
              </Text>
              {dismissible && onClose && showClose ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
                  <Icon name="close" size={22} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} bounces={false}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: color.scrim },
  scrimBottom: { justifyContent: 'flex-end' },
  scrimCentred: { justifyContent: 'center', alignItems: 'center', padding: space[5] },
  sheet: { backgroundColor: color.paper, ...elevation[3], maxHeight: '92%' },
  sheetBottom: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space[2] },
  sheetCentred: { borderRadius: radius.lg, width: 480, maxWidth: '100%', paddingTop: space[4] },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.full, backgroundColor: color.line, marginBottom: space[2] },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: space[5], paddingRight: space[2], minHeight: controlHeight },
  title: { flex: 1 },
  close: { width: controlHeight, height: controlHeight, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space[5], paddingTop: space[2], paddingBottom: space[4], gap: space[4] },
  footer: { paddingHorizontal: space[5], gap: space[2] },
});
