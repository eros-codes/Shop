# E-Commerce API

NestJS backend for an online shop - auth (OTP-gated signup, refresh
tokens, RBAC), products/categories with images and search, basket,
orders with discount codes and two payment methods (wallet, ZarinPal),
support tickets, and product reviews.

## Setup

```bash
npm install
cp .env.example .env   # fill in your own values - see below
npm run start:dev
```

The app won't boot if a required `.env` value is missing (fails fast
on purpose - see `app.module.ts`'s Joi schema).

API docs (Swagger): `http://localhost:3000/api/docs`
Health check: `http://localhost:3000/health`

## First admin account

`/users` (which can set a role) and every other admin-only route are
locked down - there's no API path to create the first admin. Run this
once instead:

```bash
ADMIN_MOBILE=09120000000 ADMIN_PASSWORD=SomePassword1 npm run seed:admin
```

That admin can then promote anyone else via `PATCH /users/:id/role`.

## Auth flow

Registration is OTP-gated:
1. `POST /auth/register` - validates input, sends a 6-digit code (via
   sms.ir if `SMSIR_API_KEY` + `SMSIR_OTP_TEMPLATE_ID` are set,
   otherwise it's printed to the console). No account exists yet.
2. `POST /auth/verify-otp` - confirms the code, creates the account,
   returns `accessToken` in the body and sets `refreshToken` as an
   httpOnly cookie (logged in immediately).

`accessToken` is short-lived (15 min, `JWT_EXPIRATION`) - store it in
memory on the frontend (not localStorage) and send it as
`Authorization: Bearer <token>`. The refresh token never touches
frontend JS at all: it's an httpOnly cookie scoped to `/auth`.
Call **every** `/auth/*` endpoint (register, verify-otp, login,
refresh, logout) with `credentials: 'include'` (fetch) or
`withCredentials: true` (axios) - not just refresh/logout. If the
frontend is on a different origin, the browser silently drops the
`Set-Cookie` from login/verify-otp's response without this, and you'll
spend a while wondering why refresh never works. When the access
token expires, `POST /auth/refresh` gets a new pair -
the old refresh token stops working the moment a new one is issued
(rotation). `POST /auth/logout` invalidates the refresh token for good.

## Payments

Two ways to pay for an order (`CreateOrderDto`): `payWithWallet` or
`payWithZarinpal` (mutually exclusive). ZarinPal also backs wallet
top-ups (`POST /wallets/:id/charge/request`). Both flows redirect the
user to `paymentUrl`, then ZarinPal calls back to
`/payments/zarinpal/callback/order` or
`/payments/zarinpal/callback/wallet-charge` - set `FRONTEND_URL` once
you have success/failure pages for these to redirect to (otherwise
they return plain JSON).

`BACKEND_URL` needs to be reachable from the public internet for the
callback to work - `localhost` only works behind a tunnel (ngrok or
similar) during local testing.

## Migrating to production

`synchronize` (auto schema sync) only runs when `NODE_ENV` isn't
`production`. The schema itself now ships as a migration, so a fresh
production database is built by running them:

```bash
npm ci                 # installs exactly what package-lock.json pins
npm run build
npm run migration:run  # creates the schema, then the data migrations
npm run start:prod
```

`migration:run` is safe on a database that already has the schema (the
initial migration detects it and does nothing).

### Production checklist

The app refuses to start in production with a configuration that would
only fail later, in front of a customer:

- `CORS_ORIGIN` must name your real frontend domain(s), not `*`
- `ZARINPAL_MERCHANT_ID` must be set, and `ZARINPAL_MODE=production`
- `BACKEND_URL` must be the public `https://` address of this API -
  payment callback URLs are built from it

Worth setting deliberately:

- `TRUST_PROXY` - number of reverse proxies in front of the app (`1`
  for a single Nginx). Without it every client behind the proxy shares
  one rate-limit bucket; with a blind `true` a client could spoof its
  own IP, which is why the default trusts nothing.
- `THROTTLE_STORAGE=database` whenever more than one instance runs -
  in-memory counters are per process, so N instances allow N times the
  limit.
- `SWAGGER_ENABLED` - docs are off in production by default; if you
  publish them, set `SWAGGER_USER`/`SWAGGER_PASSWORD` too.
- Probes: `/health/live` for liveness (process only) and
  `/health/ready` for readiness (checks the database). Pointing a
  liveness probe at a database check turns a DB blip into a restart
  loop.

`.env` is deliberately not part of any copy of this project you share -
it holds live database, JWT, SMS and payment credentials. Start from
`.env.example`, and if a real `.env` has ever been sent anywhere, treat
those values as burned and rotate them.

## Money, shipping and invoices

Every amount in this project is an **integer number of Toman** - product
prices, wallet balances, shipping costs, order totals. ZarinPal is
called with currency `IRT` to match.

An order carries its bill itemised:

```
total_price = items_total - discount_amount + shipping_cost + tax_amount + cod_fee
```

- **Shipping** is a method (پست پیشتاز, پیک, ...) priced per zone: the
  base cost covers the first kilogram, each started kilogram after it
  adds `per_kg_cost`, and an order at or above the zone's
  `free_shipping_threshold` ships free. `POST /shipping/quote` answers
  the options, their price and their delivery window before the order
  exists. When several methods serve an address, checkout requires
  `shippingMethodId` rather than choosing for the customer.
- **Tax** is `TAX_RATE_PERCENT` (default 10) on the goods after the
  discount; shipping is not taxed.
- **Cash on delivery** (`payOnDelivery`) needs a carrier that collects
  money, adds that carrier's `cash_on_delivery_fee`, and is capped by
  `COD_MAX_AMOUNT`. The order is a confirmed sale straight away -
  reserved and invoiced - and an admin marks it paid when the courier
  settles.
- **Invoice numbers** look like `INV-1404-000123`: the Persian year plus
  a counter held in `invoice_sequences`, handed out by a single atomic
  statement so two checkouts can never share one. An order gets its
  number the moment it becomes a real sale (wallet paid, cash on
  delivery placed, or a gateway payment verified).

## Order SMS

Customers are told when their order is paid (or placed, for cash on
delivery), shipped, delivered or cancelled. Each event maps to one
approved sms.ir template, configured by environment variable - leave one
empty and that message is simply not sent, so the shop can switch them
on one at a time.

Three things worth knowing about how this behaves:

- messages are sent **after** the order's transaction commits, and a
  failure is recorded rather than thrown: an SMS outage must never roll
  back a paid order;
- every send is a row in `notifications`, unique per (order, event), so
  a replayed payment callback or a re-run job cannot tell someone twice
  that their order shipped - and support can answer "did they get it?";
- failed ones are retried by a job for a few attempts, then left alone.

Marking an order `sent` accepts `tracking_code` in the same request, and
that code travels with the message.

## Errors a client can act on

Every error carries a stable `code` beside the message:

```json
{
  "statusCode": 400,
  "code": "INSUFFICIENT_STOCK",
  "message": "Red Shirt (black / L) does not have enough stock",
  "details": { "productId": 12, "variantId": 44, "available": 2, "requested": 5 }
}
```

The message is English and meant for developers and logs; a storefront
switches on the code and writes its own sentence in its own language.
Matching on message text would break the moment a sentence is reworded -
which nobody notices until a customer sees an English error. Failed DTO
validation comes back as `VALIDATION_FAILED` with the per-field messages
in `errors`, so a form can mark the fields that are wrong. The catalogue
of codes lives in `src/common/errors/error-codes.ts`.

## Accounts

Besides register / verify / login / refresh / logout:

- `POST /auth/forgot-password` sends a reset code. The response is the
  same whether or not an account exists, so it cannot be used to find out
  which numbers are registered, and it is throttled exactly like a signup
  code.
- `POST /auth/reset-password` takes the code and the new password, then
  signs every session out - whoever locked the customer out may still be
  holding a refresh token.
- `PATCH /auth/password` changes it while signed in, and requires the
  current one.

Reset codes and signup codes live side by side: one pending code per
(number, purpose).

## Baskets, best sellers and related products

- `POST /products/basket/merge` folds the basket a visitor built before
  signing in into their account's basket. Quantities add up and anything
  beyond stock is trimmed rather than rejected - losing a whole basket
  because one line sold out is how a shop loses the sale.
- `sortBy=best_selling` sorts on `products.sales_count`, which is
  maintained when an order is paid and given back when a paid order is
  cancelled, so the listing is one indexed read rather than a sum over
  order lines.
- `GET /products/:id/related` answers with products from the same
  categories, preferring the same brand, ordered by what actually sells.

## Attributes: what a product is sold by

The shop defines its own properties - colour, size, storage, volume -
rather than the backend hard-coding any. Each attribute carries a fixed
list of allowed values (`attribute_options`), so a colour filter can
never end up with "مشکی" and "سیاه" as two different colours.

Two kinds, and the difference matters:

- **Variant axes** (`is_variant_axis`) split a product into separately
  priced, separately counted variants. Only select and colour attributes
  can be axes - an axis needs a fixed list of values to combine.
- **Descriptive attributes** sit on the product (screen size, fabric,
  SPF). They display and filter; they never divide stock.

A category declares which attributes its products use, and which are
required - that is what lets an admin form build itself, and what
refuses a shoe with no size. On top of that, a product cannot have two
variants with the same combination, an option from the wrong attribute
is rejected, and a value that variants are built on cannot be deleted.

Filtering follows what a shopper means: values of one attribute are an
OR ("black or white"), different attributes are an AND - and the axis
values have to meet on **one variant**. A shirt that comes in white (S)
and in L (black) does not come in white L, and the filter does not
pretend otherwise. `GET /products/facets` returns every filterable value
with the number of products that would remain if it were picked too,
including the hex code for colour swatches.

Each variant also keeps a denormalised `options` copy of its values, so
listing a basket or a product card needs no joins; the rows remain the
truth. Variants created before this existed are migrated from that JSON
automatically - their keys become attributes and their values become
options, with nothing to re-enter.

## Returns, audit trail and reports

**Returns** (`/returns`) cover what happens after delivery - before it,
cancelling the order is the right path and the money goes back the same
way. A customer can ask to send back up to what they bought, within
`RETURN_WINDOW_DAYS` of delivery; an open request holds those units so
the same item can't be returned twice. Support approves it, marks it
received, and only then refunds: the money and the restocking happen in
one transaction, and a return can never give back more than the customer
paid for that order. What goes back is the goods plus their share of the
tax - shipping stays with the shop, because the parcel was delivered.
Goods that can't be sold again are received with `restock: false`.

**Audit log** (`/audit-logs`, admin only, append-only) records who did
the things that move money or permissions: order status changes and
refunds, manual wallet adjustments, role changes, price changes and
discount-code edits. There is no endpoint that writes or deletes an
entry - a log someone can edit is not evidence.

**Reports** (`/reports`, admin only, Toman):

- `summary` - today, this month, and a count of orders by status
- `sales?from=&to=&granularity=day|month` - revenue with refunds
  subtracted, plus the shipping, tax and discount lines
- `top-products` - what actually sold, by units and by money
- `low-stock?threshold=` - per option, which is where stock lives

## Discount codes

A code can be a percentage or a fixed number of Toman, and it carries
its own rules:

- `max_discount_amount` - the ceiling on a percentage ("20% off, up to
  100,000"), which is what keeps one large order from costing the shop
  a campaign's whole budget;
- `min_order_amount` - the floor;
- `starts_at` / `expires_at` - the campaign window;
- `capacity` (total uses) and `per_user_limit` (uses per customer), so
  one account can't take the whole campaign;
- `productIds` / `categoryIds` - scope. A scoped code only comes off the
  lines it covers, so "20% off books" does not quietly discount the
  phone in the same basket, and a basket with nothing eligible is
  refused rather than silently discounted.

A fixed code can take an order to zero but never below it, and editing a
pending order re-prices its code against the new basket rather than
carrying the old amount over. Codes created before any of this keep
behaving exactly as they did: percentage, no window, no limits.

## Testing

```bash
npm test           # unit tests (mocked repositories, no DB needed)
npm run test:e2e   # boots the real app against a real DB
npm run seed:demo  # fills a development database with a usable shop
```

The e2e suites cover the paths that are expensive to get wrong: the
registration/refresh/logout flow, a whole checkout (options, shipping by
weight, tax, a discount code, wallet payment, then cancelling and
getting all of it back), and a return from request to refund.

The e2e suite refuses to run unless `DB_DATABASE` ends with `_test`
(and `NODE_ENV` isn't `production`) - it writes real rows, so it must
never be pointed at a working database by accident.

## Demo data

```bash
npm run seed:demo
```

Fills the database with a working electronics shop: a two-level category
tree, 9 brands, **32 products across 188 variants** (phones by colour and
storage, laptops by RAM and SSD, tablets, watches by size, audio and
accessories), 8 attributes with their values, placeholder artwork for
every product, ~50 reviews, 3 shipping methods across 3 zones, 4 discount
codes, and **42 back-dated orders** so the dashboard chart, the best-seller
sort and the reports have real shapes to show.

Accounts: `09120000001` (admin) and `09120000002` / `09120000003` /
`09120000004` (customers with a funded wallet), all with the password
`Passw0rd1`.

Some variants are deliberately out of stock - that is what the
storefront's greyed-out option picker is for. The seed is deterministic
and idempotent: running it twice gives the same shop rather than two of
it, and it refuses to run against a production database.

## API documentation

`npm run start:dev` (or any `nest build`) serves the full API at
`/api/docs`. The Swagger CLI plugin reads the DTOs' TypeScript types and
validation decorators directly, so every endpoint arrives documented
with its real request shape and required fields - no `@ApiProperty` to
keep in sync with the code. In production the docs are off unless
`SWAGGER_ENABLED=true`, and behind basic auth when `SWAGGER_USER` /
`SWAGGER_PASSWORD` are set.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: `npm
ci`, type-check, lint, the unit tests, and the e2e suites against a
MySQL service container. The things that actually broke during
development here - a column TypeORM could not map, a migration that only
worked on an empty database, a query that compiled but named a column
wrong - all surface in one of those steps rather than in production.

## Known gaps

- Product images are stored and served as uploaded: no resizing, no
  WebP. Worth adding (with `sharp`) once the storefront is serving real
  photographs - a 4MB phone photo behind a 150px product card is the
  single biggest page-weight problem a shop like this has.
- Uploads live on the application's own disk. Moving them to object
  storage (S3, ArvanCloud) is an adapter behind the existing
  `LocalFileStorage` interface, not a rewrite - but it needs a real
  account to be worth writing.
- One payment gateway. The gateway client is isolated behind
  `ZarinpalService`, so a second provider is a sibling class plus a
  choice at checkout; until there is a second merchant account, code
  that can't be tested against the real thing is not readiness.
- Database backups are deliberately not scripted here: how they are
  taken depends on where this is deployed, and most managed MySQL
  offerings do it for you. Whatever hosts it, make sure point-in-time
  recovery is on before the first real order.
- Admin-only routes are guarded by role, but there's no finer-grained
  permission system (e.g. per-admin scopes) - anyone with the `admin`
  role can do everything.
- Order-history deletion policy is CASCADE-on-user-delete for
  simplicity - some businesses prefer preserving order records (via a
  nullable/SET NULL relation) for accounting reasons even after an
  account is removed.
- Local disk is used for product image storage - fine for one
  instance, but move to S3 or similar object storage before running
  more than one server (disk isn't shared between instances).