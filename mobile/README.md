# Dokko Mobile

React Native (Expo) app for Dokko's customer + vendor experiences.
Single app, role-based navigation. Phase 1 = foundation only (no marketplace
screens yet).

## Prerequisites

- Node 24+, npm 11 (npx available)
- Expo Go on a device/emulator, or an Android/iOS dev build
- The Dokko backend running on port 4000: `cd back-end && npm run dev`

## Getting started

```bash
npm install
npx expo start        # then press a (Android) / i (iOS)
# or: npm run android | npm run ios
```

> `node_modules` can silently mis-extract on Windows (missing files inside
> packages). If Metro errors about a missing file inside a package, reinstall
> that package: `npm install <pkg>`.

## Environment variables

Copy `.env.example` to `.env` only if you must override the API URL. There
are NO secrets here — backend/payment credentials stay server-side.

| Variable | Purpose | Default |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | Absolute API base URL | *auto-derived in dev* |

Base URL resolution order (see `config/env.ts`):
1. `EXPO_PUBLIC_API_URL` if set.
2. Dev: host serving Metro (`expo start`) → `http://<host>:4000`; Android
   emulator → `http://10.0.2.2:4000`; else `http://localhost:4000`.
3. Production: `EXPO_PUBLIC_API_URL` is REQUIRED (throws if unset).

Item images are built as `${API_BASE_URL}/images/<filename>` via
`buildImageUrl()`.

## Directory structure

```
app/            Expo Router routes: (auth), (customer), (vendor) groups
components/     Shared UI (PlaceholderScreen, LoadingView)
config/         env.ts — env/base URL resolution
constants/      storage key registry
hooks/          useAppTheme
i18n/           en/np dictionaries + t/money/num/iname/tMsg helpers
services/
  api/          axios client + config + centralized error/response handling
  auth/         authService, authStorage (SecureStore), token provider
  queryClient.ts TanStack Query client (defaults)
storage/        secureStorage (tokens) + localStorage (AsyncStorage) wrappers
stores/         authStore, settingsStore (Zustand)
theme/          light/dark palettes + spacing
types/          API envelopes, auth, user, vendor, location
utils/          nepaliNumbers, format, search (ported from web)
```

## Authentication & storage

- Tokens + auth profile → **expo-secure-store** (Keychain/Keystore).
- Cart/lang/theme/etc → **AsyncStorage** via `storage/` wrappers (no direct
  AsyncStorage imports in screens).
- JWT is attached automatically by the axios request interceptor (Bearer).
  Login/register/google call the exact backend endpoints
  (`/api/users|vendors/*`); role is derived from which endpoint signed in.
- No refresh/revocation yet — backend has none (Phase 0 blocking items).
- `logout()` clears SecureStore session + memory; AsyncStorage data is kept.

## Navigation

```
app/_layout.tsx          root Stack + Query providers + Stack.Protected guards
app/index.tsx            splash/role redirect: /login | /home | /dashboard
app/(auth)/login|register
app/(customer)/home      customer experience  (/home)
app/(vendor)/dashboard   vendor experience    (/dashboard)
```

Guards (role = which auth endpoint was used) in the root layout AND each
group layout; deep links cannot land on the wrong experience.

## Development commands

```bash
npm run start          # expo start
npm run typecheck      # tsc --noEmit
npm run export:android # production bundle check (no device needed)
npx expo-doctor        # dependency/config health checks
```

Typed routes (`.expo/types/router.d.ts`) regenerate whenever the dev server
runs — running `npm run typecheck` before the first `expo start` still works
via the untyped fallback.

## Backend / web safety

This app only ADDS `mobile/`. It does not modify `front-end/`, `vendor/` or
`admin/`. All money/priority/geo/payment logic stays server-side (see Phase 0
reference, `mobileref.txt`).

Routing lookups for the vendor navigation map go through the Dokko backend: the
map posts its GPS position + the drop-off to `POST /api/vendors/route`
(authVendor-guarded relay in `back-end/routes/vendorRouter.js` +
`vendorController.js`), which calls its own OSRM providers in fallback order.
The app never sends coordinates to a third-party host directly.