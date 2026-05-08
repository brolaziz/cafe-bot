const tabs = [
  { id: 'menu', label: 'Mahsulotlar', icon: '🍽' },
  { id: 'cart', label: 'Savat', icon: '🛒', showCartBadge: true },
  { id: 'address', label: 'Manzilim', icon: '📍' },
  { id: 'profile', label: 'Profil', icon: '👤' },
];

export default function BottomNav({ activeTab, onChange, cartCount = 0 }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-[480px] border-t border-stone-200/90 bg-card/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      aria-label="Asosiy menyu"
    >
      <div className="flex h-[56px] items-stretch justify-around gap-0.5 px-0.5 pt-1">
        {tabs.map((t) => {
          const active = activeTab === t.id;
          const badge =
            t.showCartBadge && cartCount > 0 ? (cartCount > 99 ? '99+' : String(cartCount)) : null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-bold leading-tight transition active:scale-95 sm:text-[11px] ${
                active ? 'text-primary' : 'text-muted'
              }`}
            >
              <span className="relative text-[1.15rem] leading-none sm:text-xl" aria-hidden>
                {t.icon}
                {badge ? (
                  <span className="absolute -right-2 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-extrabold text-white">
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate px-0.5">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
