import type { ButtonHTMLAttributes } from 'react';

type Tone = 'pink' | 'sun' | 'mint' | 'sky' | 'ghost' | 'danger';

const TONES: Record<Tone, string> = {
  pink: 'bg-pink text-white',
  sun: 'bg-sun text-ink',
  mint: 'bg-mint text-ink',
  sky: 'bg-sky text-ink',
  ghost: 'bg-white/10 text-cream border-white/30',
  danger: 'bg-tomato text-white',
};

export function Button({
  tone = 'pink',
  className = '',
  big = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; big?: boolean }) {
  return (
    <button
      {...props}
      className={`sticker rounded-2xl font-display uppercase tracking-wide transition-transform duration-100
        active:translate-y-[0.15em] active:shadow-none disabled:opacity-45 disabled:active:translate-y-0
        ${big ? 'text-2xl px-6 py-4' : 'text-base px-4 py-2.5'} ${TONES[tone]} ${className}`}
    />
  );
}
