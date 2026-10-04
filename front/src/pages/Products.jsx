import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { api, buildQuery } from '../lib/api';
import { useCatalog } from '../context/CatalogContext';
import ProductCard from '../components/product/ProductCard';
import {
  Breadcrumb,
  EmptyState,
  Pagination,
  SkeletonCard,
} from '../components/ui/Primitives';
import { formatToman } from '../lib/format';

const SORTS = [
  { value: 'best_selling', label: 'پرفروش‌ترین' },
  { value: 'created_at', label: 'جدیدترین' },
  { value: 'price', label: 'ارزان‌ترین', order: 'ASC' },
  { value: 'rating', label: 'محبوب‌ترین' },
];

export default function Products() {
  const [params, setParams] = useSearchParams();
  const { categories, categoryById, brands } = useCatalog();
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1 });
  const [facets, setFacets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [priceDraft, setPriceDraft] = useState({ min: '', max: '' });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = useMemo(() => {
    const selected = params.get('attributeOptions');
    return {
      page: Number(params.get('page') ?? 1),
      limit: 24,
      search: params.get('search') ?? undefined,
      categoryId: params.get('categoryId') ?? undefined,
      brandId: params.get('brandId') ?? undefined,
      minPrice: params.get('minPrice') ?? undefined,
      maxPrice: params.get('maxPrice') ?? undefined,
      inStock: params.get('inStock') ?? undefined,
      onSale: params.get('onSale') ?? undefined,
      attributeOptions: selected ? selected.split(',').map(Number) : undefined,
      sortBy: params.get('sortBy') ?? 'created_at',
      sortOrder:
        params.get('sortOrder') ??
        (params.get('sortBy') === 'price' ? 'ASC' : 'DESC'),
    };
  }, [params]);

  const queryString = useMemo(() => buildQuery(query), [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api
      .get(`/products${queryString}`)
      .then((data) => {
        if (cancelled) return;
        setResult({
          items: data?.items ?? [],
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 1,
        });
      })
      .catch(() => {
        if (!cancelled) setResult({ items: [], total: 0, totalPages: 1 });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [queryString]);

  // Facet counts follow the same filters, so each value shows how many
  // products would be left if it were picked too.
  useEffect(() => {
    let cancelled = false;
    const facetQuery = buildQuery({ ...query, page: undefined, limit: undefined });

    api
      .get(`/products/facets${facetQuery}`)
      .then((data) => {
        if (!cancelled) setFacets(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setFacets([]);
      });

    return () => {
      cancelled = true;
    };
  }, [queryString, query]);

  const update = useCallback(
    (changes, { resetPage = true } = {}) => {
      const next = new URLSearchParams(params);
      Object.entries(changes).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') next.delete(key);
        else next.set(key, String(value));
      });
      if (resetPage) next.delete('page');
      setParams(next, { replace: false });
    },
    [params, setParams],
  );

  const selectedOptions = useMemo(() => {
    const raw = params.get('attributeOptions');
    return new Set(raw ? raw.split(',').map(Number) : []);
  }, [params]);

  const toggleOption = (optionId) => {
    const next = new Set(selectedOptions);
    if (next.has(optionId)) next.delete(optionId);
    else next.add(optionId);
    update({ attributeOptions: [...next].join(',') });
  };

  const activeChips = useMemo(() => {
    const chips = [];
    const categoryId = params.get('categoryId');
    if (categoryId) {
      chips.push({
        key: 'categoryId',
        label: categoryById.get(Number(categoryId))?.title ?? 'دسته‌بندی',
        clear: () => update({ categoryId: undefined }),
      });
    }
    const brandId = params.get('brandId');
    if (brandId) {
      chips.push({
        key: 'brandId',
        label: brands.find((brand) => brand.id === Number(brandId))?.title ?? 'برند',
        clear: () => update({ brandId: undefined }),
      });
    }
    if (params.get('search')) {
      chips.push({
        key: 'search',
        label: `جستجو: ${params.get('search')}`,
        clear: () => update({ search: undefined }),
      });
    }
    if (params.get('inStock')) {
      chips.push({
        key: 'inStock',
        label: 'فقط کالاهای موجود',
        clear: () => update({ inStock: undefined }),
      });
    }
    if (params.get('onSale')) {
      chips.push({
        key: 'onSale',
        label: 'فقط تخفیف‌دارها',
        clear: () => update({ onSale: undefined }),
      });
    }
    if (params.get('minPrice') || params.get('maxPrice')) {
      chips.push({
        key: 'price',
        label: `قیمت ${formatToman(params.get('minPrice') ?? 0, { withUnit: false })} تا ${
          params.get('maxPrice')
            ? formatToman(params.get('maxPrice'), { withUnit: false })
            : '∞'
        }`,
        clear: () => update({ minPrice: undefined, maxPrice: undefined }),
      });
    }
    facets.forEach((facet) => {
      facet.options.forEach((option) => {
        if (selectedOptions.has(option.optionId)) {
          chips.push({
            key: `opt-${option.optionId}`,
            label: `${facet.title}: ${option.value}`,
            clear: () => toggleOption(option.optionId),
          });
        }
      });
    });
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, facets, brands, categoryById, selectedOptions]);

  const renderFilters = (scope) => (
    <aside className="filters">
      <div className="filter-block">
        <div className="filter-title">
          دسته‌بندی
          {params.get('categoryId') ? (
            <button
              className="tiny"
              style={{ border: 'none', background: 'none', color: 'var(--brand-600)', cursor: 'pointer' }}
              onClick={() => update({ categoryId: undefined })}
            >
              حذف
            </button>
          ) : null}
        </div>
        <div className="filter-options">
          {categories.map((category) => (
            <div key={category.id}>
              <label className="filter-option">
                <input
                  type="radio"
                  name={`category-${scope}`}
                  checked={params.get('categoryId') === String(category.id)}
                  onChange={() => update({ categoryId: category.id })}
                />
                {category.title}
              </label>
              {(category.children ?? []).map((child) => (
                <label
                  key={child.id}
                  className="filter-option"
                  style={{ paddingInlineStart: 22 }}
                >
                  <input
                    type="radio"
                    name={`category-${scope}`}
                    checked={params.get('categoryId') === String(child.id)}
                    onChange={() => update({ categoryId: child.id })}
                  />
                  {child.title}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="filter-block">
        <div className="filter-title">محدوده قیمت (تومان)</div>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            inputMode="numeric"
            placeholder="از"
            value={priceDraft.min}
            onChange={(event) =>
              setPriceDraft((current) => ({
                ...current,
                min: event.target.value.replace(/\D/g, ''),
              }))
            }
          />
          <input
            className="input"
            inputMode="numeric"
            placeholder="تا"
            value={priceDraft.max}
            onChange={(event) =>
              setPriceDraft((current) => ({
                ...current,
                max: event.target.value.replace(/\D/g, ''),
              }))
            }
          />
        </div>
        <button
          className="btn btn-soft btn-sm btn-block"
          style={{ marginTop: 10 }}
          onClick={() =>
            update({ minPrice: priceDraft.min, maxPrice: priceDraft.max })
          }
        >
          اعمال قیمت
        </button>
      </div>

      {brands.length > 0 ? (
        <div className="filter-block">
          <div className="filter-title">برند</div>
          <div className="filter-options">
            {brands.map((brand) => (
              <label className="filter-option" key={brand.id}>
                <input
                  type="radio"
                  name={`brand-${scope}`}
                  checked={params.get('brandId') === String(brand.id)}
                  onChange={() => update({ brandId: brand.id })}
                />
                {brand.title}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {facets.map((facet) => (
        <div className="filter-block" key={facet.attributeId}>
          <div className="filter-title">{facet.title}</div>
          <div className="filter-options">
            {facet.options.map((option) => {
              const disabled = option.count === 0 && !selectedOptions.has(option.optionId);
              return (
                <label
                  className="filter-option"
                  key={option.optionId}
                  data-disabled={disabled}
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={selectedOptions.has(option.optionId)}
                    onChange={() => toggleOption(option.optionId)}
                  />
                  {facet.type === 'color' && option.hex ? (
                    <span className="swatch" style={{ background: option.hex }} />
                  ) : null}
                  {option.value}
                  <span className="count">{option.count.toLocaleString('fa-IR')}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="filter-block">
        <label className="filter-option">
          <input
            type="checkbox"
            checked={params.get('inStock') === 'true'}
            onChange={(event) =>
              update({ inStock: event.target.checked ? 'true' : undefined })
            }
          />
          فقط کالاهای موجود
        </label>
        <label className="filter-option" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={params.get('onSale') === 'true'}
            onChange={(event) =>
              update({ onSale: event.target.checked ? 'true' : undefined })
            }
          />
          فقط تخفیف‌دارها
        </label>
      </div>
    </aside>
  );

  return (
    <div className="container page">
      <Breadcrumb items={[{ label: 'فروشگاه' }]} />

      <div className="listing">
        <div className="filters-desktop">{renderFilters('desktop')}</div>

        <div>
          <div className="toolbar">
            <button
              className="btn btn-ghost btn-sm filters-toggle"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal size={16} />
              فیلترها
            </button>

            <div className="sort-tabs">
              <span className="small muted" style={{ marginInlineEnd: 6 }}>
                مرتب‌سازی:
              </span>
              {SORTS.map((sort) => (
                <button
                  key={sort.value}
                  className="sort-tab"
                  data-active={query.sortBy === sort.value}
                  onClick={() =>
                    update({ sortBy: sort.value, sortOrder: sort.order ?? 'DESC' })
                  }
                >
                  {sort.label}
                </button>
              ))}
            </div>

            <span className="small muted" style={{ marginInlineStart: 'auto' }}>
              {result.total.toLocaleString('fa-IR')} کالا
            </span>
          </div>

          {activeChips.length > 0 ? (
            <div className="active-filters">
              {activeChips.map((chip) => (
                <button key={chip.key} className="chip" onClick={chip.clear}>
                  {chip.label}
                  <X size={13} />
                </button>
              ))}
              <button
                className="chip"
                onClick={() => setParams(new URLSearchParams())}
                style={{ color: 'var(--danger-600)' }}
              >
                حذف همه فیلترها
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="product-grid">
              {Array.from({ length: 8 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          ) : result.items.length === 0 ? (
            <div className="card">
              <EmptyState
                title="کالایی با این فیلترها پیدا نشد"
                description="فیلترها را کمتر کنید یا عبارت دیگری جستجو کنید."
                action={
                  <button
                    className="btn btn-soft"
                    onClick={() => setParams(new URLSearchParams())}
                  >
                    حذف فیلترها
                  </button>
                }
              />
            </div>
          ) : (
            <>
              <div className="product-grid">
                {result.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <Pagination
                page={query.page}
                totalPages={result.totalPages}
                onChange={(page) => update({ page }, { resetPage: false })}
              />
            </>
          )}
        </div>
      </div>

      {filtersOpen ? (
        <>
          <div className="drawer-backdrop" onClick={() => setFiltersOpen(false)} />
          <aside className="drawer">
            <div className="spread" style={{ marginBottom: 14 }}>
              <span className="strong">فیلترها</span>
              <button className="icon-btn" onClick={() => setFiltersOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {renderFilters('drawer')}
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
              onClick={() => setFiltersOpen(false)}
            >
              نمایش {result.total.toLocaleString('fa-IR')} کالا
            </button>
          </aside>
        </>
      ) : null}
    </div>
  );
}
