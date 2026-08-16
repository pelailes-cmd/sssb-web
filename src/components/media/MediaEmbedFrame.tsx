import { AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isAllowedEmbedUrl } from '../../lib/mediaEmbed';
import type { MediaItem } from '../../data/siteData';

type MediaEmbedFrameProps = {
  item: MediaItem;
  /** Only mounted embeds fetch anything; off-screen cards stay as reserved space. */
  active: boolean;
};

/** How long to wait before telling the visitor an embed is not going to appear. */
const LOAD_TIMEOUT = 12000;

/**
 * Renders one social embed at its natural size and scales it to fit the card.
 *
 * The platforms hand out fixed pixel sizes that differ wildly — 267x591 for a reel, 500x250 for a
 * short post — so stretching an iframe to the card would distort the content, and honouring the
 * original width would push the page sideways. Instead the frame keeps its own dimensions and is
 * scaled down uniformly until it fits, which preserves the aspect ratio exactly and can never
 * overflow. The platform also lays its content out at the width it was told to expect.
 */
export function MediaEmbedFrame({ item, active }: MediaEmbedFrameProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loaded' | 'unavailable'>('idle');

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;

    const measure = () => {
      const { width, height } = box.getBoundingClientRect();
      if (!width || !height) return;
      setScale(Math.min(width / item.embedWidth, height / item.embedHeight));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [item.embedHeight, item.embedWidth]);

  useEffect(() => {
    if (!active || status !== 'idle') return undefined;
    // Cross-origin frames do not report failures, so an embed that never loads is surfaced on a
    // timer rather than left spinning indefinitely.
    const timer = window.setTimeout(() => setStatus('unavailable'), LOAD_TIMEOUT);
    return () => window.clearTimeout(timer);
  }, [active, status]);

  // Belt and braces: the content guard already rejects records with an unlisted address, so this
  // only fires if that check is ever loosened.
  if (!isAllowedEmbedUrl(item.embedUrl)) {
    return (
      <div className="media-embed" ref={boxRef}>
        <p className="media-embed__message" role="status">
          <AlertCircle aria-hidden="true" size={18} />
          This content is currently unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className="media-embed" ref={boxRef}>
      {active && scale > 0 ? (
        <iframe
          className="media-embed__frame"
          src={item.embedUrl}
          title={item.title}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          onLoad={() => setStatus('loaded')}
          style={{
            width: `${item.embedWidth}px`,
            height: `${item.embedHeight}px`,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        />
      ) : null}

      {status !== 'loaded' ? (
        <div
          className={`media-embed__state${status === 'unavailable' ? ' media-embed__state--error' : ''}`}
          role="status"
        >
          {status === 'unavailable' ? (
            <>
              <AlertCircle aria-hidden="true" size={18} />
              This content is currently unavailable.
            </>
          ) : (
            <>
              <span className="media-embed__spinner" aria-hidden="true" />
              Loading…
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
