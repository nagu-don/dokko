# Dokko — Fresh Produce Marketplace & Delivery

**Dokko** is an online marketplace for fresh vegetables, fruits, and commodities in Nepal. Shoppers browse live daily market prices, build a cart in kilograms, and place delivery orders that are automatically routed to the nearest available vendor. Vendors accept and fulfil orders, collect payments (digital or cash), and get paid through periodic settlements. Admins approve vendors and items, manage orders, and process vendor payouts.

The whole system is split into **four** applications that run together:

| Application   | Path          | Purpose                                                            |
| ------------- | ------------- | ------------------------------------------------------------------ |
| `back-end`    | `back-end/`   | Node.js + Express REST API, MongoDB data layer, payment gateway, order-priority scheduler |
| `front-end`   | `front-end/`  | Customer storefront (browse, cart, checkout, order tracking)      |
| `vendor`      | `vendor/`     | Vendor app (new requests, accept/complete orders, payments)       |
| `admin`       | `admin/`      | Admin dashboard (approvals, orders, settlements, users, items)    |

---

## Tech Stack

**Backend**
- Node.js (ESM) + Express 5
- MongoDB with Mongoose (GeoJSON `2dsphere` geospatial queries)
- JSON Web Tokens (JWT) for authentication, Google OAuth login
- Node-cron + an in-process **scheduler** for order-priority stage advancement
- NepalPay (EMVCo QR) payment gateway, plus a `mock` provider for development
- `qrcode`, `multer`, `bcrypt`, `cheerio` (market-price scraper)

**Frontends** (customer, vendor, admin)
- React 19 + Vite
- `react-router-dom`, `axios`
- MapLibre GL for the delivery-location map picker
- Bilingual UI (English / नेपाली), light & dark themes, Nepali numerals

---

## Features

**Customer storefront (`front-end`)**
- Live catalogue driven by daily updated market prices (per kg)
- Cart with 0.1 kg stepper, quantity input, and press-and-hold controls
- Map-based delivery drop-off pin + saved/preferred locations
- Checkout with auto vendor matching and a delivery-charge preview
- Order tracking (searching → assigned → delivered) and purchase history
- Bilingual English/नेपाली, Nepali numerals, light/dark theme toggle

**Vendor app (`vendor`)**
- New request feed (nearby orders sorted by distance) with accept/complete
- Accepted & completed order lists, item/hide-unhide summary
- Payment handling: initiate digital payment (NepalPay QR), record cash, revoke/cancel/verify
- Live location updates, payout/bank details, availability toggle

**Admin dashboard (`admin`)**
- Approve/reject vendors and marketplace items
- Manage admins (multi-admin approval workflow) with activity log
- Order management, users, vendors
- Settlements for vendor payouts with approve/pay/cancel lifecycle
- Vendor payables, cash transactions, commission configuration

**Order priority / vendor matching (`back-end`)**
- Progressive geo-search stages: `SEARCHING_0_5KM` → `SEARCHING_1KM` → `SEARCHING_CLOSEST` → `NO_VENDOR_AVAILABLE`
- Each stage lasts 60 s; a scheduler advances stages and the search radius & delivery charge grow as the search widens
- Delivery charge is set **only on vendor acceptance** (50 / 75 / 120 NRs for near / extended / closest fallback) — the customer is never charged a delivery fee before a vendor accepts
- Concurrency-safe, idempotent acceptance; charges are immutable once set

---

## Project Structure

```
dokko/
├── back-end/                 # REST API + services
│   ├── config/               # db.js, priorityConfig.js
│   ├── controllers/          # route handlers
│   ├── dataUpdate/           # daily market-price scraper & seed
│   ├── gateway/              # payment provider (nepalpay / mock)
│   ├── middleware/           # auth guards (user/vendor/admin)
│   ├── models/               # Mongoose schemas
│   ├── services/             # geo matching, priority service, scheduler
│   ├── test/                 # integration tests (isolated test DB)
│   ├── uploads/              # item images
│   ├── routes/               # Express routers
│   └── server.js             # API entry point (port 4000)
├── front-end/                # customer storefront (Vite) — port 5173
├── vendor/                   # vendor app (Vite) — port 5174
├── admin/                    # admin dashboard (Vite) — port 5175
└── README.md
```

---

## Prerequisites

- **Node.js** 20+ (ESM)
- **MongoDB** — local instance, or an Atlas connection string
- **npm**

---

## Setup & Installation

Install dependencies for each application:

```bash
# Backend
cd back-end
npm install

# Customer storefront
cd ../front-end
npm install

# Vendor app
cd ../vendor
npm install

# Admin dashboard
cd ../admin
npm install
```

### Configuration

Each app reads its own `.env` file (see `back-end/.env.example` for the full backend schema).

**`back-end/.env`:**
```env
JWT_SECRET=your-secret
MONGO_URI=mongodb://localhost:27017/dokko
GOOGLE_CLIENT_ID=your-google-oauth-client-id

# Prime admin is auto-created on server start
PRIME_ADMIN_ID=

# Payment provider: "nepalpay" | "mock"
PAYMENT_PROVIDER=nepalpay

# Internal company bank account (never exposed to the frontend)
COMPANY_BANK_ACCOUNT=

# NepalPay (EMVCo QR) config
NEPALPAY_MODE=real
NCHL_MERCHANT_ACCOUNT_TEMPLATE=
NCHL_MERCHANT_NAME=DOKKO
NCHL_MERCHANT_CITY=Kathmandu

# Dev only — never enable in production
MOCK_PAYMENT_ENABLED=false
```

**`front-end/.env` and `vendor/.env`** only need the Google OAuth client ID (must match the backend):

```env
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

> The frontends call the API at `http://localhost:4000` (see `front-end/src/context/Context.jsx`).

---

## Running Locally

**1. Start the backend API** (auto-runs the market-price update and the order-priority scheduler):

```bash
cd back-end
npm run server        # nodemon server.js  → http://localhost:4000
```

**2. Start the customer storefront:**

```bash
cd front-end
npm run dev           # → http://localhost:5173
```

**3. Vendor app:**

```bash
cd vendor
npm run dev           # → http://localhost:5174
```

**4. Admin dashboard:**

```bash
cd admin
npm run dev           # → http://localhost:5175
```

---

## Daily Market-Price Update

On startup, `back-end/dataUpdate/dataUpdate.js` attempts to fetch the latest daily commodity prices (and optionally scrapes them via `scraper.js`), stores them in `market-prices.json`, and updates the `items` collection. The storefront catalogue and vendor "items needed" board reflect these daily prices (min / avg / max per kg, in English and Nepali).

---

## Testing

The backend ships integration tests that run against an **isolated test database** — never the live `dokko` database.

```bash
cd back-end

npm test              # run the full test suite (safe runner)
npm run test:priority # order-priority hardening suite
npm run test:qr       # EMVCo QR payment suite
```

Test-safety guarantees:

- `test/helpers/testDb.js` **derives** a test URI by replacing the `MONGO_URI` database name with `<name>_test` (or uses `TEST_MONGO_URI`).
- It **hard-aborts** unless the connected database name ends in `_test` (or is explicitly allow-listed via `ISOLATED_TEST_DB`).
- `test/runAll.js` refuses to run against a non-`_test` database.
- Only uniquely-prefixed fixture records are created/deleted, so any leftover test data can never break a future run.

---

## Order Priority Flow (how a customer order is fulfilled)

1. A customer places an order with a delivery drop-off (map pin). `subtotal` + `additionalCharges` are set; `deliveryCharge` stays `null` — **no delivery fee is estimated before a vendor accepts.**
2. The order enters `SEARCHING_0_5KM`. Eligible vendors within **0.5 km** of the drop-off see it as a *new request*.
3. If none accepts within **60 s**, the scheduler advances the order to `SEARCHING_1KM` (radius **1 km**).
4. If still unaccepted, it advances to `SEARCHING_CLOSEST`, offered to the single nearest eligible vendor.
5. On **acceptance**, the delivery charge is locked (50 / 75 / 120 NRs), `total = subtotal + deliveryCharge + additionalCharges`, and the order becomes `ASSIGNED`.
6. If no vendor is ever available, the order moves to `NO_VENDOR_AVAILABLE` and the customer is never charged a delivery fee.

All of these rules live in a single source of truth, `back-end/config/priorityConfig.js`. The scheduler (`back-end/services/priorityScheduler.js`) is idempotent, and acceptance is concurrency-safe and resistant to retries.

---

## Payment System

- **Profile-based providers** loaded from environment variables (`back-end/gateway/`): `nepalpay` (live EMVCo QR) and `mock` (development).
- Vendors can **initiate a digital payment** (NepalPay), **record a cash payment**, **cancel/revoke** a payment, and **verify** a payment status.
- Orders track financial state via `paymentStatus` (`unpaid → pending → paid → failed → refunded`) and `paymentMethod` (`nepalpay | mock | cash | cod`).

> NepalPay requires a configured merchant account. In an unconfigured sandbox, gateway calls return a `503`, so the `payment`/`paymentVerification`/`settlement` test suites expect those conditions.

---

## NPM Scripts

| App | Script | Description |
| --- | ------ | ----------- |
| `back-end` | `npm run server` | Start the API with nodemon (port 4000) |
| `back-end` | `npm test` | Run the full backend test suite (isolated test DB) |
| `back-end` | `npm run test:priority` | Order-priority hardening suite |
| `back-end` | `npm run test:qr` | EMVCo QR payment suite |
| `front-end` | `npm run dev` / `npm run build` | Vite dev server / production build |
| `vendor` | `npm run dev` / `npm run build` | Vite dev server / production build |
| `admin` | `npm run dev` / `npm run build` | Vite dev server / production build |

---

## Environment Ports

| Service | Port | URL |
| ------- | ---- | --- |
| Backend API | 4000 | http://localhost:4000 |
| Customer storefront | 5173 | http://localhost:5173 |
| Vendor app | 5174 | http://localhost:5174 |
| Admin dashboard | 5175 | http://localhost:5175 |
