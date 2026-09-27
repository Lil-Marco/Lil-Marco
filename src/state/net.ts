import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/** True unless the device positively reports it has no connection. */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        setOnline(s.isConnected !== false);
      }),
    [],
  );
  return online;
}
