import { Redirect, Stack, usePathname } from 'expo-router';
import { useSession } from '../../state/session';
import { color } from '../../ui/tokens';

export default function OnboardingLayout() {
  const { me } = useSession();
  const pathname = usePathname();
  if (!me) return <Redirect href={`/login?next=${encodeURIComponent(pathname)}`} />;
  if (!me.user.emailVerifiedAt) return <Redirect href="/signup/sent" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }} />;
}
