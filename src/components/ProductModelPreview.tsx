import { Box, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { ProductImage, ProductModel } from '../data/siteData';
import { useReducedMotion } from '../hooks/useReducedMotion';

const ProductModelCanvas = lazy(() => import('./ProductModelCanvas'));

type PreviewMode = 'card' | 'dialog' | 'showcase';
type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

type ProductModelPreviewProps = {
  models?: readonly ProductModel[];
  fallbackImage?: ProductImage;
  productName: string;
  mode?: PreviewMode;
};

export function ProductModelPreview({
  models,
  fallbackImage,
  productName,
  mode = 'card',
}: ProductModelPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [nearViewport, setNearViewport] = useState(
    () =>
      mode === 'dialog' || (typeof window !== 'undefined' && !('IntersectionObserver' in window)),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [status, setStatus] = useState<ModelStatus>('idle');
  const [diagnostic, setDiagnostic] = useState('');

  const updateStatus = useCallback(
    (nextStatus: Exclude<ModelStatus, 'idle'>, nextDiagnostic = '') => {
      setStatus(nextStatus);
      setDiagnostic(nextDiagnostic);
    },
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !models?.length) return undefined;
    if (!('IntersectionObserver' in window)) return undefined;

    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), {
      rootMargin: mode === 'card' ? '240px 0px' : '360px 0px',
      threshold: 0,
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [mode, models]);

  if (!models?.length) {
    return (
      <div
        className={`model-preview model-preview--${mode} model-preview--static`}
        data-model-fallback
        aria-label={`${productName} source-image preview`}
        role="group"
      >
        {fallbackImage ? (
          <img src={fallbackImage.src} alt={fallbackImage.alt} loading="lazy" />
        ) : null}
        <span className="model-preview__static-label">
          <Box aria-hidden="true" size={16} />
          Source image · matching 3D model not supplied
        </span>
      </div>
    );
  }

  const activeModel = models[activeIndex] ?? models[0];
  const selectModel = (index: number) => {
    setStatus('loading');
    setActiveIndex((index + models.length) % models.length);
    setResetKey(0);
  };

  return (
    <div
      ref={hostRef}
      className={`model-preview model-preview--${mode}`}
      data-model-preview
      data-model-status={nearViewport ? status : 'standby'}
      data-model-diagnostic={diagnostic || undefined}
      aria-label={`${productName} 3D preview`}
      role="group"
    >
      <div className="model-preview__stage">
        <div className="model-preview__grid" aria-hidden="true" />

        {nearViewport && status !== 'error' ? (
          <Suspense fallback={null}>
            <ProductModelCanvas
              key={`${activeModel.src}-${resetKey}`}
              src={activeModel.src}
              label={activeModel.label}
              compact={mode === 'card'}
              collection={mode === 'showcase'}
              reducedMotion={reducedMotion}
              onStatus={updateStatus}
            />
          </Suspense>
        ) : null}

        {!nearViewport ? (
          <div className="model-preview__standby" aria-hidden="true">
            <Box />
            <span>3D preview</span>
          </div>
        ) : null}

        {nearViewport && (status === 'idle' || status === 'loading') ? <ModelLoading /> : null}

        {status === 'error' ? (
          <div className="model-preview__error" role="status">
            {fallbackImage ? <img src={fallbackImage.src} alt={fallbackImage.alt} /> : <Box />}
            <span>3D preview unavailable · source visual shown</span>
          </div>
        ) : null}

        <span className="model-preview__badge">
          <Box aria-hidden="true" size={14} />
          Interactive 3D
        </span>

        <button
          className="model-preview__reset"
          type="button"
          aria-label={`Reset 3D view of ${activeModel.label}`}
          onClick={() => {
            setStatus('loading');
            setResetKey((value) => value + 1);
          }}
        >
          <RotateCcw aria-hidden="true" size={16} />
        </button>

        <span className="model-preview__gesture" aria-hidden="true">
          Drag to rotate
        </span>
      </div>

      {models.length > 1 ? (
        <div className="model-preview__variants">
          <button
            type="button"
            aria-label="Show previous 3D model"
            onClick={() => selectModel(activeIndex - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>

          {mode === 'dialog' ? (
            <label>
              <span className="sr-only">Choose a 3D model</span>
              <select
                value={activeIndex}
                onChange={(event) => selectModel(Number(event.target.value))}
              >
                {models.map((model, index) => (
                  <option key={model.src} value={index}>
                    {index + 1}. {model.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div aria-live="polite">
              <small>
                {activeIndex + 1} / {models.length}
              </small>
              <strong>{activeModel.label}</strong>
            </div>
          )}

          <button
            type="button"
            aria-label="Show next 3D model"
            onClick={() => selectModel(activeIndex + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : (
        <p className="model-preview__model-name">{activeModel.label}</p>
      )}
    </div>
  );
}

function ModelLoading() {
  return (
    <div className="model-preview__loading" role="status">
      <span aria-hidden="true" />
      <strong>Loading 3D preview</strong>
    </div>
  );
}
