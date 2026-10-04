import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../lib/api';

const CatalogContext = createContext(null);

// The category tree, the brands and the attribute list change rarely but
// are needed by the header, the filter panel and the product page. They
// are fetched once per visit and shared from here, so moving between
// pages costs no requests.
export function CatalogProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.get('/categories/tree'),
      api.get('/brands'),
      api.get('/attributes'),
    ]);
    const [tree, brandList, attributeList] = results;

    if (tree.status === 'fulfilled') {
      setCategories(Array.isArray(tree.value) ? tree.value : (tree.value?.items ?? []));
    }
    if (brandList.status === 'fulfilled') {
      setBrands(
        Array.isArray(brandList.value)
          ? brandList.value
          : (brandList.value?.items ?? []),
      );
    }
    if (attributeList.status === 'fulfilled') {
      setAttributes(
        Array.isArray(attributeList.value)
          ? attributeList.value
          : (attributeList.value?.items ?? []),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A flat lookup, so a page with a category id can show its name
  // without walking the tree.
  const categoryById = useMemo(() => {
    const map = new Map();
    const walk = (nodes) => {
      (nodes ?? []).forEach((node) => {
        map.set(node.id, node);
        walk(node.children);
      });
    };
    walk(categories);
    return map;
  }, [categories]);

  const value = useMemo(
    () => ({ categories, categoryById, brands, attributes, loading, reload: load }),
    [categories, categoryById, brands, attributes, loading, load],
  );

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside CatalogProvider');
  return context;
}
