import { usePrefs } from '../lib/prefs';
import { unlockAudio } from '../lib/sfx';

export function PrefsControls({ showSound = true, className = '' }: { showSound?: boolean; className?: string }) {
  const { reduceMotion, sound, setReduceMotion, setSound } = usePrefs();
  const pill = 'sticker rounded-full px-[0.8em] py-[0.35em] text-[0.8em] bg-night/80 text-cream hover:bg-plum';
  return (
    <div className={`flex gap-[0.5em] ${className}`}>
      <button
        type="button"
        className={pill}
        aria-pressed={reduceMotion}
        onClick={() => setReduceMotion(!reduceMotion)}
        title="Turn non-essential animations on or off"
      >
        {reduceMotion ? '🐢 Motion: reduced' : '✨ Motion: on'}
      </button>
      {showSound && (
        <button
          type="button"
          className={pill}
          aria-pressed={sound}
          onClick={() => {
            if (!sound) unlockAudio();
            setSound(!sound);
          }}
        >
          {sound ? '🔊 Sound: on' : '🔇 Sound: off'}
        </button>
      )}
    </div>
  );
}
