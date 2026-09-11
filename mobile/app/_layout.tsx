import { useEffect } from 'react';
import { Stack, usePathname } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/services/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { LoadingView } from '@/components/LoadingView';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { wireGlobalErrorReporting } from '@/utils/globalErrorHandlers';

/**
 * Root layout.
 * - Boots TanStack Query.
 * - Restores the auth session once on launch (SecureStore read).
 * - Guards every top-level screen by auth status + role using
 *   `Stack.Protected`. The group layouts add a second Redirect guard, so
 *   deep links / manual URLs can never land on the wrong experience.
 * - Wraps the tree in an error boundary that reports crashes to the backend,
 *   and wires global unhandled-error / promise-rejection reporting.
 */
export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);
  const pathname = usePathname();

  useEffect(() => {
    wireGlobalErrorReporting();
    initialize();
  }, [initialize]);

  if (!isHydrated) {
    return <LoadingView />;
  }

  return (
    <ErrorBoundary route={pathname}>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={status !== 'authenticated'}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
          </Stack.Protected>

          <Stack.Protected guard={status === 'authenticated' && role === 'customer'}>
            <Stack.Screen name="(customer)" />
          </Stack.Protected>

          <Stack.Protected guard={status === 'authenticated' && role === 'vendor'}>
            <Stack.Screen name="(vendor)" />
          </Stack.Protected>
        </Stack>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}