const tabs = [
  { id: 'menu', label: 'Mahsulotlar', icon: '🍽' },
  { id: 'address', label: 'Manzilim', icon: '📍' },
  { id: 'profile', label: 'Profil', icon: '👤' },
];

export default function BottomNav({ activeTab, onChange }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-[480px] border-t border-stone-200/90 bg-card/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      aria-label="Asosiy menyu"
    >
      <div className="flex h-[56px] items-stretch justify-around px-1 pt-1">
        {tabs.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[11px] font-bold transition active:scale-95 ${
                active ? 'text-primary' : 'text-muted'
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {t.icon}
              </span>
              <span className="truncate px-0.5">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
