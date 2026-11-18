import { useEffect, useState } from 'react';

// Whether the browser thinks it has a connection, kept live by the
// online/offline events. Offline, the service worker serves the last API
// answers it saw, and the shell shows a one-line note saying so.
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
