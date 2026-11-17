import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { Button } from './Button';
import { navigate } from '../router';

/** Full-screen centered message (errors, loading). */
export function MessageScreen({ title, children, emoji = '🏭' }: { title: string; children?: ReactNode; emoji?: string }) {
  return (
    <div className="min-h-dvh bg-factory flex flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo className="text-4xl" />
      <div className="text-6xl animate-float" aria-hidden="true">
        {emoji}
      </div>
      <h1 className="font-display text-2xl text-sun">{title}</h1>
      {children}
      <Button tone="ghost" onClick={() => navigate('/')}>
        Back to start
      </Button>
    </div>
  );
}
