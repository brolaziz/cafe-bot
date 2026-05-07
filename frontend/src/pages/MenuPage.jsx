import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCategories, fetchProducts } from '../api';
import AppHeader from '../components/AppHeader';

const CATEGORY_ICONS = ['☕', '🥐', '🍰', '🥤', '🍕', '🌮', '🥗', '🧋'];

function categoryIcon(index) {
  return CATEGORY_ICONS[index % CATEGORY_ICONS.length];
}

function shouldUseImagePlaceholder(url) {
  const u = url?.trim().toLowerCase() ?? '';
  if (!u) return true;
  return u.includes('example.com');
}

function SearchIcon({ className }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="m21 21-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProductCard({ product, onAdd, onChangeQty, inCartQty, badgePulse }) {
  const usePlaceholder = shouldUseImagePlaceholder(product.image_url);
  const pid = product._id;

  return (
    <article className="group overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-black/[0.04] transition duration-300 hover:shadow-card-hover">
      <div className="relative aspect-video w-full overflow-hidden bg-surface">
        {!usePlaceholder ? (
          <img
            src={product.image_url.trim()}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-surface to-primarydark/25 text-6xl opacity-90">
            ☕
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 p-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-bold leading-snug text-ink">{product.name_uz}</h3>
          <span className="mt-2 inline-block rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
            {product.price?.toLocaleString('uz-UZ')} so'm
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {inCartQty > 0 && (
            <>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-surface text-lg font-bold leading-none text-ink transition hover:bg-white active:scale-90"
                onClick={() => {
                  try {
                    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
                  } catch {
                    /* ignore */
                  }
                  onChangeQty(pid, inCartQty - 1);
                }}
                aria-label="Kamaytirish"
              >
                <span className="btn-icon-inner h-5 w-5">−</span>
              </button>
              <span className="min-w-8 text-center text-sm font-bold text-ink">{inCartQty > 99 ? '99+' : inCartQty}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => onAdd(product)}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-bold leading-none text-white shadow-md transition hover:bg-primarydark active:scale-90 ${
              badgePulse ? 'animate-cart-bounce' : ''
            }`}
            aria-label={inCartQty > 0 ? "Ko'paytirish" : "Savatga qo'shish"}
          >
            <span className="btn-icon-inner h-7 w-7 text-[1.35rem]">+</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function CategoryProducts({
  categoryId,
  searchQuery,
  qtyByProductId,
  pulseProductId,
  onAddToCart,
  onChangeQty,
  onProductFetchError,
}) {
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

  const visible = useMemo(() => {
    const base = products.filter((p) => p.is_available !== false);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) => (p.name_uz || '').toLowerCase().includes(q));
  }, [products, searchQuery]);

  if (loading) {
    return (
      <p className="py-10 text-center text-sm font-medium text-muted">Mahsulotlar yuklanmoqda…</p>
    );
  }

  if (visible.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        {searchQuery.trim() ? "Qidiruv bo'yicha mahsulot topilmadi." : "Bu kategoriyada mahsulot yo'q."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      {visible.map((product) => {
        const pid = String(product._id);
        return (
          <ProductCard
            key={product._id}
            product={product}
            onAdd={onAddToCart}
            onChangeQty={onChangeQty}
            inCartQty={qtyByProductId[pid] ?? 0}
            badgePulse={pulseProductId === pid}
          />
        );
      })}
    </div>
  );
}

export default function MenuPage({ cart, cartCount, onOpenCart, onAddToCart, onChangeQty }) {
  const [categories, setCategories] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadingCats, setLoadingCats] = useState(true);
  const [categoriesError, setCategoriesError] = useState(null);
  const [productsError, setProductsError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [badgeBump, setBadgeBump] = useState(false);
  const [pulseProductId, setPulseProductId] = useState(null);
  const prevCartCount = useRef(cartCount);
  const pulseTimerRef = useRef(null);

  const qtyByProductId = useMemo(() => {
    const m = {};
    for (const line of cart || []) {
      m[String(line.productId)] = line.qty;
    }
    return m;
  }, [cart]);

  const setProductsErrorStable = useCallback((v) => {
    setProductsError(v);
  }, []);

  const handleAddToCart = useCallback(
    (product) => {
      try {
        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
      } catch {
        /* ignore */
      }
      onAddToCart(product);
      const id = String(product._id);
      setPulseProductId(id);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => setPulseProductId(null), 550);
    },
    [onAddToCart]
  );

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (cartCount > prevCartCount.current) {
      setBadgeBump(true);
      const t = window.setTimeout(() => setBadgeBump(false), 600);
      prevCartCount.current = cartCount;
      return () => window.clearTimeout(t);
    }
    prevCartCount.current = cartCount;
  }, [cartCount]);

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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface">
      <section className="relative mx-4 mt-2 shrink-0 overflow-hidden rounded-2xl shadow-card ring-1 ring-black/[0.05]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(/food-bg.png)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/92 via-primary/85 to-primarydark/90" />
        <div className="relative px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/80">Bugun</p>
          <h2 className="mt-1 text-2xl font-extrabold leading-tight">Yangi taomlar</h2>
          <p className="mt-1 max-w-[240px] text-sm text-white/90">Tez yetkazib beramiz — mazali va issiq.</p>
        </div>
      </section>

      <div className="mt-2 shrink-0 bg-surface shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <AppHeader
          end={
            <button
              type="button"
              onClick={onOpenCart}
              className="relative flex h-10 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 text-sm font-bold text-ink shadow-sm transition active:scale-95"
            >
              <span className="text-base" aria-hidden>
                🛒
              </span>
              <span>Savat</span>
              {cartCount > 0 && (
                <span
                  className={`absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white ${
                    badgeBump ? 'animate-cart-bounce' : ''
                  }`}
                >
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </button>
          }
        />

        <div className="px-4 pb-2 pt-3">
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="Mahsulot qidirish…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-stone-200/90 bg-card py-3.5 pl-12 pr-4 text-sm font-medium text-ink shadow-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>

        <div className="border-b border-stone-100 pb-2">
          {loadingCats ? (
            <div className="px-4 py-2 text-sm font-medium text-muted">Yuklanmoqda…</div>
          ) : categories.length === 0 ? (
            <div className="px-4 py-2 text-sm text-muted">Kategoriyalar yo'q.</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
              {categories.map((cat, index) => {
                const active = String(cat._id) === String(activeId);
                const icon = categoryIcon(index);
                return (
                  <button
                    key={cat._id}
                    type="button"
                    onClick={() => {
                      setProductsError(null);
                      setActiveId(cat._id);
                    }}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition duration-200 active:scale-95 ${
                      active
                        ? 'border-primary bg-primary text-white shadow-md shadow-primary/20'
                        : 'border-stone-200 bg-card text-ink shadow-sm hover:border-primary/30'
                    }`}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {icon}
                    </span>
                    <span className="max-w-[150px] truncate">{cat.name_uz}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        {(categoriesError || productsError) && (
          <div className="mx-4 mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800 ring-1 ring-red-200/80">
            {categoriesError || productsError}
          </div>
        )}

        <main className="px-4 pt-4">
          {activeId ? (
            <div key={activeId} className="animate-tab-content">
              <CategoryProducts
                categoryId={activeId}
                searchQuery={searchQuery}
                qtyByProductId={qtyByProductId}
                pulseProductId={pulseProductId}
                onAddToCart={handleAddToCart}
                onChangeQty={onChangeQty}
                onProductFetchError={setProductsErrorStable}
              />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
