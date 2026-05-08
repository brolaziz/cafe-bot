import AppHeader from '../components/AppHeader';
import EmptyState from '../components/EmptyState';

function lineTotal(line) {
  return line.price * line.qty;
}

function shouldUseImagePlaceholder(url) {
  const u = url?.trim().toLowerCase() ?? '';
  if (!u) return true;
  return u.includes('example.com');
}

export default function CartPage({ cart, onBrowseMenu, onOpenAddress, onCheckout, onChangeQty, onRemove }) {
  const total = cart.reduce((s, line) => s + lineTotal(line), 0);

  return (
    <div className="flex min-h-screen flex-col bg-surface pb-24">
      <AppHeader end={null} />

      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col px-4 pb-6 pt-2">
          <div className="mb-2 px-1">
            <h2 className="text-xl font-bold text-ink">Savat</h2>
            <p className="text-sm text-muted">Tanlangan mahsulotlar shu yerda chiqadi</p>
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <EmptyState
              emoji="👀"
              title="Savatchangiz hozircha bo'sh"
              lines={[
                "Mazali narsalarni qo'shib ko'ring 😋",
                "Mahsulotlar bo'limida aylanib chiqing - biz kutamiz!",
              ]}
              primaryLabel="Mahsulotlarni ko'rish"
              onPrimary={onBrowseMenu}
              secondaryLabel="Manzilimni sozlash"
              onSecondary={onOpenAddress}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 pt-3">
            <h2 className="text-xl font-bold text-ink">Savat</h2>
            <p className="text-sm text-muted">{cart.length} turdagi mahsulot</p>
          </div>

          <ul className="flex-1 space-y-3 px-4 py-4">
            {cart.map((line) => {
              const usePlaceholder = shouldUseImagePlaceholder(line.image_url);
              return (
                <li
                  key={line.productId}
                  className="flex overflow-hidden rounded-2xl shadow-card ring-1 ring-black/[0.05] transition hover:shadow-card-hover"
                >
                  <div
                    className="w-2 shrink-0 bg-gradient-to-b from-red-200/90 to-red-100/80"
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 gap-3 bg-card p-3">
                    <div className="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-surface ring-1 ring-stone-100">
                      {!usePlaceholder ? (
                        <img src={line.image_url.trim()} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 to-primarydark/10 text-2xl text-primary/40">
                          ☕
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-ink">{line.name_uz}</p>
                      <p className="text-xs font-medium text-muted">
                        {line.price?.toLocaleString('uz-UZ')} so'm / dona
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-surface text-lg font-bold leading-none text-ink transition hover:bg-white active:scale-90"
                            onClick={() => onChangeQty(line.productId, line.qty - 1)}
                            aria-label="Kamaytirish"
                          >
                            <span className="btn-icon-inner h-5 w-5">−</span>
                          </button>
                          <span className="min-w-8 text-center text-sm font-bold text-ink">{line.qty}</span>
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/40 bg-primary text-lg font-bold leading-none text-white transition hover:bg-primarydark active:scale-90"
                            onClick={() => onChangeQty(line.productId, line.qty + 1)}
                            aria-label="Ko'paytirish"
                          >
                            <span className="btn-icon-inner h-5 w-5">+</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemove(line.productId)}
                          className="text-xs font-bold text-red-600 underline-offset-2 hover:underline"
                        >
                          O'chirish
                        </button>
                      </div>
                    </div>
                    <div className="shrink-0 self-start text-right">
                      <p className="text-sm font-extrabold text-primary">{lineTotal(line).toLocaleString('uz-UZ')}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">so'm</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="sticky bottom-[calc(56px+max(0.5rem,env(safe-area-inset-bottom)))] z-20 border-t border-stone-200/80 bg-card/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Jami</span>
              <span className="text-2xl font-extrabold tracking-tight text-ink">
                {total.toLocaleString('uz-UZ')}{' '}
                <span className="text-base font-bold text-muted">so'm</span>
              </span>
            </div>
            <button type="button" onClick={onCheckout} className="btn-primary w-full">
              Buyurtma berish
            </button>
          </div>
        </>
      )}
    </div>
  );
}
