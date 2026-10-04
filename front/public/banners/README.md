# Banner artwork

Drop the hero images here and name them in `src/pages/Home.jsx`
(`SLIDES[].image`). Files in `public/` are served at the same path, so
`public/banners/iphone-17-pro-max.png` is reachable at
`/banners/iphone-17-pro-max.png` — no import and no rebuild of the
component.

Sizes that work well with the current layout:

- around **900 × 700 px**, PNG or WebP with a transparent background
- the artwork sits on the left half of the hero on desktop and is hidden
  on phones, so keep the subject centred

A slide whose file is missing quietly falls back to a best-selling
product's photo, and then to a drawn placeholder — the hero is never
blank while you are still collecting artwork.
