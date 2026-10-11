// The page a messenger's link-preview crawler gets for a product link.
//
// Telegram, WhatsApp and the rest read a shared link's <meta> tags without
// running any JavaScript, so every product link in a chat showed only the
// shop's generic title and no picture - the storefront is a single-page
// app and writes its titles from the browser. nginx sends those crawlers
// here instead (deploy/nginx/tellcall.conf); people still get the app.

export interface LinkPreview {
  siteName: string;
  title: string;
  description: string;
  pageUrl: string;
  imageUrl?: string | null;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// Titles and descriptions are typed in the admin panel; everything that
// reaches the page goes through here.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// One line, no longer than a preview card shows.
export function summarise(text: string | null | undefined, max = 200): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export function renderLinkPreview(preview: LinkPreview): string {
  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  const pageUrl = escapeHtml(preview.pageUrl);
  const siteName = escapeHtml(preview.siteName);
  const image = preview.imageUrl ? escapeHtml(preview.imageUrl) : null;

  return [
    '<!doctype html>',
    '<html lang="fa" dir="rtl">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${title} | ${siteName}</title>`,
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${pageUrl}">`,
    '<meta property="og:type" content="product">',
    '<meta property="og:locale" content="fa_IR">',
    `<meta property="og:site_name" content="${siteName}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${pageUrl}">`,
    ...(image
      ? [
          `<meta property="og:image" content="${image}">`,
          '<meta name="twitter:card" content="summary_large_image">',
        ]
      : ['<meta name="twitter:card" content="summary">']),
    '</head>',
    '<body>',
    `<h1>${title}</h1>`,
    `<p>${description}</p>`,
    `<p><a href="${pageUrl}">${siteName}</a></p>`,
    '</body>',
    '</html>',
  ].join('\n');
}
