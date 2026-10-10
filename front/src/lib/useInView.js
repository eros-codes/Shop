import { useEffect, useState } from 'react';

/**
 * Whether the element behind `ref` is on screen.
 *
 * The phone layouts use it to show a bottom bar with the page's main
 * button - add to cart, continue, place order - only while the real one
 * has scrolled out of view, so the two are never on screen together.
 * `deps` re-attaches the observer when the element is rendered later
 * (after data loads).
 */
export function useInView(ref, deps = []) {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, deps);

  return inView;
}
