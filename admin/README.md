# tellcall — admin panel

The staff side of the NestJS e-commerce API: catalogue, orders, returns,
shipping, discounts, users and the audit trail.

```bash
npm install
npm run dev      # http://localhost:5000
```

Runs on **5000** and talks to the API on **3000** through the same `/api`
proxy the storefront uses, so the browser stays on one origin: no CORS,
and the refresh-token cookie is first-party. Point `VITE_API_URL` at
another host for a deployed API.

Sign in with an account whose role is `admin` — `npm run seed:demo` in
the API creates one (`09120000001` / `Passw0rd1`). A customer account
that signs in here is told it has no admin access rather than being
dropped on an empty dashboard.

## What it covers

| Area | What you can do |
| --- | --- |
| پیشخوان | today and this month's net sales, orders by status, best sellers, low stock, pending returns |
| سفارش‌ها | filter by status, open an order, move it through its lifecycle, record a tracking code with "sent" |
| مرجوعی‌ها | approve, mark received, refund (with a restock choice) and leave a note for the customer |
| کالاها | create and edit products, variants with their own stock and price, descriptive specs, images |
| دسته‌بندی‌ها | the category tree, and which attributes each category asks for |
| ویژگی‌ها | define colour/size/storage, their allowed values, order, colour swatch and unit |
| کدهای تخفیف | percentage or fixed, ceiling, minimum order, campaign window, per-customer limit, category scope |
| ارسال | zones, methods and the rate per (method, zone) |
| کاربران و کیف پول | roles, manual wallet top-ups |
| نظرات | approve or reject; the product's rating is recomputed by the API |
| گزارش فعالیت | who changed what: statuses, refunds, manual top-ups, roles, prices, discount codes |
| گزارش‌ها | sales over a range, best sellers, low stock by SKU |

## Two things worth knowing

**The panel only offers transitions the API would accept.** An order's
next statuses come from the same state machine the server enforces, so
there is no button that produces an error toast. Cancelling says plainly
that stock returns and a paid order is refunded to the wallet.

**Stock lives on the variant, never on the product.** The product form
reflects that: each option row carries its own stock, its own SKU and an
optional price of its own (empty means "same as the product"). The
product's stock column in the table is the sum the API maintains.

Everything a staff member does to money or permissions lands in the audit
log with their name — which is also why the panel sends who is acting on
every one of those calls.
