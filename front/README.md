# tellcall — storefront

A React storefront for the NestJS e-commerce API: a Persian, right-to-left
shop for phones, laptops, tablets and gadgets.

```bash
npm install
npm run dev      # http://localhost:4000
```

The storefront runs on **4000** and talks to the API on **3000**. In
development every `/api` call is proxied there, so the browser only ever
sees one origin: no CORS preflights, and the refresh-token cookie is a
first-party cookie. For another API host, set `VITE_API_URL`.

The API has to allow the storefront as its frontend:

```bash
# in the API's .env
FRONTEND_URL=http://localhost:4000
CORS_ORIGIN=http://localhost:4000
```

`npm run seed:demo` in the API fills the catalogue with something to look
at, including a product with a real colour/size grid.

## What is in it

| Page | Path | Notes |
| --- | --- | --- |
| Home | `/` | hero slider, category tiles, trust row, best sellers, sale and new rows |
| Listing | `/products` | facet filters, price range, brand, sort, pagination |
| Product | `/product/:slug` | gallery, option picker, specs, reviews, related |
| Cart | `/cart` | works signed out too |
| Checkout | `/checkout` | address, shipping quote, discount code, wallet / online / cash on delivery |
| Account | `/account/*` | orders with a status timeline, returns, addresses, wallet, favourites, password |
| Payment result | `/payment-success`, `/payment-failed` | where the API redirects after the gateway |

## How state is organised

Four contexts, each with one job:

- **AuthContext** — reads the identity straight out of the JWT so the
  header renders on the first paint, then refreshes the profile. A
  revoked or expired session is reported by the API client and clears
  itself.
- **CartContext** — a visitor's basket lives in `localStorage`; at sign-in
  it is sent to the API's merge endpoint and the server copy takes over.
  Quantities beyond stock are trimmed by the API rather than refused, so
  one sold-out line never costs the whole basket.
- **CatalogContext** — the category tree, brands and attributes are
  fetched once per visit and shared, so moving between pages costs no
  requests.
- **WishlistContext** — favourites, local for guests and toggled on the
  API for signed-in customers.

## Two things worth knowing

**Errors are translated from codes, not from text.** The API answers with
a stable `code` (`INSUFFICIENT_STOCK`, `SHIPPING_METHOD_REQUIRED`, …) and
`src/lib/errorMessages.js` holds the Persian sentence for each. Matching
on English message text would break the first time a sentence was
reworded — and the customer would see English either way. Where the API
sends numbers along (how many are left, how many attempts remain), the
message uses them.

**The option picker greys out what cannot be sold.** Each variant arrives
with its attribute values, so picking "black" marks the sizes that have
no black variant, and the ones that exist but are out of stock, as
unavailable — rather than letting someone choose a combination the shop
cannot ship.

Prices are integers in Toman everywhere, printed with Persian digits.
