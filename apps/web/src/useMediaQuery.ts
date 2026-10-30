import { useEffect, useState } from 'react';

/** Keep in sync with the `max-width` media query in styles.css. */
export const NARROW_SCREEN = '(max-width: 720px)';

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
