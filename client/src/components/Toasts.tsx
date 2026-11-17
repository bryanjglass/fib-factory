import { useGame } from '../store';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="fixed z-50 top-3 inset-x-0 flex flex-col items-center gap-2 pointer-events-none px-4" aria-live="assertive">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          role="alert"
          className={`pointer-events-auto max-w-md w-full sticker rounded-2xl px-4 py-3 text-left text-base animate-rise ${
            t.tone === 'error' ? 'bg-tomato text-white animate-shake' : t.tone === 'success' ? 'bg-mint text-ink' : 'bg-sky text-ink'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
