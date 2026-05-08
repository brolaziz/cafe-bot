import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCategories, fetchProducts } from '../api';
import AppHeader from '../components/AppHeader';
import EmptyState from '../components/EmptyState';

const CATEGORY_ICONS = ['☕', '🥐', '🍰', '🥤', '🍕', '🌮', '🥗', '🧋'];

const NAV_SAFE_BOTTOM = 'calc(56px + max(0.5rem, env(safe-area-inset-bottom)))';

/** Banner: Unsplash (tarmoq) + gradient zaxira */
const HERO_FOOD_IMAGE =
  'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=1200&q=80';

function categoryIcon(index) {
  return CATEGORY_ICONS[index % CATEGORY_ICONS.length];
}

function shouldUseImagePlaceholder(url) {
  const u = url?.trim().toLowerCase() ?? '';
  if (!u) return true;
  return u.includes('example.com');
}

/** Katalog / Kategoriyalar kabi yig'ma yozuvlarini API ro'yxatidan chiqarib, faqat haqiqiy kategoriyalar qoladi */
const EXCLUDED_MENU_CATEGORY_NAMES = new Set(['katalog', 'kategoriyalar']);

function isListedMenuCategory(cat) {
  const raw = (cat.name_uz || '').trim().toLowerCase();
  if (!raw) return false;
  const stripped = raw.replace(/^[^\p{L}]+/u, '');
  if (!stripped) return false;
  return !EXCLUDED_MENU_CATEGORY_NAMES.has(stripped);
}

/** Qidiruv: bo'sh joy bilan ajratilgan har bir so'z nomda uchraydi */
function productMatchesQuery(product, queryLower) {
  const name = (product.name_uz || '').toLowerCase();
  const tokens = queryLower.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((t) => name.includes(t));
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
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-black/[0.04] transition duration-300 hover:shadow-card-hover">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-surface">
        {!usePlaceholder ? (
          <img
            src={product.image_url.trim()}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 via-surface to-primarydark/25 text-3xl opacity-90">
            ☕
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <h3 className="line-clamp-2 text-xs font-bold leading-snug text-ink">{product.name_uz}</h3>
        <span className="inline-block w-fit rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">
          {product.price?.toLocaleString('uz-UZ')} so'm
        </span>
        <div className="mt-auto flex items-center justify-end gap-1">
          {inCartQty > 0 && (
            <>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-surface text-sm font-bold leading-none text-ink transition hover:bg-white active:scale-90"
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
                <span className="btn-icon-inner h-4 w-4">−</span>
              </button>
              <span className="min-w-6 text-center text-[11px] font-bold text-ink">{inCartQty > 99 ? '99+' : inCartQty}</span>
            </>
          )}
          <button
            type="button"
            onClick={() => onAdd(product)}
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold leading-none text-white shadow-md transition hover:bg-primarydark active:scale-90 ${
              badgePulse ? 'animate-cart-bounce' : ''
            }`}
            aria-label={inCartQty > 0 ? "Ko'paytirish" : "Savatga qo'shish"}
          >
            <span className="btn-icon-inner h-5 w-5 text-base">+</span>
          </button>
        </div>
      </div>
    </article>
  );
}

/** Qidiruv modali: uzun qator (gorizontal kartochka) */
function SearchResultRow({ product, onAdd, onChangeQty, inCartQty, badgePulse }) {
  const usePlaceholder = shouldUseImagePlaceholder(product.image_url);
  const pid = product._id;

  return (
    <article className="flex w-full min-w-0 gap-3 rounded-2xl bg-card p-3 shadow-card ring-1 ring-black/[0.06] transition hover:ring-primary/20">
      <div className="relative h-[4.25rem] w-[4.25rem] shrink-0 overflow-hidden rounded-xl bg-surface ring-1 ring-stone-100">
        {!usePlaceholder ? (
          <img
            src={product.image_url.trim()}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-primarydark/10 text-2xl">
            ☕
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <h3 className="text-sm font-extrabold leading-snug text-ink">{product.name_uz}</h3>
        <p className="mt-1 text-xs font-bold text-primary">{product.price?.toLocaleString('uz-UZ')} so'm</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        {inCartQty > 0 && (
          <>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-surface text-base font-bold text-ink transition active:scale-90"
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
              <span className="btn-icon-inner h-4 w-4">−</span>
            </button>
            <span className="min-w-6 text-center text-xs font-bold text-ink">{inCartQty > 99 ? '99+' : inCartQty}</span>
          </>
        )}
        <button
          type="button"
          onClick={() => onAdd(product)}
          className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xl font-bold leading-none text-white shadow-md transition hover:bg-primarydark active:scale-90 ${
            badgePulse ? 'animate-cart-bounce' : ''
          }`}
          aria-label={inCartQty > 0 ? "Ko'paytirish" : "Savatga qo'shish"}
        >
          <span className="btn-icon-inner h-5 w-5">+</span>
        </button>
      </div>
    </article>
  );
}

function CategoryProducts({
  categoryId,
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

  const visible = useMemo(() => products.filter((p) => p.is_available !== false), [products]);

  if (loading) {
    return (
      <p className="py-10 text-center text-sm font-medium text-muted">Mahsulotlar yuklanmoqda…</p>
    );
  }

  if (visible.length === 0) {
    return (
      <EmptyState
        emoji="🍽"
        title="Bu yerda hali mahsulot yo'q"
        lines={['Boshqa kategoriyani tanlang yoki keyinroq qayta kiring.']}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 pb-4">
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

function SearchModalBody({
  categories,
  query,
  qtyByProductId,
  pulseProductId,
  onAddToCart,
  onChangeQty,
  onClearSearch,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const qLower = query.trim().toLowerCase();

  useEffect(() => {
    if (!qLower || !categories.length) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const lists = await Promise.all(categories.map((c) => fetchProducts(c._id)));
        if (cancelled) return;
        const seen = new Set();
        const merged = [];
        for (const list of lists) {
          for (const p of list) {
            if (p.is_available === false) continue;
            const id = String(p._id);
            if (seen.has(id)) continue;
            seen.add(id);
            merged.push(p);
          }
        }
        const filtered = merged.filter((p) => productMatchesQuery(p, qLower));
        setItems(filtered);
      } catch {
        if (!cancelled) {
          setItems([]);
          setError("Qidiruv paytida xatolik. Qayta urinib ko'ring.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categories, qLower]);

  if (!categories.length) {
    return (
      <EmptyState
        emoji="📂"
        title="Menyu hozircha yo'q"
        lines={["Kategoriyalar paydo bo'lgach, qidiruv ishlaydi."]}
        primaryLabel="Yopish"
        onPrimary={onClearSearch}
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        emoji="😅"
        title="Xatolik yuz berdi"
        lines={[error]}
        primaryLabel="Qayta urinish"
        onPrimary={() => window.location.reload()}
        secondaryLabel="Yopish"
        onSecondary={onClearSearch}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-14">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
        <p className="text-sm font-semibold text-muted">Qidirilmoqda…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        emoji="🔎"
        title="Hech narsa topilmadi"
        lines={[`"${query.trim()}" bo'yicha natija yo'q. Boshqa so'z bilan urinib ko'ring.`]}
        primaryLabel="Qidiruvni tozalash"
        onPrimary={onClearSearch}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2.5 pb-2">
      {items.map((product) => {
        const pid = String(product._id);
        return (
          <li key={product._id}>
            <SearchResultRow
              product={product}
              onAdd={onAddToCart}
              onChangeQty={onChangeQty}
              inCartQty={qtyByProductId[pid] ?? 0}
              badgePulse={pulseProductId === pid}
            />
          </li>
        );
      })}
    </ul>
  );
}

export default function MenuPage({ cart, cartCount, onOpenCart, onAddToCart, onChangeQty }) {
  const [categories, setCategories] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadingCats, setLoadingCats] = useState(true);
  const [categoriesError, setCategoriesError] = useState(null);
  const [productsError, setProductsError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [badgeBump, setBadgeBump] = useState(false);
  const [pulseProductId, setPulseProductId] = useState(null);
  const prevCartCount = useRef(cartCount);
  const pulseTimerRef = useRef(null);
  const searchInputRef = useRef(null);

  const searchTrimmed = searchInput.trim();
  const isSearchMode = searchTrimmed.length > 0;

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

  const clearSearch = useCallback(() => {
    setSearchInput('');
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
        const listed = (data || []).filter(isListedMenuCategory);
        setCategories(listed);
        if (listed.length) {
          setActiveId(listed[0]._id);
        } else {
          setActiveId(null);
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

  useEffect(() => {
    if (isSearchMode) {
      const id = window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(id);
    }
  }, [isSearchMode]);

  return (
    <div className="relative box-border flex h-[100dvh] flex-col overflow-hidden bg-surface pb-[calc(56px+max(0.5rem,env(safe-area-inset-bottom)))]">
      <div
        className={`relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden ${isSearchMode ? 'pointer-events-none opacity-[0.35]' : ''}`}
        aria-hidden={isSearchMode}
      >
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-hide">
          <section
            className="sticky top-0 z-0 isolate h-[200px] w-full shrink-0 overflow-hidden rounded-b-2xl bg-gradient-to-br from-neutral-900 via-ink to-primarydark shadow-[0_4px_20px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.08]"
            aria-label="Menyu banner"
          >
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `linear-gradient(to bottom, rgba(26,26,26,0.35), rgba(10,10,10,0.82)), url(${HERO_FOOD_IMAGE})`,
              }}
            />
            <div className="relative flex h-full min-h-0 flex-col justify-end px-5 pb-6 pt-14">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">BUGUN</p>
              <h2 className="mt-1.5 text-2xl font-extrabold leading-tight tracking-tight text-white">Yangi taomlar</h2>
              <p className="mt-1 max-w-[280px] pb-0.5 text-sm leading-snug text-white/85">
                Tez yetkazib beramiz — mazali va issiq.
              </p>
            </div>
          </section>

          <div className="relative z-10 -mt-5 flex w-full flex-col rounded-t-3xl bg-white pb-4 shadow-[0_-12px_40px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.05]">
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

            {!isSearchMode ? (
              <div className="px-4 pb-2 pt-3">
                <label className="relative block">
                  <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    placeholder="Mahsulot qidirish…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-full rounded-full border border-stone-200/90 bg-white py-3.5 pl-12 pr-4 text-sm font-medium text-ink shadow-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </div>
            ) : null}

            <div className="border-b border-stone-100 pb-2">
              {loadingCats ? (
                <div className="px-4 py-2 text-sm font-medium text-muted">Yuklanmoqda…</div>
              ) : categories.length === 0 ? (
                <div className="px-4 py-2">
                  <EmptyState
                    emoji="📂"
                    title="Kategoriyalar yo'q"
                    lines={["Hozircha menyu bo'sh. Keyinroq qayta kiring."]}
                    className="!py-6"
                  />
                </div>
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
                            : 'border-stone-200 bg-white text-ink shadow-sm hover:border-primary/30'
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

            {(categoriesError || productsError) && (
              <div className="mx-4 mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800 ring-1 ring-red-200/80">
                {categoriesError || productsError}
              </div>
            )}

            <main className="px-4 pt-4">
              {activeId ? (
                <div key={activeId}>
                  <CategoryProducts
                    categoryId={activeId}
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
      </div>

      {isSearchMode ? (
        <>
          <button
            type="button"
            aria-label="Qidiruvni yopish"
            className="fixed inset-x-0 top-0 z-40 mx-auto max-w-[480px] border-0 bg-ink/35 backdrop-blur-[2px]"
            style={{ bottom: NAV_SAFE_BOTTOM }}
            onClick={clearSearch}
          />
          <div
            className="fixed inset-x-0 z-50 mx-auto flex max-w-[480px] flex-col overflow-hidden rounded-t-3xl bg-card shadow-[0_-12px_48px_rgba(0,0,0,0.18)] ring-1 ring-stone-200/90"
            style={{
              bottom: NAV_SAFE_BOTTOM,
              top: 'max(4.5rem, env(safe-area-inset-top))',
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="search-modal-title"
          >
            <div className="shrink-0 border-b border-stone-100 bg-card px-3 pb-3 pt-2">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone-300" />
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 id="search-modal-title" className="text-sm font-extrabold text-primary">
                  Qidiruv natijalari
                </h2>
                <button
                  type="button"
                  onClick={clearSearch}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-sm transition active:scale-95"
                >
                  Yopish
                </button>
              </div>
              <label className="relative block">
                <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <input
                  ref={searchInputRef}
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  placeholder="Mahsulot qidirish…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded-full border border-stone-200/90 bg-surface py-3 pl-12 pr-4 text-sm font-medium text-ink shadow-inner outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <p className="mt-2 text-center text-[11px] font-semibold text-muted">Barcha kategoriyalar bo'ylab</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-2 scrollbar-hide">
              <SearchModalBody
                categories={categories}
                query={searchTrimmed}
                qtyByProductId={qtyByProductId}
                pulseProductId={pulseProductId}
                onAddToCart={handleAddToCart}
                onChangeQty={onChangeQty}
                onClearSearch={clearSearch}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
