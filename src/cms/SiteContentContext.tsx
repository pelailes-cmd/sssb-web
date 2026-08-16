/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AboutContent,
  DocumentEntry,
  MediaItem,
  PortfolioEntry,
  Product,
  Promotion,
  Service,
} from '../data/siteData';
import { fetchPublicContent, staticContent } from './contentRepository';
import { cmsConfiguration } from './supabaseClient';
import type { CmsSnapshot, ContentType } from './types';

const CACHE_KEY = 'sssb-public-content-v1';

export type SiteContent = {
  products: Product[];
  promotions: Promotion[];
  portfolioItems: PortfolioEntry[];
  services: Service[];
  documents: DocumentEntry[];
  media: MediaItem[];
  about: AboutContent | null;
};

type ContentStatus = 'static' | 'loading' | 'live' | 'cached' | 'error';

type SiteContentContextValue = SiteContent & {
  status: ContentStatus;
  isConfigured: boolean;
  message: string | null;
  refresh: () => Promise<void>;
};

type CachedContent = {
  version: 1;
  savedAt: string;
  content: SiteContent;
};

const fallbackContent: SiteContent = {
  products: [...staticContent.products],
  promotions: [...staticContent.promotions],
  portfolioItems: [...staticContent.portfolio],
  services: [...staticContent.services],
  documents: [...staticContent.documents],
  media: [...staticContent.media],
  about: staticContent.about[0],
};

const SiteContentContext = createContext<SiteContentContextValue | null>(null);

function hasCollection(snapshot: CmsSnapshot, type: ContentType) {
  return snapshot.collections.has(type);
}

function materializeSnapshot(snapshot: CmsSnapshot): SiteContent {
  const dataFor = (type: ContentType) =>
    snapshot.items
      .filter((item) => item.contentType === type && item.isPublished)
      .sort((a, b) => a.position - b.position)
      .map((item) => item.data);

  const aboutItems = dataFor('about') as AboutContent[];

  return {
    products: hasCollection(snapshot, 'products')
      ? (dataFor('products') as Product[])
      : [...fallbackContent.products],
    promotions: hasCollection(snapshot, 'promotions')
      ? (dataFor('promotions') as Promotion[])
      : [...fallbackContent.promotions],
    portfolioItems: hasCollection(snapshot, 'portfolio')
      ? (dataFor('portfolio') as PortfolioEntry[])
      : [...fallbackContent.portfolioItems],
    services: hasCollection(snapshot, 'services')
      ? (dataFor('services') as Service[])
      : [...fallbackContent.services],
    documents: hasCollection(snapshot, 'documents')
      ? (dataFor('documents') as DocumentEntry[])
      : [...fallbackContent.documents],
    media: hasCollection(snapshot, 'media')
      ? (dataFor('media') as MediaItem[])
      : [...fallbackContent.media],
    about: hasCollection(snapshot, 'about') ? (aboutItems[0] ?? null) : fallbackContent.about,
  };
}

function readCache(): SiteContent | null {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as CachedContent;
    return parsed.version === 1 && parsed.content ? parsed.content : null;
  } catch {
    return null;
  }
}

function writeCache(content: SiteContent) {
  try {
    const cached: CachedContent = {
      version: 1,
      savedAt: new Date().toISOString(),
      content,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Storage can be unavailable in privacy modes; live content still remains usable.
  }
}

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<SiteContent>(fallbackContent);
  const [status, setStatus] = useState<ContentStatus>(
    cmsConfiguration.isConfigured ? 'loading' : 'static',
  );
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!cmsConfiguration.isConfigured) {
      setContent(fallbackContent);
      setStatus('static');
      setMessage(null);
      return;
    }

    setStatus((current) => (current === 'live' ? current : 'loading'));
    try {
      const snapshot = await fetchPublicContent();
      const nextContent = materializeSnapshot(snapshot);
      setContent(nextContent);
      setStatus('live');
      setMessage(null);
      writeCache(nextContent);
    } catch (error) {
      const cached = readCache();
      if (cached) {
        setContent(cached);
        setStatus('cached');
        setMessage('Showing the most recently synchronized content while the database reconnects.');
      } else {
        setContent(fallbackContent);
        setStatus('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Managed content is temporarily unavailable; static content is shown.',
        );
      }
    }
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(request);
  }, [refresh]);

  const value = useMemo<SiteContentContextValue>(
    () => ({
      ...content,
      status,
      isConfigured: cmsConfiguration.isConfigured,
      message,
      refresh,
    }),
    [content, message, refresh, status],
  );

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent() {
  const value = useContext(SiteContentContext);
  if (!value) throw new Error('useSiteContent must be used inside SiteContentProvider.');
  return value;
}
