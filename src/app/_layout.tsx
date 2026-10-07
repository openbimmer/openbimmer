import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAutoConnect } from '@/lib/auto-connect';
import { iconFonts, textFonts } from '@/lib/fonts';
import { useSettings } from '@/store/settings';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 250 });

export const unstable_settings = {
  anchor: '(tabs)',
};

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
  },
};

const sheet = {
  presentation: 'formSheet' as const,
  sheetGrabberVisible: true,
  sheetCornerRadius: 28,
  contentStyle: { backgroundColor: colors.surface },
};

const pushed = {
  headerShown: true,
  headerTransparent: Platform.OS === 'ios',
  headerStyle: Platform.OS === 'android' ? { backgroundColor: colors.background } : undefined,
  headerTintColor: colors.text,
  headerTitleStyle: { fontFamily: 'Inter_600SemiBold', color: colors.text },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal' as const,
};

function Navigator() {
  const accepted = useSettings((s) => s.acceptedNotice);
  useAutoConnect();
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={accepted}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="connect" options={{ ...sheet, sheetAllowedDetents: [0.75, 1] }} />
          <Stack.Screen name="engine" options={{ ...sheet, sheetAllowedDetents: [0.85, 1] }} />
          <Stack.Screen name="channel" options={{ ...sheet, sheetAllowedDetents: [0.7, 1] }} />
          <Stack.Screen name="dtc/[code]" options={{ ...sheet, sheetAllowedDetents: 'fitToContents' }} />
          <Stack.Screen
            name="performance"
            options={{ presentation: Platform.OS === 'ios' ? 'fullScreenModal' : 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="log/[id]" options={{ ...pushed, title: 'Log' }} />
          <Stack.Screen name="adapters" options={{ ...pushed, title: 'Adapters' }} />
          <Stack.Screen name="console" options={{ ...pushed, title: 'Adapter console' }} />
          <Stack.Screen name="about" options={{ ...pushed, title: 'About' }} />
          <Stack.Screen name="engines" options={{ ...pushed, title: 'Supported engines' }} />
        </Stack.Protected>
        <Stack.Protected guard={!accepted}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ ...textFonts, ...iconFonts });
  const ready = loaded || !!error;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <Navigator />
    </GestureHandlerRootView>
  );
}
