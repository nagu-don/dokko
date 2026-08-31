# Fonepay (Dynamic QR) Integration Status

This document records the current integration state and the explicit
requirements for implementing a real Fonepay payment integration.

It is a **source of truth for what is and is not implemented**. Every claim
here is verified against the running code, not aspirational.

---

## Current state

| Item | Status |
| --- | --- |
| Mock payment provider | READY |
| Provider-neutral payment architecture | READY |
| Fonepay architecture (safe boundary) | READY |
| Fonepay API integration | NOT IMPLEMENTED |
| Fonepay credentials | NOT PROVIDED |
| Real Fonepay payments | DISABLED |

### What this means

- The active provider is **Mock** (`PAYMENT_PROVIDER=mock`,
  `MOCK_PAYMENT_ENABLED=true`). The full mock payment lifecycle works:
  initiate → simulate completion → server-side verification → order `paid`
  → settlement.
- The **architecture** is provider-neutral (`gateway/providerBase.js`,
  `gateway/config.js`). Adding a real provider requires only a new provider
  class and a config loader entry; the payment core (controllers, models,
  routes, UI) is unchanged.
- **Fonepay is a registered provider and can be *selected***
  (`PAYMENT_PROVIDER=fonepay`), but it is deliberately **never ready**:
  `gateway/fonepayProvider.js` is a **safe boundary only**. Every Fonepay
  entry point throws `FonepayNotConfiguredError`
  (`code = "FONEPAY_NOT_CONFIGURED"`). No Fonepay QR, payload, or HTTP call is
  ever fabricated, and selection never silently falls back to another provider
  — a misconfigured Fonepay fails safely.
- There are **no `FONEPAY_*` environment variables**. No official Fonepay
  credentials, merchant codes, or API parameters have been supplied.
- The legacy NCHL/NEPALPAY integration is **not** part of the active
  architecture; it exists only as reference (`gateway/nchlApi.js`,
  `gateway/nepalpayProvider.js`).

---

## Future requirements

The following remain **stubbed or unimplemented**. Each requires the
**official Fonepay documentation and verified credentials** to be supplied
before implementation may begin:

- **Authentication** — the mechanism Fonepay expects (credentials, API keys,
  OAuth, sessions, etc.).
- **Dynamic QR generation** — the exact request shape and the authoritative
  QR content Fonepay returns. Fonepay is authoritative; the codebase must
  never fabricate or reverse-guess a Fonepay QR locally.
- **Signing / hashing** — the exact signing, digest, and parameter-hash rules
  Fonepay specifies (algorithm, field order, encoding, key handling).
- **Callbacks / webhooks** — the official callback URL(s), payload schema, and
  security/verification requirements.
- **Transaction verification** — the official server-side transaction-query /
  status API and its response contract.
- **Refunds / reversals** — the official refund/reversal API and its process.
- **Production onboarding** — the real credentials, merchant provisioning,
  and go-live checklist provided by Fonepay.

### Rule

> **Do not implement undocumented Fonepay behavior.**
>
> Do not add `FONEPAY_*` variables, endpoints, payloads, signatures, hashing,
> QR construction, or callback handling that is not backed by the official
> Fonepay documentation. Until that documentation is supplied, keep the
> Fonepay provider as the safe, non-functioning boundary described above.

---

## Configuration

In `back-end/.env.example` (and development `.env`):

```
PAYMENT_PROVIDER=mock
MOCK_PAYMENT_ENABLED=true
```

- `PAYMENT_PROVIDER=mock` — active provider for development(default).
- `MOCK_PAYMENT_ENABLED=true` — enables the mock provider (development only;
  never in production).
- `PAYMENT_PROVIDER=fonepay` selects Fonepay but yields the safe
  not-configured 503 until official credentials and documentation are added.

## Security

- `.env` files and private certificates (`*.pfx`, `*.p12`, `*.pem`) are
  git-ignored and never committed.
- No secrets, credentials, or merchant codes are logged by the active payment
  path. When the real Fonepay integration is built, secrets must remain in
  the environment and must not be logged.
