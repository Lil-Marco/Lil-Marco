import { useState } from 'react';
import { router } from 'expo-router';
import { api } from '../../state/api';
import { useResource } from '../../state/useResource';
import { Banner as BannerView } from '../../ui/Blocks';
import { useToast } from '../../ui/Toast';
import type { Banner } from '../../domain/types';

// Dismissals live for the app session; informational banners only.
const dismissed = new Set<string>();

/** At most one banner, picked by the UX Flow §3 priority. Two are never dismissible. */
export function BannerSlot() {
  const { data } = useResource(() => api.banners(), []);
  const toast = useToast();
  const [, force] = useState(0);
  const banner = (data ?? []).find((b) => !(b.dismissible && dismissed.has(b.kind)));
  if (!banner) return null;

  const act = async (b: Banner) => {
    switch (b.kind) {
      case 'MPESA_NOT_CONNECTED':
        router.push('/onboarding/mpesa');
        break;
      case 'MPESA_INVALID':
        router.push({ pathname: '/onboarding/mpesa', params: { step: '3', from: 'settings' } });
        break;
      case 'EMAIL_UNVERIFIED':
        await api.resendVerification();
        toast.show('Verification email sent');
        break;
      case 'PAYMENT_ATTENTION':
        if (b.invoiceId) router.push(`/app/invoices/${b.invoiceId}`);
        break;
      case 'PAST_DUE':
        router.push({ pathname: '/app/settings/upgrade', params: { plan: 'PRO' } });
        break;
      case 'PLAN_NEAR_LIMIT':
        router.push('/app/settings/billing');
        break;
      case 'PROFILE_INCOMPLETE':
        router.push('/app/settings/business');
        break;
    }
  };

  return (
    <BannerView
      title={banner.title}
      body={banner.body}
      action={banner.action}
      onAction={() => act(banner)}
      tone={banner.kind === 'PLAN_NEAR_LIMIT' || banner.kind === 'PROFILE_INCOMPLETE' ? 'primary' : 'attention'}
      onDismiss={
        banner.dismissible
          ? () => {
              dismissed.add(banner.kind);
              force((n) => n + 1);
            }
          : undefined
      }
    />
  );
}
