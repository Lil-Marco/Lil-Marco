import { Redirect } from 'expo-router';
import { useSession } from '../state/session';
import { homeFor } from '../state/guards';

export default function Index() {
  const { me } = useSession();
  return <Redirect href={me ? homeFor(me) : '/login'} />;
}
