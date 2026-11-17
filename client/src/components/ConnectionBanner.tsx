import { useGame } from '../store';

export function ConnectionBanner() {
  const status = useGame((s) => s.status);
  if (status !== 'reconnecting' && status !== 'connecting') return null;
  return (
    <div
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 sticker rounded-full bg-sun text-ink px-4 py-1.5 text-sm flex items-center gap-2"
      role="status"
    >
      <span className="inline-block w-2.5 h-2.5 rounded-full bg-tomato animate-blink" />
      {status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </div>
  );
}
