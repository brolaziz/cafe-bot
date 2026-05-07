function lineTotal(line) {
  return line.price * line.qty;
}

export default function CartPage({ cart, onBack, onCheckout, onChangeQty, onRemove }) {
  const total = cart.reduce((s, line) => s + lineTotal(line), 0);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-stone-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-stone-200/80 bg-stone-50/95 px-3 py-3 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full p-2 text-stone-700 ring-1 ring-stone-200 active:bg-stone-100"
          aria-label="Orqaga"
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-stone-900">Savat</h1>
      </header>

      {cart.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <p className="text-stone-600">Savat bo'sh.</p>
          <button type="button" onClick={onBack} className="rounded-full bg-primary px-6 py-3 font-semibold text-white shadow-md">
            Menyuga qaytish
          </button>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-stone-200 px-3">
            {cart.map((line) => (
              <li key={line.productId} className="flex gap-3 py-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200">
                  {line.image_url?.trim() ? (
                    <img src={line.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl text-stone-300">☕</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-900">{line.name_uz}</p>
                  <p className="text-sm text-stone-500">{line.price?.toLocaleString('uz-UZ')} so'm / dona</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center rounded-full bg-white ring-1 ring-stone-200">
                      <button
                        type="button"
                        className="px-3 py-1.5 text-lg font-bold text-stone-700"
                        onClick={() => onChangeQty(line.productId, line.qty - 1)}
                        aria-label="Kamaytirish"
                      >
                        −
                      </button>
                      <span className="min-w-8 text-center text-sm font-semibold">{line.qty}</span>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-lg font-bold text-primary"
                        onClick={() => onChangeQty(line.productId, line.qty + 1)}
                        aria-label="Ko'paytirish"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(line.productId)}
                      className="ml-auto text-sm font-medium text-red-600"
                    >
                      O'chirish
                    </button>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-stone-900">{lineTotal(line).toLocaleString('uz-UZ')}</p>
                  <p className="text-xs text-stone-500">so'm</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="sticky bottom-0 border-t border-stone-200 bg-stone-50/95 px-4 py-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-stone-600">Jami</span>
              <span className="text-xl font-bold text-primary">{total.toLocaleString('uz-UZ')} so'm</span>
            </div>
            <button
              type="button"
              onClick={onCheckout}
              className="w-full rounded-2xl bg-primary py-3.5 text-center text-base font-bold text-white shadow-lg shadow-primary/25 active:scale-[0.99]"
            >
              Buyurtma berish
            </button>
          </div>
        </>
      )}
    </div>
  );
}
