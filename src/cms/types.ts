import {
  productCategories,
  type AboutContent,
  type DocumentEntry,
  type PortfolioEntry,
  type Product,
  type Promotion,
  type Service,
} from '../data/siteData';

export const contentTypes = [
  'products',
  'promotions',
  'portfolio',
  'services',
  'documents',
  'about',
] as const;

export type ContentType = (typeof contentTypes)[number];

export type ContentDataByType = {
  products: Product;
  promotions: Promotion;
  portfolio: PortfolioEntry;
  services: Service;
  documents: DocumentEntry;
  about: AboutContent;
};

export type ContentData = ContentDataByType[ContentType];

export type ContentItemRow = {
  id: string;
  content_type: ContentType;
  slug: string;
  data: unknown;
  position: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type ContentCollectionRow = {
  content_type: ContentType;
  initialized_at: string;
  updated_at: string;
};

export type ManagedContentItem<T extends ContentData = ContentData> = {
  recordId: string;
  contentType: ContentType;
  slug: string;
  data: T;
  position: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CmsSnapshot = {
  collections: Set<ContentType>;
  items: ManagedContentItem[];
};

export const contentTypeLabels: Record<ContentType, string> = {
  products: 'Products',
  promotions: 'Promotions',
  portfolio: 'Portfolio',
  services: 'Services',
  documents: 'Documentation & Datasheets',
  about: 'About Us',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);

const hasStrings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => isString(value[key]));

const isImage = (value: unknown) => isRecord(value) && hasStrings(value, ['src', 'alt']);

/**
 * Service-area availability is optional on purpose. Records saved before the location filter
 * existed carry no `availability` key, and a guard that required one would make every one of
 * them fail validation and disappear from the site without any error being raised.
 */
const hasOptionalAvailability = (value: Record<string, unknown>) =>
  value.availability === undefined || isStringArray(value.availability);

const isProduct = (value: Record<string, unknown>) =>
  hasStrings(value, ['id', 'name', 'category', 'eyebrow', 'summary']) &&
  productCategories.slice(1).includes(value.category as Product['category']) &&
  Array.isArray(value.images) &&
  value.images.every(isImage) &&
  Array.isArray(value.specs) &&
  value.specs.every((spec) => isRecord(spec) && hasStrings(spec, ['label', 'value'])) &&
  (value.models === undefined ||
    (Array.isArray(value.models) &&
      value.models.every((model) => isRecord(model) && hasStrings(model, ['src', 'label'])))) &&
  hasOptionalAvailability(value);

const isPromotion = (value: Record<string, unknown>) =>
  hasStrings(value, ['id', 'title', 'supportingLine', 'status', 'statusLabel', 'condition']) &&
  ['active', 'inactive', 'unverified'].includes(value.status as string) &&
  isImage(value.image) &&
  Array.isArray(value.offers) &&
  value.offers.every((offer) => isRecord(offer) && hasStrings(offer, ['threshold', 'inclusion'])) &&
  isStringArray(value.highlights) &&
  hasOptionalAvailability(value);

const isPortfolioEntry = (value: Record<string, unknown>) =>
  hasStrings(value, ['id', 'title']) &&
  isImage(value.image) &&
  isStringArray(value.verifiedDetails);

const isService = (value: Record<string, unknown>) =>
  hasStrings(value, ['id', 'title', 'description', 'icon', 'source']) &&
  ['home', 'building', 'factory', 'tools', 'shield'].includes(value.icon as string) &&
  ['cover', 'business-message'].includes(value.source as string) &&
  hasOptionalAvailability(value);

const isDocument = (value: Record<string, unknown>) =>
  hasStrings(value, ['id', 'title', 'product', 'category', 'fileType', 'href']) &&
  (value.fileSize === undefined || isString(value.fileSize));

const isAbout = (value: Record<string, unknown>) =>
  hasStrings(value, [
    'id',
    'eyebrow',
    'title',
    'description',
    'organizationName',
    'quote',
    'location',
  ]) &&
  Array.isArray(value.commitments) &&
  value.commitments.every(
    (commitment) =>
      isRecord(commitment) &&
      hasStrings(commitment, ['title', 'copy', 'icon']) &&
      ['tools', 'support', 'shield'].includes(commitment.icon as string),
  );

export function isContentData(type: ContentType, value: unknown): value is ContentData {
  if (!isRecord(value)) return false;

  switch (type) {
    case 'products':
      return isProduct(value);
    case 'promotions':
      return isPromotion(value);
    case 'portfolio':
      return isPortfolioEntry(value);
    case 'services':
      return isService(value);
    case 'documents':
      return isDocument(value);
    case 'about':
      return isAbout(value);
  }
}
