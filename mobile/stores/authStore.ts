import { create } from 'zustand';
import { isApiError, type ApiError } from '@/services/api';
import {
  clearAuth,
  login as apiLogin,
  loginWithGoogle,
  persistAuth,
  register as apiRegister,
  restoreAuth,
  type GoogleInput,
  type LoginCredentials,
  type RegisterInput,
} from '@/services/auth';
import { validateSession } from '@/services/auth/profileService';
import { clearAuthToken, onUnauthorized, setAuthToken } from '@/services/auth';
import { queryClient } from '@/services/queryClient';
import type { AuthAttempt, AuthStatus, AuthUserLite, Role } from '@/types';

type SignInRunner = () => Promise<{ response: { token?: string; user?: AuthUserLite } }>;

interface AuthState {
  token: string | null;
  role: Role | null;
  user: AuthUserLite | null;
  status: AuthStatus;
  /** True once `initialize()` finished (SecureStore read done). */
  isHydrated: boolean;

  initialize: () => Promise<void>;
  loginCustomer: (credentials: LoginCredentials) => Promise<AuthAttempt>;
  loginVendor: (credentials: LoginCredentials) => Promise<AuthAttempt>;
  registerCustomer: (input: RegisterInput) => Promise<AuthAttempt>;
  registerVendor: (input: RegisterInput) => Promise<AuthAttempt>;
  googleSignIn: (role: Role, input: GoogleInput) => Promise<AuthAttempt>;
  logout: () => Promise<void>;

  /** Internal: runs a sign-in call, persists + publishes the session. */
  _signIn: (role: Role, run: SignInRunner) => Promise<AuthAttempt>;
}

/**
 * Collapse any thrown error into an AuthAttempt-shaped failure that carries
 * the message plus a kind/status for the UI to localize. Server `success:false`
 * payloads surface their `message`; transport failures get a classification.
 */
function failureOf(error: unknown, fallback: string): AuthAttempt {
  if (isApiError(error)) {
    const e = error as ApiError;
    return { ok: false, message: e.message, kind: e.kind, status: e.status };
  }
  const message = error instanceof Error ? error.message : fallback;
  return { ok: false, message, kind: 'unknown' };
}

/** Wire the axios 401 -> session-clear hook exactly once per process. */
let unauthorizedWired = false;
function wireUnauthorized(logout: () => Promise<void>): void {
  if (unauthorizedWired) return;
  unauthorizedWired = true;
  onUnauthorized(() => {
    void logout();
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  role: null,
  user: null,
  status: 'idle',
  isHydrated: false,

  async initialize() {
    wireUnauthorized(get().logout);

    try {
      const restored = await restoreAuth();
      if (!restored) {
        set({ token: null, role: null, user: null, status: 'unauthenticated' });
        return;
      }

      setAuthToken(restored.token);

      // Session validation: only clear when the backend explicitly rejects the
      // token (401 only — 403 is a business-rule denial, not a session issue).
      // Offline/timeout launch keeps the restored session.
      const valid = await validateSession(restored.role);
      if (valid === false) {
        await get().logout();
        return;
      }

      set({
        token: restored.token,
        role: restored.role,
        user: restored.user,
        status: 'authenticated',
      });
    } catch (error) {
      console.warn('[authStore] restore failed, starting unauthenticated', error);
      set({ token: null, role: null, user: null, status: 'unauthenticated' });
    } finally {
      set({ isHydrated: true });
    }
  },

  async loginCustomer(credentials) {
    return get()._signIn('customer', () => apiLogin('customer', credentials));
  },

  async loginVendor(credentials) {
    return get()._signIn('vendor', () => apiLogin('vendor', credentials));
  },

  async registerCustomer(input) {
    return get()._signIn('customer', () => apiRegister('customer', input));
  },

  async registerVendor(input) {
    return get()._signIn('vendor', () => apiRegister('vendor', input));
  },

  async googleSignIn(role, input) {
    return get()._signIn(role, () => loginWithGoogle(role, input));
  },

  async logout() {
    try {
      await clearAuth();
    } catch (error) {
      console.warn('[authStore] secure-store clear failed', error);
    }
    clearAuthToken();
    queryClient.clear();
    set({ token: null, role: null, user: null, status: 'unauthenticated' });
  },

  async _signIn(role: Role, run: SignInRunner) {
    set({ status: 'loading' });
    try {
      const { response } = await run();
      const token = response.token ?? null;
      const user = response.user ?? null;
      if (!token || !user) {
        const message =
          !token && !user
            ? 'Server did not return a session'
            : 'Server response was incomplete';
        set({ status: 'unauthenticated' });
        return { ok: false, message };
      }
      await persistAuth(role, token, user);
      setAuthToken(token);
      set({ token, role, user, status: 'authenticated' });
      return { ok: true };
    } catch (error) {
      const fallback = role === 'vendor' ? 'Vendor login failed' : 'Login failed';
      set({ status: 'unauthenticated' });
      return failureOf(error, fallback);
    }
  },
}));