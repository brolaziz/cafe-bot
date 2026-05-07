import { useEffect, useState } from 'react';
import { fetchCategories, fetchProducts } from '../api';

function ProductCard({ product, onAdd }) {
  const img = product.image_url?.trim();
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/80">
      <div className="aspect-square w-full bg-stone-100">
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-stone-300">☕</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-stone-900">
          {product.name_uz}
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-primary">{product.price?.toLocaleString('uz-UZ')} so'm</span>
          <button
            type="button"
            onClick={() => onAdd(product)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-white shadow-md transition active:scale-95"
            aria-label="Savatga qo'shish"
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}

function CategoryProducts({ categoryId, onAddToCart, onProductFetchError }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchProducts(categoryId);
        if (!cancelled) {
          setProducts(data);
          onProductFetchError(null);
        }
      } catch {
        if (!cancelled) {
          setProducts([]);
          onProductFetchError("Mahsulotlarni yuklab bo'lmadi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId, onProductFetchError]);

  if (loading) {
    return <p className="text-center text-sm text-stone-500">Mahsulotlar yuklanmoqda…</p>;
  }

  const visible = products.filter((p) => p.is_available !== false);

  if (visible.length === 0) {
    return <p className="mt-6 text-center text-sm text-stone-500">Bu kategoriyada mahsulot yo'q.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
      {visible.map((product) => (
        <ProductCard key={product._id} product={product} onAdd={onAddToCart} />
      ))}
    </div>
  );
}

export default function MenuPage({ onOpenCart, cartCount, onAddToCart }) {
  const [categories, setCategories] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadingCats, setLoadingCats] = useState(true);
  const [categoriesError, setCategoriesError] = useState(null);
  const [productsError, setProductsError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCats(true);
      setCategoriesError(null);
      try {
        const data = await fetchCategories();
        if (cancelled) return;
        setCategories(data);
        if (data?.length) {
          setActiveId(data[0]._id);
        }
      } catch {
        if (!cancelled) setCategoriesError("Kategoriyalarni yuklab bo'lmadi. Internetni tekshiring.");
      } finally {
        if (!cancelled) setLoadingCats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200/80 bg-stone-50/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold text-stone-900">Menyu</h1>
        <button
          type="button"
          onClick={onOpenCart}
          className="relative rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-md active:scale-[0.98]"
        >
          Savat
          {cartCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-stone-900 px-1 text-xs font-bold text-white">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>
      </header>

      {(categoriesError || productsError) && (
        <div className="mx-4 mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {categoriesError || productsError}
        </div>
      )}

      <div className="border-b border-stone-200/80 bg-stone-50">
        {loadingCats ? (
          <div className="px-4 py-3 text-sm text-stone-500">Yuklanmoqda…</div>
        ) : categories.length === 0 ? (
          <div className="px-4 py-3 text-sm text-stone-500">Kategoriyalar yo'q.</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto px-3 py-3 scrollbar-hide">
            {categories.map((cat) => {
              const active = String(cat._id) === String(activeId);
              return (
                <button
                  key={cat._id}
                  type="button"
                  onClick={() => {
                    setProductsError(null);
                    setActiveId(cat._id);
                  }}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active ? 'bg-primary text-white shadow-md' : 'bg-white text-stone-700 ring-1 ring-stone-200'
                  }`}
                >
                  {cat.name_uz}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <main className="flex-1 px-3 pt-4">
        {activeId ? (
          <CategoryProducts
            key={activeId}
            categoryId={activeId}
            onAddToCart={onAddToCart}
            onProductFetchError={setProductsError}
          />
        ) : null}
      </main>
    </div>
  );
}
