import type { PlayerView } from '../../../shared/protocol';

interface Props {
  player: Pick<PlayerView, 'avatar' | 'color' | 'name' | 'connected'>;
  /** Size in em, relative to parent font size. */
  size?: number;
  dim?: boolean;
  badge?: 'check' | 'typing' | null;
  className?: string;
  showName?: boolean;
  nameClassName?: string;
}

export function Avatar({ player, size = 3, dim = false, badge = null, className = '', showName = false, nameClassName }: Props) {
  return (
    <div className={`inline-flex flex-col items-center gap-[0.2em] ${className}`}>
      <div
        className={`relative rounded-full sticker flex items-center justify-center transition-all duration-300 ${
          dim ? 'opacity-45 grayscale-[60%]' : ''
        }`}
        style={{ width: `${size}em`, height: `${size}em`, background: player.color, fontSize: '1em' }}
        title={player.name}
      >
        <span style={{ fontSize: `${size * 0.55}em`, lineHeight: 1 }} aria-hidden="true">
          {player.avatar}
        </span>
        {!player.connected && (
          <span
            className="absolute -bottom-[0.15em] -left-[0.15em] rounded-full bg-tomato sticker text-[0.45em] px-[0.4em] font-display text-white"
            title="Disconnected"
          >
            OFF
          </span>
        )}
        {badge === 'check' && (
          <span className="absolute -top-[0.25em] -right-[0.25em] w-[1.3em] h-[1.3em] rounded-full bg-mint sticker flex items-center justify-center text-[0.8em] text-ink animate-pop-in">
            ✓
          </span>
        )}
        {badge === 'typing' && (
          <span className="absolute -top-[0.2em] -right-[0.4em] rounded-full bg-cream text-ink sticker px-[0.35em] text-[0.6em] animate-blink">
            •••
          </span>
        )}
      </div>
      {showName && (
        <span
          className={`max-w-[7em] truncate text-[0.8em] font-black text-center ${nameClassName ?? ''}`}
          style={nameClassName ? undefined : { color: player.color }}
        >
          {player.name}
        </span>
      )}
    </div>
  );
}
