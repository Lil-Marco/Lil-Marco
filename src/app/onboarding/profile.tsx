import { useState } from 'react';
import { router } from 'expo-router';
import { api } from '../../state/api';
import { useSession } from '../../state/session';
import { isApiError } from '../../api/errors';
import { Screen } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ProfileForm, draftFrom, type ProfileDraft } from '../../features/profile/ProfileForm';
import { normalisePhone } from '../../domain/phone';

/** A-8 Business profile — step 1 of 2. */
export default function OnboardingProfile() {
  const { me, refreshMe } = useSession();
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFrom(me!.profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Both Continue and Skip pass guard 4; a skipped profile (no phone) keeps a
  // "finish your profile" banner on the dashboard instead of blocking the app.
  const save = async (validate: boolean) => {
    setBusy(true);
    setErrors({});
    try {
      await api.updateProfile({
        businessName: validate ? draft.businessName : draft.businessName.trim() || me!.user.name,
        logoUri: draft.logoUri,
        phone: draft.phone && (validate || normalisePhone(draft.phone).ok) ? draft.phone : null,
        location: draft.location || null,
        kraPin: draft.kraPin && (validate || /^[AP]\d{9}[A-Z]$/.test(draft.kraPin.trim())) ? draft.kraPin : null,
        invoicePrefix: draft.invoicePrefix || 'INV-',
        profileCompletedAt: me!.profile.profileCompletedAt ?? new Date().toISOString(),
      });
      await refreshMe();
      router.replace('/onboarding/mpesa');
    } catch (e) {
      if (isApiError(e, 'VALIDATION') && e.details) setErrors(e.details);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Your business"
      back={false}
      subtitle={<Text variant="bodySm">Step 1 of 2 · Everything here appears on your invoices</Text>}
      footer={
        <>
          <Button label="Continue" kind="primary" full onPress={() => save(true)} disabled={!draft.businessName.trim()} loading={busy} />
          <Button label="Skip for now" kind="text" full onPress={() => save(false)} />
        </>
      }
    >
      <ProfileForm draft={draft} onChange={setDraft} errors={errors} prefixLocked={me!.profile.invoicesSentEver > 0} />
    </Screen>
  );
}
