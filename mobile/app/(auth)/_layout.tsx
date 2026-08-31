import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

/** Auth screens. Never visible once a session exists. */
export default function AuthLayout() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);

  if (status === 'authenticated') {
    return <Redirect href={role === 'vendor' ? '/dashboard' : '/home'} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" options={{ title: 'Sign in' }} />
      <Stack.Screen name="register" options={{ title: 'Create account' }} />
    </Stack>
  );
}