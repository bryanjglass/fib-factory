import { useEffect } from 'react';
import { Toasts } from './components/Toasts';
import { useRoute } from './router';
import { Home } from './views/Home';
import { HostView } from './views/host/HostView';
import { PlayerView } from './views/player/PlayerView';
import { TvView } from './views/tv/TvView';

export function App() {
  const route = useRoute();

  useEffect(() => {
    document.documentElement.classList.toggle('tv-mode', route.name === 'tv');
    const titles = { home: 'Fib Factory', host: 'Host · Fib Factory', tv: 'TV · Fib Factory', play: 'Play · Fib Factory' };
    document.title = 'code' in route && route.code ? `${route.code} · ${titles[route.name]}` : titles[route.name];
  }, [route]);

  return (
    <>
      {route.name === 'home' && <Home initialCode={route.code} />}
      {route.name === 'host' && <HostView key={route.code} code={route.code} />}
      {route.name === 'tv' && <TvView key={route.code} code={route.code} />}
      {route.name === 'play' && <PlayerView key={route.code} code={route.code} />}
      <Toasts />
    </>
  );
}
