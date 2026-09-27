import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { BusinessProfile } from '../../domain/types';
import { displayPhone, formatPhoneInput, normalisePhone } from '../../domain/phone';
import { Field } from '../../ui/Field';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Card, Row } from '../../ui/Blocks';
import { Icon } from '../../ui/Icon';
import { SenderHeader } from '../invoice/SenderHeader';
import { color, radius, space } from '../../ui/tokens';

export interface ProfileDraft {
  businessName: string;
  logoUri: string | null;
  phone: string;
  location: string;
  kraPin: string;
  invoicePrefix: string;
}

export function draftFrom(p: BusinessProfile): ProfileDraft {
  return {
    businessName: p.businessName,
    logoUri: p.logoUri,
    phone: p.phone ? displayPhone(p.phone) : '',
    location: p.location ?? '',
    kraPin: p.kraPin ?? '',
    invoicePrefix: p.invoicePrefix,
  };
}

const MAX_LOGO = 2 * 1024 * 1024;

/**
 * A-8 form + live invoice-header preview. Typing updates the preview within a
 * frame; a rejected upload shows the reason in place of the drop zone and keeps
 * the previous logo.
 */
export function ProfileForm({
  draft,
  onChange,
  errors,
  prefixLocked,
}: {
  draft: ProfileDraft;
  onChange: (d: ProfileDraft) => void;
  errors: Record<string, string>;
  prefixLocked?: boolean;
}) {
  const [logoError, setLogoError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [kraError, setKraError] = useState<string | null>(null);
  const set = (patch: Partial<ProfileDraft>) => onChange({ ...draft, ...patch });

  const pick = async () => {
    setLogoError(null);
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
    if (r.canceled) return;
    const a = r.assets[0];
    const type = a.mimeType ?? '';
    if (type && !/image\/(png|jpe?g)/.test(type)) {
      setLogoError('Use a PNG or JPG file.');
      return;
    }
    if (a.fileSize && a.fileSize > MAX_LOGO) {
      setLogoError(`That file is ${(a.fileSize / 1024 / 1024).toFixed(1)} MB. Logos can be up to 2 MB.`);
      return;
    }
    // Stored as a data URI so the same logo renders on screen and inside the PDF.
    set({ logoUri: a.base64 ? `data:${type || 'image/jpeg'};base64,${a.base64}` : a.uri });
  };

  return (
    <View style={{ gap: space[5] }}>
      <Card style={{ gap: space[3] }}>
        <Text variant="micro">Preview — how your invoices start</Text>
        <SenderHeader name={draft.businessName} logoUri={draft.logoUri} sub={[draft.location, draft.phone].filter(Boolean).join(' · ') || null} />
        <View style={styles.previewLine} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="monoSm">{(draft.invoicePrefix || 'INV-') + '0001'}</Text>
          <Text variant="bodySm">Amount due</Text>
        </Row>
      </Card>

      <Field label="Business name" value={draft.businessName} onChangeText={(t) => set({ businessName: t })} error={errors.businessName} hint="Appears as the sender on every invoice" />

      <View style={{ gap: space[2] }}>
        <Text variant="label">
          Logo <Text variant="label" tone="ink3">· optional</Text>
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={draft.logoUri ? 'Replace logo' : 'Upload logo'} onPress={pick} style={styles.drop}>
          {logoError ? (
            <Text variant="bodySm" tone="danger" align="center">
              {logoError} Tap to choose another.
            </Text>
          ) : (
            <Row>
              <Icon name="download" color={color.primary} />
              <Text variant="label" tone="primary">
                {draft.logoUri ? 'Replace logo' : 'Upload a PNG or JPG, up to 2 MB'}
              </Text>
            </Row>
          )}
        </Pressable>
        {draft.logoUri ? <Button label="Remove logo" kind="text" small onPress={() => set({ logoUri: null })} style={{ alignSelf: 'flex-start' }} /> : null}
      </View>

      <Field
        label="Phone number"
        value={draft.phone}
        onChangeText={(t) => {
          set({ phone: formatPhoneInput(t) });
          setPhoneError(null);
        }}
        onBlur={() => setPhoneError(draft.phone && !normalisePhone(draft.phone).ok ? 'Enter a phone number starting 07 or 01' : null)}
        keyboardType="phone-pad"
        mono
        placeholder="0712 345 678"
        error={phoneError ?? errors.phone}
        hint="Shown on your invoices, and where we send your M-Pesa test"
      />
      <Field label="Location" optional value={draft.location} onChangeText={(t) => set({ location: t })} placeholder="Thika, Kenya" />
      <Field
        label="KRA PIN"
        optional
        value={draft.kraPin}
        autoCapitalize="characters"
        onChangeText={(t) => {
          set({ kraPin: t.toUpperCase() });
          setKraError(null);
        }}
        onBlur={() => setKraError(draft.kraPin && !/^[AP]\d{9}[A-Z]$/.test(draft.kraPin.trim()) ? 'A KRA PIN looks like A000000000X' : null)}
        mono
        error={kraError ?? errors.kraPin}
        hint="Needed later for tax invoices and VAT"
      />
      <Field
        label="Invoice prefix"
        value={draft.invoicePrefix}
        onChangeText={(t) => set({ invoicePrefix: t.toUpperCase().slice(0, 8) })}
        mono
        autoCapitalize="characters"
        editable={!prefixLocked}
        hint={prefixLocked ? 'Changing the prefix after your first invoice would break the sequence.' : 'Your first invoice will be ' + (draft.invoicePrefix || 'INV-') + '0001'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  drop: { minHeight: 72, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: color.ink3, alignItems: 'center', justifyContent: 'center', padding: space[3], backgroundColor: color.paper },
  previewLine: { height: 1, backgroundColor: color.line },
});
