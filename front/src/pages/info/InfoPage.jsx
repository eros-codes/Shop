import { Breadcrumb } from '../../components/ui/Primitives';
import { useCatalog } from '../../context/CatalogContext';
import { usePageTitle } from '../../lib/usePageTitle';

// The shop's policy pages share one frame. Every sentence in them describes
// what the site actually does - the numbers come from the API that enforces
// them (GET /shop/info), and business details the shop has not filled in
// are left out instead of being made up.
export default function InfoPage({ title, intro, children }) {
  usePageTitle(title);
  return (
    <div className="container page">
      <Breadcrumb items={[{ label: title }]} />
      <article className="card card-pad info-page">
        <h1>{title}</h1>
        {intro ? <p className="muted">{intro}</p> : null}
        {children}
      </article>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

// The shop's settings and details, with safe defaults while they load.
export function useShopInfo() {
  const { shop } = useCatalog();
  const business = shop?.business ?? {};
  return {
    ...shop,
    business,
    // Who "we" are on these pages: the registered name once it is set.
    name: business.legalName ?? 'تل‌کال',
  };
}
