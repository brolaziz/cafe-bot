export default function AppHeader({ start, end }) {
  return (
    <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-3 bg-card px-4 text-ink shadow-header">
      {start}
      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/logo.png" alt="" className="h-9 w-auto max-w-[100px] object-contain" height={36} />
        <span className="text-lg font-bold tracking-tight text-ink">Cafe</span>
      </div>
      <div className="min-w-0 flex-1" />
      {end}
    </header>
  );
}

export function HeaderIconButton({ children, onClick, 'aria-label': ariaLabel, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-lg leading-none text-ink shadow-sm transition hover:bg-surface active:scale-95 ${className}`}
    >
      <span className="btn-icon-inner h-[1.125rem] w-[1.125rem] text-[1.125rem]">{children}</span>
    </button>
  );
}
