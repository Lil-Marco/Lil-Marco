import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
// Per-weight imports so only the six faces we use are bundled.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';
import { SessionProvider, useSession } from '../state/session';
import { ToastProvider } from '../ui/Toast';
import { api } from '../state/api';
import { color } from '../ui/tokens';

void SplashScreen.preventAutoHideAsync();

function Root() {
  const { ready } = useSession();
  // Fonts are progressive: never block the first paint on a font for more than a moment.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
  });

  useEffect(() => {
    if (ready && (fontsLoaded || fontError)) void SplashScreen.hideAsync();
  }, [ready, fontsLoaded, fontError]);

  // The simulator's workers: reconciliation sweeper, overdue flip, reminder dispatch.
  useEffect(() => {
    if (!api.tick) return;
    const t = setInterval(() => api.tick?.(), 10_000);
    return () => clearInterval(t);
  }, []);

  if (!ready || (!fontsLoaded && !fontError)) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
