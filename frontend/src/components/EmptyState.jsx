export default function EmptyState({
  emoji = '📦',
  title,
  lines = [],
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  className = '',
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-stone-200/80 bg-gradient-to-br from-card via-card to-primary/[0.04] px-5 py-10 text-center shadow-card ring-1 ring-black/[0.04] ${className}`}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-4 -left-4 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />

      <div className="relative flex flex-col items-center gap-2">
        <div
          className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl bg-white text-[2.75rem] shadow-md ring-1 ring-stone-100 animate-empty-bob"
          aria-hidden
        >
          {emoji}
        </div>
        <h3 className="mt-2 text-base font-extrabold text-ink">{title}</h3>
        {lines.map((line) => (
          <p key={line} className="max-w-[280px] text-sm font-medium leading-relaxed text-muted">
            {line}
          </p>
        ))}
        {(primaryLabel && onPrimary) || (secondaryLabel && onSecondary) ? (
          <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
            {primaryLabel && onPrimary ? (
              <button
                type="button"
                onClick={onPrimary}
                className="btn-primary w-full rounded-2xl py-3.5 text-sm active:scale-[0.98]"
              >
                {primaryLabel}
              </button>
            ) : null}
            {secondaryLabel && onSecondary ? (
              <button
                type="button"
                onClick={onSecondary}
                className="rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-ink shadow-sm transition hover:bg-surface active:scale-[0.98]"
              >
                {secondaryLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
