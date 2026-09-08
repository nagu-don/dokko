import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

/**
 * Vendor experience group (`/dashboard`). Hard guard: customers or anonymous
 * visitors can never reach these screens — even via a deep link.
 */
export default function VendorLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }
  if (role === 'customer') {
    return <Redirect href="/home" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" options={{ title: 'New Request' }} />
      <Stack.Screen name="onboarding" options={{ title: 'Set up' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="requests/[id]" options={{ title: 'Request' }} />
      <Stack.Screen name="accepted/index" options={{ title: 'Accepted orders' }} />
      <Stack.Screen name="accepted/[id]" options={{ title: 'Accepted order' }} />
      <Stack.Screen name="collect/[id]" options={{ title: 'Collect payment' }} />
      <Stack.Screen name="completed/[id]" options={{ title: 'Completed order' }} />
      <Stack.Screen name="items/index" options={{ title: 'Items needed' }} />
      <Stack.Screen name="notices" options={{ title: 'Notices' }} />
    </Stack>
  );
}