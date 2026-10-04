import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { api } from '../../lib/api';
import { useWishlist } from '../../context/WishlistContext';
import ProductCard from '../../components/product/ProductCard';
import { EmptyState, SkeletonCard } from '../../components/ui/Primitives';

export default function Favorites() {
  const { ids } = useWishlist();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const list = [...ids];
    if (list.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all(
      list.map((id) => api.get(`/products/${id}`).catch(() => null)),
    )
      .then((items) => setProducts(items.filter(Boolean)))
      .finally(() => setLoading(false));
  }, [ids]);

  if (loading) {
    return (
      <div className="product-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<Heart size={28} />}
          title="لیست علاقه‌مندی‌ها خالی است"
          description="کالاهایی که می‌پسندید را با نشان قلب ذخیره کنید."
          action={
            <Link className="btn btn-primary" to="/products">
              دیدن کالاها
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
