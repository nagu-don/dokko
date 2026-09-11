import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

/**
 * Customer experience group (`/home`). Hard guard: a vendor or an anonymous
 * visitor can never reach these screens — even via a deep link.
 */
export default function CustomerLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }
  if (role === 'vendor') {
    return <Redirect href="/dashboard" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" options={{ title: 'Dokko' }} />
      <Stack.Screen name="cart" options={{ title: 'Cart' }} />
      <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
      <Stack.Screen name="order-success" options={{ title: 'Order placed' }} />
      <Stack.Screen name="orders/index" options={{ title: 'My orders' }} />
      <Stack.Screen name="orders/[id]" options={{ title: 'Order' }} />
      <Stack.Screen name="payment/[orderId]" options={{ title: 'Payment' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="report-problem" options={{ title: 'Report a problem' }} />
    </Stack>
  );
}