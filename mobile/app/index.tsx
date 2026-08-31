import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

/**
 * `/` entry. The root layout already withholds this screen until the session
 * is restored, so by the time this renders we know the auth state.
 * Redirects to the appropriate experience. Customer and vendor homes are
 * distinct routes (`/home`, `/dashboard`) because route-group prefixes do not
 * affect URLs — two group-level `index` files would collide on `/`.
 */
export default function IndexRoute() {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.role);

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }
  return <Redirect href={role === 'vendor' ? '/dashboard' : '/home'} />;
}