import { forwardRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { color, controlHeight, font, radius, space } from './tokens';

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string | null;
  mono?: boolean;
  secure?: boolean;
  prefix?: string;
  align?: 'left' | 'right';
  optional?: boolean;
}

/**
 * Labels are always visible — placeholder-only labels are banned. Inputs are 16 px
 * so iOS does not zoom on focus. The error sits under its own field.
 */
export const Field = forwardRef<TextInput, Props>(function Field(
  { label, hint, error, mono, secure, prefix, align, optional, multiline, editable = true, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const border = error ? color.danger : focused ? color.primary : color.line;
  return (
    <View style={styles.wrap}>
      <Text variant="label" nativeID={`${label}-label`}>
        {label}
        {optional ? <Text variant="label" tone="ink3"> · optional</Text> : null}
      </Text>
      <View
        style={[
          styles.box,
          { borderColor: border, borderWidth: focused || error ? 2 : 1, backgroundColor: editable ? color.paper : color.canvas },
          multiline && styles.multiline,
        ]}
      >
        {prefix ? (
          <Text variant="bodySm" tone="ink3" style={styles.prefix}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          placeholderTextColor={color.ink3}
          editable={editable}
          secureTextEntry={secure && !reveal}
          multiline={multiline}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            styles.input,
            { fontFamily: mono ? font.mono : font.regular, textAlign: align ?? 'left', color: color.ink },
            multiline && styles.inputMultiline,
            // The box already draws the 2 px focus ring; drop the browser's second one on web.
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reveal ? `Hide ${label}` : `Show ${label}`}
            onPress={() => setReveal((r) => !r)}
            style={styles.reveal}
          >
            <Icon name={reveal ? 'eyeOff' : 'eye'} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="bodySm" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="bodySm">{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space[1] + 2 },
  box: {
    minHeight: controlHeight,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[3],
  },
  multiline: { alignItems: 'flex-start', paddingVertical: space[2] },
  prefix: { marginRight: space[2] },
  input: { flex: 1, minWidth: 0, fontSize: 16, minHeight: controlHeight - 4, paddingVertical: 0 },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: space[1] },
  reveal: { width: controlHeight - 4, height: controlHeight - 4, alignItems: 'center', justifyContent: 'center', marginRight: -space[2] },
});
