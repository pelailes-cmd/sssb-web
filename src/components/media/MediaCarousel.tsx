import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../../data/siteData';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { MediaEmbedFrame } from './MediaEmbedFrame';

type MediaCarouselProps = {
  items: MediaItem[];
};

/** How long the carousel rests on a position before advancing. */
const AUTOPLAY_INTERVAL = 6000;
/** Quiet period after the visitor stops interacting before autoplay picks up again. */
const RESUME_DELAY = 4000;

/** Matches the breakpoints in the stylesheet so the loop maths agrees with the layout. */
const perViewFor = (width: number) => (width >= 1024 ? 3 : width >= 700 ? 2 : 1);

/**
 * Media carousel built on a native horizontally scrolling container with scroll snapping.
 *
 * Using real scrolling rather than a transformed track means touch swiping, momentum, keyboard
 * scrolling and — most importantly — the browser's own decision about whether a gesture is
 * horizontal or vertical all come for free. A visitor swiping up the page is never caught by the
 * carousel, which a custom drag handler would have to reimplement and would get wrong.
 *
 * Looping is seamless: when there is more content than fits, the list is rendered twice and the
 * scroll position is silently rewound by exactly one copy once the visitor passes the halfway
 * mark. Because the two copies are identical, the rewind is invisible.
 */
export function MediaCarousel({ items }: MediaCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const [perView, setPerView] = useState(() =>
    typeof window === 'undefined' ? 3 : perViewFor(window.innerWidth),
  );
  const [isDragging, setIsDragging] = useState(false);
  const [activeSlides, setActiveSlides] = useState<ReadonlySet<number>>(() => new Set<number>());

  const canLoop = items.length > perView;
  const slides = useMemo(() => (canLoop ? [...items, ...items] : items), [canLoop, items]);

  const pausedUntil = useRef(0);
  const holdAutoplay = useCallback(() => {
    pausedUntil.current = Date.now() + RESUME_DELAY;
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const wide = window.matchMedia('(min-width: 700px)');
    const update = () => setPerView(perViewFor(window.innerWidth));
    query.addEventListener('change', update);
    wide.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
      wide.removeEventListener('change', update);
    };
  }, []);

  /** Distance between two consecutive slides, measured rather than assumed. */
  const stepWidth = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.children.length < 2) return track?.clientWidth ?? 0;
    const first = track.children[0] as HTMLElement;
    const second = track.children[1] as HTMLElement;
    return second.offsetLeft - first.offsetLeft;
  }, []);

  const move = useCallback(
    (direction: 1 | -1) => {
      const track = trackRef.current;
      if (!track) return;
      const step = stepWidth();
      if (!step) return;
      const copyWidth = step * items.length;

      // There is nothing to the left of the first copy, so hop forward one copy before stepping
      // back. The two copies are identical, so the hop cannot be seen.
      if (canLoop && direction === -1 && track.scrollLeft < step) {
        track.scrollTo({ left: track.scrollLeft + copyWidth, behavior: 'instant' });
      }

      track.scrollBy({ left: direction * step, behavior: reducedMotion ? 'auto' : 'smooth' });
    },
    [canLoop, items.length, reducedMotion, stepWidth],
  );

  // Rewind by one copy once the visitor has scrolled past it, so the loop never reaches an end.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !canLoop) return undefined;

    let idle = 0;
    const onScroll = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        const step = stepWidth();
        const copyWidth = step * items.length;
        if (copyWidth > 0 && track.scrollLeft >= copyWidth) {
          track.scrollTo({ left: track.scrollLeft - copyWidth, behavior: 'instant' });
        }
      }, 160);
    };

    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(idle);
      track.removeEventListener('scroll', onScroll);
    };
  }, [canLoop, items.length, stepWidth]);

  // Autoplay. Held off while the visitor is hovering, dragging, focused inside, or has interacted
  // recently, and disabled outright when the system asks for reduced motion.
  useEffect(() => {
    if (reducedMotion || !canLoop) return undefined;

    const timer = window.setInterval(() => {
      const track = trackRef.current;
      if (!track || document.hidden) return;
      if (Date.now() < pausedUntil.current) return;
      if (track.matches(':hover') || track.contains(document.activeElement)) return;
      // Off-screen sections should not be quietly cycling in the background.
      const rect = track.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      move(1);
    }, AUTOPLAY_INTERVAL);

    return () => window.clearInterval(timer);
  }, [canLoop, move, reducedMotion]);

  // Only slides that have come into view fetch their embed, and once loaded they stay loaded:
  // unmounting a social iframe and remounting it later would reload it from scratch.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const revealed = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number((entry.target as HTMLElement).dataset.slide));
        if (!revealed.length) return;
        setActiveSlides((current) => {
          const next = new Set(current);
          revealed.forEach((index) => next.add(index));
          return next.size === current.size ? current : next;
        });
      },
      { rootMargin: '200px 300px', threshold: 0.01 },
    );

    Array.from(track.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [slides.length]);

  // Mouse dragging. Touch is left entirely to the browser so that vertical page scrolling keeps
  // working; only a mouse pointer, which cannot scroll the page by dragging, is handled here.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    let pointerId: number | null = null;
    let startX = 0;
    let startScroll = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScroll = track.scrollLeft;
      holdAutoplay();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const delta = event.clientX - startX;
      if (!isDragging && Math.abs(delta) < 6) return;
      if (!isDragging) {
        setIsDragging(true);
        track.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      track.scrollLeft = startScroll - delta;
    };

    const endDrag = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
      pointerId = null;
      setIsDragging(false);
      holdAutoplay();
    };

    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    return () => {
      track.removeEventListener('pointerdown', onPointerDown);
      track.removeEventListener('pointermove', onPointerMove);
      track.removeEventListener('pointerup', endDrag);
      track.removeEventListener('pointercancel', endDrag);
    };
  }, [holdAutoplay, isDragging]);

  const showControls = canLoop || items.length > perView;

  return (
    <div
      className="media-carousel"
      onPointerEnter={holdAutoplay}
      onPointerDown={holdAutoplay}
      onFocusCapture={holdAutoplay}
    >
      <div
        ref={trackRef}
        className={`media-track${isDragging ? ' is-dragging' : ''}`}
        style={{ '--media-per-view': perView } as React.CSSProperties}
        role="group"
        aria-roledescription="carousel"
        aria-label="Media and content posts"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          holdAutoplay();
          move(event.key === 'ArrowRight' ? 1 : -1);
        }}
      >
        {slides.map((item, index) => (
          <article
            key={`${item.id}-${index}`}
            className="media-card"
            data-slide={index}
            aria-roledescription="slide"
            aria-label={`${item.title}, ${(index % items.length) + 1} of ${items.length}`}
            // The second copy is deliberately not hidden from assistive technology: it holds
            // focusable iframes, and hiding a focusable subtree is worse than announcing the
            // posts twice. The position in each label makes the repetition obvious.
          >
            <MediaEmbedFrame item={item} active={activeSlides.has(index)} />
            <div className="media-card__caption">
              <h3>{item.title}</h3>
              {item.description ? <p>{item.description}</p> : null}
            </div>
          </article>
        ))}
      </div>

      {showControls ? (
        <div className="media-carousel__controls">
          <button
            type="button"
            className="icon-button"
            aria-label="Show previous media posts"
            onClick={() => {
              holdAutoplay();
              move(-1);
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Show next media posts"
            onClick={() => {
              holdAutoplay();
              move(1);
            }}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
