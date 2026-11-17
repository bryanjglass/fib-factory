export function Gear({ className = '', color = '#ffc93c' }: { className?: string; color?: string }) {
  const teeth = Array.from({ length: 10 }, (_, i) => i * 36);
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g fill={color} stroke="#1b1033" strokeWidth="5" strokeLinejoin="round">
        {teeth.map((deg) => (
          <rect key={deg} x="42" y="2" width="16" height="22" rx="3" transform={`rotate(${deg} 50 50)`} />
        ))}
        <circle cx="50" cy="50" r="34" />
      </g>
      <circle cx="50" cy="50" r="13" fill="#1b1033" />
    </svg>
  );
}

/** The Fib Factory wordmark. Size is driven by the parent's font-size. */
export function Logo({ className = '', spin = true }: { className?: string; spin?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-[0.3em] select-none ${className}`} aria-label="Fib Factory">
      <div className="relative w-[2.2em] h-[2.2em] shrink-0">
        <Gear className={`absolute inset-0 w-full h-full ${spin ? 'animate-spin-slow' : ''}`} />
        <span className="absolute inset-0 flex items-center justify-center font-display text-[0.9em] text-pink rotate-[-8deg]">
          ?!
        </span>
      </div>
      <div className="leading-[0.85] font-display">
        <div className="text-pink text-outline shadow-pop rotate-[-3deg] origin-left">FIB</div>
        <div className="text-sun text-outline shadow-pop rotate-[-3deg] origin-left">FACTORY</div>
      </div>
    </div>
  );
}
