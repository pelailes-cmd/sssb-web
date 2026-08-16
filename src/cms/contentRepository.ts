import {
  aboutContent,
  assetUrl,
  documents,
  mediaItems,
  portfolioItems,
  products,
  promotions,
  services,
} from '../data/siteData';
import { requireSupabase } from './supabaseClient';
import {
  contentTypes,
  isContentData,
  type CmsSnapshot,
  type ContentCollectionRow,
  type ContentData,
  type ContentItemRow,
  type ContentType,
  type ManagedContentItem,
} from './types';

const SITE_ASSET_PREFIX = 'site:';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const staticContent = {
  products,
  promotions,
  portfolio: portfolioItems,
  services,
  documents,
  media: mediaItems,
  about: [aboutContent],
} as const;

export type AdminProfile = {
  userId: string;
  username: string;
  role: 'owner' | 'editor';
};

type SaveContentInput = {
  recordId?: string;
  contentType: ContentType;
  data: ContentData;
  position: number;
  isPublished: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isContentType = (value: unknown): value is ContentType =>
  typeof value === 'string' && contentTypes.includes(value as ContentType);

function mapJson(value: unknown, transformString: (input: string) => string): unknown {
  if (typeof value === 'string') return transformString(value);
  if (Array.isArray(value)) return value.map((item) => mapJson(item, transformString));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, mapJson(item, transformString)]),
  );
}

function encodeSiteAssets(data: ContentData): unknown {
  const base = import.meta.env.BASE_URL;

  return mapJson(data, (value) => {
    if (value.startsWith(SITE_ASSET_PREFIX)) return value;
    if (value.startsWith(`${base}assets/`)) {
      return `${SITE_ASSET_PREFIX}${value.slice(base.length)}`;
    }
    if (value.startsWith('/assets/')) {
      return `${SITE_ASSET_PREFIX}${value.slice(1)}`;
    }
    return value;
  });
}

function decodeSiteAssets(value: unknown): unknown {
  return mapJson(value, (item) =>
    item.startsWith(SITE_ASSET_PREFIX) ? assetUrl(item.slice(SITE_ASSET_PREFIX.length)) : item,
  );
}

function parseCollectionRow(value: unknown): ContentCollectionRow | null {
  if (
    !isRecord(value) ||
    !isContentType(value.content_type) ||
    typeof value.initialized_at !== 'string' ||
    typeof value.updated_at !== 'string'
  ) {
    return null;
  }

  return {
    content_type: value.content_type,
    initialized_at: value.initialized_at,
    updated_at: value.updated_at,
  };
}

function parseContentRow(value: unknown): ManagedContentItem | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isContentType(value.content_type) ||
    typeof value.slug !== 'string' ||
    typeof value.position !== 'number' ||
    typeof value.is_published !== 'boolean' ||
    typeof value.created_at !== 'string' ||
    typeof value.updated_at !== 'string'
  ) {
    return null;
  }

  const decodedData = decodeSiteAssets(value.data);
  if (!isContentData(value.content_type, decodedData)) return null;

  return {
    recordId: value.id,
    contentType: value.content_type,
    slug: value.slug,
    data: decodedData,
    position: value.position,
    isPublished: value.is_published,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function parseSnapshot(collectionData: unknown, itemData: unknown): CmsSnapshot {
  const collectionRows = Array.isArray(collectionData)
    ? collectionData.map(parseCollectionRow).filter((row) => row !== null)
    : [];
  const items = Array.isArray(itemData)
    ? itemData.map(parseContentRow).filter((row) => row !== null)
    : [];

  return {
    collections: new Set(collectionRows.map((row) => row.content_type)),
    items: items.sort(
      (a, b) => a.contentType.localeCompare(b.contentType) || a.position - b.position,
    ),
  };
}

export async function fetchPublicContent(): Promise<CmsSnapshot> {
  const client = await requireSupabase();
  const [collectionsResult, itemsResult] = await Promise.all([
    client.from('content_collections').select('*'),
    client
      .from('content_items')
      .select('*')
      .eq('is_published', true)
      .order('content_type')
      .order('position'),
  ]);

  if (collectionsResult.error) throw collectionsResult.error;
  if (itemsResult.error) throw itemsResult.error;

  return parseSnapshot(collectionsResult.data, itemsResult.data);
}

export async function fetchAdminContent(): Promise<CmsSnapshot> {
  const client = await requireSupabase();
  const [collectionsResult, itemsResult] = await Promise.all([
    client.from('content_collections').select('*'),
    client.from('content_items').select('*').order('content_type').order('position'),
  ]);

  if (collectionsResult.error) throw collectionsResult.error;
  if (itemsResult.error) throw itemsResult.error;

  return parseSnapshot(collectionsResult.data, itemsResult.data);
}

export async function getAdminProfile(userId: string): Promise<AdminProfile | null> {
  const client = await requireSupabase();
  const result = await client.from('admin_users').select('*').eq('user_id', userId).maybeSingle();

  if (result.error) throw result.error;
  if (
    !result.data ||
    typeof result.data.user_id !== 'string' ||
    typeof result.data.username !== 'string'
  ) {
    return null;
  }

  return {
    userId: result.data.user_id,
    username: result.data.username,
    role: result.data.role === 'owner' ? 'owner' : 'editor',
  };
}

const contentKey = (contentType: ContentType, slug: string) => `${contentType}:${slug}`;

export function countMissingStaticItems(snapshot: CmsSnapshot): number {
  const existingKeys = new Set(
    snapshot.items.map((item) => contentKey(item.contentType, item.slug)),
  );

  return contentTypes.reduce(
    (count, contentType) =>
      count +
      staticContent[contentType].filter(
        (item) => !existingKeys.has(contentKey(contentType, item.id)),
      ).length,
    0,
  );
}

export async function importMissingStaticContent(): Promise<CmsSnapshot> {
  const client = await requireSupabase();
  const current = await fetchAdminContent();
  const missingTypes = contentTypes.filter((type) => !current.collections.has(type));
  const existingKeys = new Set(
    current.items.map((item) => contentKey(item.contentType, item.slug)),
  );

  const itemRows = contentTypes.flatMap((contentType) =>
    staticContent[contentType]
      .filter((data) => !existingKeys.has(contentKey(contentType, data.id)))
      .map((data, fallbackPosition) => ({
        content_type: contentType,
        slug: data.id,
        data: encodeSiteAssets(data),
        position:
          current.items.filter((item) => item.contentType === contentType).length +
          fallbackPosition,
        is_published: true,
      })),
  );

  if (!missingTypes.length && !itemRows.length) return current;

  const initializedAt = new Date().toISOString();
  const collectionRows = missingTypes.map((contentType) => ({
    content_type: contentType,
    initialized_at: initializedAt,
    updated_at: initializedAt,
  }));
  if (collectionRows.length) {
    const collectionResult = await client
      .from('content_collections')
      .upsert(collectionRows, { onConflict: 'content_type' });

    if (collectionResult.error) throw collectionResult.error;
  }

  if (itemRows.length) {
    const itemResult = await client.from('content_items').upsert(itemRows, {
      onConflict: 'content_type,slug',
      ignoreDuplicates: true,
    });
    if (itemResult.error) {
      if (missingTypes.length) {
        const rollbackResult = await client
          .from('content_collections')
          .delete()
          .in('content_type', missingTypes);
        if (rollbackResult.error) {
          throw new Error(
            `${itemResult.error.message} The incomplete collection markers also need manual cleanup: ${rollbackResult.error.message}`,
          );
        }
      }
      throw itemResult.error;
    }
  }

  return fetchAdminContent();
}

async function seedCollectionBeforeFirstWrite(contentType: ContentType): Promise<number> {
  const client = await requireSupabase();
  const existingCollection = await client
    .from('content_collections')
    .select('content_type')
    .eq('content_type', contentType)
    .maybeSingle();

  if (existingCollection.error) throw existingCollection.error;
  if (existingCollection.data) return 0;

  const initializedAt = new Date().toISOString();
  const collectionResult = await client.from('content_collections').insert({
    content_type: contentType,
    initialized_at: initializedAt,
    updated_at: initializedAt,
  });
  if (collectionResult.error) throw collectionResult.error;

  const baselineRows = staticContent[contentType].map((data, position) => ({
    content_type: contentType,
    slug: data.id,
    data: encodeSiteAssets(data),
    position,
    is_published: true,
  }));

  if (!baselineRows.length) return 0;

  const baselineResult = await client.from('content_items').upsert(baselineRows, {
    onConflict: 'content_type,slug',
    ignoreDuplicates: true,
  });
  if (!baselineResult.error) return baselineRows.length;

  const rollbackResult = await client
    .from('content_collections')
    .delete()
    .eq('content_type', contentType);
  if (rollbackResult.error) {
    throw new Error(
      `${baselineResult.error.message} The incomplete collection marker also needs manual cleanup: ${rollbackResult.error.message}`,
    );
  }
  throw baselineResult.error;
}

export async function saveContentItem(input: SaveContentInput): Promise<ManagedContentItem> {
  const client = await requireSupabase();
  const seededItemCount = await seedCollectionBeforeFirstWrite(input.contentType);

  const row = {
    content_type: input.contentType,
    slug: input.data.id,
    data: encodeSiteAssets(input.data),
    position: input.recordId ? input.position : Math.max(input.position, seededItemCount),
    is_published: input.isPublished,
  };

  const result = input.recordId
    ? await client.from('content_items').update(row).eq('id', input.recordId).select('*').single()
    : await client.from('content_items').insert(row).select('*').single();

  if (result.error) throw result.error;
  const parsed = parseContentRow(result.data as ContentItemRow);
  if (!parsed) throw new Error('The saved content did not pass the site validation rules.');
  return parsed;
}

export async function deleteContentItem(recordId: string): Promise<void> {
  const client = await requireSupabase();
  const result = await client.from('content_items').delete().eq('id', recordId);
  if (result.error) throw result.error;
}

export async function updateContentOrder(
  orderedItems: Array<{ recordId: string; position: number }>,
): Promise<void> {
  const client = await requireSupabase();
  const orderedIds = [...orderedItems]
    .sort((a, b) => a.position - b.position)
    .map((item) => item.recordId);
  const result = await client.rpc('reorder_content_items', { ordered_ids: orderedIds });
  if (result.error) throw result.error;
}

export async function uploadSiteAsset(file: File, folder: ContentType): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('This file is larger than the 50 MB upload limit.');
  }

  const client = await requireSupabase();
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : '';
  const baseName = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const objectPath = `${folder}/${Date.now()}-${crypto.randomUUID()}-${baseName || 'asset'}${extension}`;
  const upload = await client.storage.from('site-assets').upload(objectPath, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (upload.error) throw upload.error;
  return client.storage.from('site-assets').getPublicUrl(upload.data.path).data.publicUrl;
}
