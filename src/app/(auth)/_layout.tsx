import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../state/session';
import { homeFor } from '../../state/guards';
import { color } from '../../ui/tokens';

/** Guard 5: a session on A-1, A-4 or A-5 goes to D-1 (or wherever the account needs to be). */
export default function AuthLayout() {
  const { me } = useSession();
  if (me) return <Redirect href={homeFor(me)} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }} />;
}
