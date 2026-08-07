import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { SceneVariant } from './sectionScenes';

const SectionSceneCanvas = lazy(() => import('./SectionSceneCanvas'));

type SectionSceneProps = {
  variant: SceneVariant;
};

/**
 * Scroll-linked 3D backdrop for a section. The renderer is mounted only while the
 * section is near the viewport so each section releases its WebGL context again
 * once it is scrolled well out of view.
 */
export function SectionScene({ variant }: SectionSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [nearViewport, setNearViewport] = useState(
    () => typeof window !== 'undefined' && !('IntersectionObserver' in window),
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !('IntersectionObserver' in window)) return undefined;

    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), {
      rootMargin: '260px 0px',
      threshold: 0,
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className={`section-scene section-scene--${variant}`} aria-hidden="true">
      {nearViewport ? (
        <Suspense fallback={null}>
          <SectionSceneCanvas variant={variant} reducedMotion={reducedMotion} />
        </Suspense>
      ) : null}
    </div>
  );
}
