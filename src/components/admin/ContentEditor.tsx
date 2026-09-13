import { FileUp, LoaderCircle, Save, X } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { uploadSiteAsset } from '../../cms/contentRepository';
import {
  isAllowedEmbedUrl,
  mediaPlatformLabels,
  mediaPlatforms,
  parseEmbedCode,
  type MediaPlatform,
} from '../../lib/mediaEmbed';
import {
  isContentData,
  type ContentData,
  type ContentType,
  type ManagedContentItem,
} from '../../cms/types';
import {
  aboutContent,
  productCategories,
  serviceAreaOptions,
  type AboutCommitment,
  type AboutContent,
  type DocumentEntry,
  type MediaItem,
  type PortfolioEntry,
  type Product,
  type ProductImage,
  type ProductModel,
  type ProductSpec,
  type Promotion,
  type Service,
  type ServiceAreaCode,
} from '../../data/siteData';

type ContentEditorProps = {
  contentType: ContentType;
  item: ManagedContentItem | null;
  isSaving: boolean;
  saveError: string | null;
  onCancel: () => void;
  onSave: (data: ContentData, isPublished: boolean) => Promise<void>;
};

type Pair = { first: string; second: string };

const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function createDefaultContent(type: ContentType): ContentData {
  switch (type) {
    case 'products':
      return {
        id: makeId('product'),
        name: '',
        category: 'Solar Panels',
        eyebrow: '',
        summary: '',
        images: [{ src: '', alt: '' }],
        specs: [],
      };
    case 'promotions':
      return {
        id: makeId('promotion'),
        title: '',
        supportingLine: '',
        status: 'unverified',
        statusLabel: 'Confirm availability',
        condition: '',
        image: { src: '', alt: '' },
        offers: [],
        highlights: [],
      };
    case 'portfolio':
      return {
        id: makeId('project'),
        title: '',
        image: { src: '', alt: '' },
        verifiedDetails: [],
      };
    case 'services':
      return {
        id: makeId('service'),
        title: '',
        description: '',
        icon: 'tools',
        source: 'business-message',
      };
    case 'documents':
      return {
        id: makeId('document'),
        title: '',
        product: '',
        category: '',
        fileType: 'PDF',
        href: '',
      };
    case 'media':
      return {
        id: makeId('media'),
        title: '',
        platform: 'facebook',
        embedUrl: '',
        embedWidth: 500,
        embedHeight: 500,
      };
    case 'about':
      return structuredClone(aboutContent);
  }
}

const pairsToText = (pairs: Pair[]) =>
  pairs.map(({ first, second }) => `${first} | ${second}`).join('\n');

const textToPairs = (value: string): Pair[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('|');
      if (separator < 0) return { first: line, second: '' };
      return {
        first: line.slice(0, separator).trim(),
        second: line.slice(separator + 1).trim(),
      };
    });

const listToText = (items: string[]) => items.join('\n');

const textToList = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

function Field({
  label,
  hint,
  children,
  full = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`admin-field${full ? ' admin-field--full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

/**
 * Service-area availability. An empty selection is stored as `undefined` rather than an empty
 * array, which the public site reads as "available in every service area" — the same behaviour
 * records saved before this control existed already have.
 */
function AvailabilityField({
  value,
  onChange,
}: {
  value: ServiceAreaCode[] | undefined;
  onChange: (value: ServiceAreaCode[] | undefined) => void;
}) {
  const selected = value ?? [];

  const toggle = (code: ServiceAreaCode, checked: boolean) => {
    const next = checked ? [...selected, code] : selected.filter((entry) => entry !== code);
    onChange(next.length ? next : undefined);
  };

  return (
    <div className="admin-field admin-field--full">
      <span>Location availability</span>
      <div className="admin-availability">
        {serviceAreaOptions.map((option) => (
          <label key={option.code} className="admin-check">
            <input
              type="checkbox"
              checked={selected.includes(option.code)}
              onChange={(event) => toggle(option.code, event.target.checked)}
            />
            <span>
              <strong>{option.place}</strong>
            </span>
          </label>
        ))}
      </div>
      <small>
        {selected.length
          ? 'Shown only when a visitor selects one of the ticked areas.'
          : 'No areas ticked, so this record is shown in every location.'}
      </small>
    </div>
  );
}

function AssetField({
  label,
  value,
  contentType,
  accept,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  contentType: ContentType;
  accept: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      onChange(await uploadSiteAsset(file, contentType));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The file could not be uploaded.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="admin-field admin-field--full admin-asset-field">
      <span>{label}</span>
      <div className="admin-asset-field__row">
        <input
          type="url"
          value={value}
          placeholder="https://…"
          onChange={(event) => onChange(event.target.value)}
        />
        <label className="admin-upload-button">
          {isUploading ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" />
          ) : (
            <FileUp aria-hidden="true" />
          )}
          <span>{isUploading ? 'Uploading…' : 'Upload file'}</span>
          <input
            type="file"
            accept={accept}
            disabled={isUploading}
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>
      {hint ? <small>{hint}</small> : null}
      {uploadError ? <small className="admin-field__error">{uploadError}</small> : null}
    </div>
  );
}

function ProductFields({
  value,
  onChange,
}: {
  value: Product;
  onChange: (value: Product) => void;
}) {
  const primaryImage = value.images[0] ?? { src: '', alt: '' };
  const additionalImages = value.images.slice(1);
  const primaryModel = value.models?.[0] ?? { src: '', label: '' };
  const additionalModels = value.models?.slice(1) ?? [];

  const setPrimaryImage = (image: ProductImage) =>
    onChange({ ...value, images: [image, ...additionalImages] });
  const setPrimaryModel = (model: ProductModel) => {
    const models = model.src || model.label ? [model, ...additionalModels] : additionalModels;
    onChange({ ...value, models: models.length ? models : undefined });
  };

  return (
    <>
      <Field label="Product name">
        <input
          value={value.name}
          required
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </Field>
      <Field label="Brand" hint="Leave blank when the source does not verify a brand.">
        <input
          value={value.brand ?? ''}
          onChange={(event) => onChange({ ...value, brand: event.target.value || undefined })}
        />
      </Field>
      <Field label="Category">
        <select
          value={value.category}
          onChange={(event) =>
            onChange({ ...value, category: event.target.value as Product['category'] })
          }
        >
          {productCategories.slice(1).map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </Field>
      <Field label="Short specification line">
        <input
          value={value.eyebrow}
          required
          onChange={(event) => onChange({ ...value, eyebrow: event.target.value })}
        />
      </Field>
      <Field label="Product summary" full>
        <textarea
          rows={4}
          value={value.summary}
          required
          onChange={(event) => onChange({ ...value, summary: event.target.value })}
        />
      </Field>
      <AssetField
        label="Primary product image"
        value={primaryImage.src}
        contentType="products"
        accept="image/png,image/jpeg,image/webp,image/avif"
        hint="Upload an optimized image or paste a verified public URL. Maximum 50 MB."
        onChange={(src) => setPrimaryImage({ ...primaryImage, src })}
      />
      <Field label="Primary image alternative text" full>
        <input
          value={primaryImage.alt}
          required
          onChange={(event) => setPrimaryImage({ ...primaryImage, alt: event.target.value })}
        />
      </Field>
      <Field label="Additional images" hint="One per line: image URL | alternative text" full>
        <textarea
          rows={3}
          value={pairsToText(
            additionalImages.map((image) => ({ first: image.src, second: image.alt })),
          )}
          onChange={(event) =>
            onChange({
              ...value,
              images: [
                primaryImage,
                ...textToPairs(event.target.value).map(({ first, second }) => ({
                  src: first,
                  alt: second,
                })),
              ],
            })
          }
        />
      </Field>
      <AssetField
        label="Primary 3D model"
        value={primaryModel.src}
        contentType="products"
        accept=".glb,model/gltf-binary,application/octet-stream"
        hint="Optional GLB model. Existing repository models can also be referenced by URL."
        onChange={(src) => setPrimaryModel({ ...primaryModel, src })}
      />
      <Field label="Primary 3D model label" full>
        <input
          value={primaryModel.label}
          onChange={(event) => setPrimaryModel({ ...primaryModel, label: event.target.value })}
        />
      </Field>
      <Field
        label="Additional 3D models"
        hint="One per line: GLB URL | accessible model label"
        full
      >
        <textarea
          rows={3}
          value={pairsToText(
            additionalModels.map((model) => ({ first: model.src, second: model.label })),
          )}
          onChange={(event) => {
            const rest = textToPairs(event.target.value).map(({ first, second }) => ({
              src: first,
              label: second,
            }));
            const models = primaryModel.src || primaryModel.label ? [primaryModel, ...rest] : rest;
            onChange({ ...value, models: models.length ? models : undefined });
          }}
        />
      </Field>
      <Field label="Verified specifications" hint="One per line: label | exact value" full>
        <textarea
          rows={6}
          value={pairsToText(
            value.specs.map((spec) => ({ first: spec.label, second: spec.value })),
          )}
          onChange={(event) =>
            onChange({
              ...value,
              specs: textToPairs(event.target.value).map<ProductSpec>(({ first, second }) => ({
                label: first,
                value: second,
              })),
            })
          }
        />
      </Field>
      <Field label="Source note" full>
        <textarea
          rows={3}
          value={value.sourceNote ?? ''}
          onChange={(event) => onChange({ ...value, sourceNote: event.target.value || undefined })}
        />
      </Field>
      <label className="admin-check admin-field--full">
        <input
          type="checkbox"
          checked={Boolean(value.featured)}
          onChange={(event) => onChange({ ...value, featured: event.target.checked })}
        />
        <span>Feature this product</span>
      </label>
      <AvailabilityField
        value={value.availability}
        onChange={(availability) => onChange({ ...value, availability })}
      />
      <Field
        label="Selling price per unit"
        hint="In pesos. Leave blank to list the product as “Price on request”, which also keeps it out of the cart."
      >
        <input
          type="number"
          min="0"
          step="100"
          value={value.price ?? ''}
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value);
            onChange({
              ...value,
              price: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
            });
          }}
        />
      </Field>
      {serviceAreaOptions.map((option) => (
        <Field
          key={option.code}
          label={`Stock — ${option.place}`}
          hint="Units on hand. Zero or blank shows the branch as out of stock."
        >
          <input
            type="number"
            min="0"
            step="1"
            value={value.stock?.[option.code] ?? ''}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              const next = { ...(value.stock ?? {}) };
              if (Number.isFinite(parsed) && parsed >= 0) next[option.code] = parsed;
              else delete next[option.code];
              onChange({
                ...value,
                stock: Object.keys(next).length ? next : undefined,
              });
            }}
          />
        </Field>
      ))}
    </>
  );
}

function PromotionFields({
  value,
  onChange,
}: {
  value: Promotion;
  onChange: (value: Promotion) => void;
}) {
  return (
    <>
      <Field label="Promotion title">
        <input
          value={value.title}
          required
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
      </Field>
      <Field label="Supporting line">
        <input
          value={value.supportingLine}
          required
          onChange={(event) => onChange({ ...value, supportingLine: event.target.value })}
        />
      </Field>
      <Field label="Status">
        <select
          value={value.status}
          onChange={(event) =>
            onChange({ ...value, status: event.target.value as Promotion['status'] })
          }
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="unverified">Unverified</option>
        </select>
      </Field>
      <Field label="Status label">
        <input
          value={value.statusLabel}
          required
          onChange={(event) => onChange({ ...value, statusLabel: event.target.value })}
        />
      </Field>
      <Field label="Conditions and validity" full>
        <textarea
          rows={3}
          value={value.condition}
          required
          onChange={(event) => onChange({ ...value, condition: event.target.value })}
        />
      </Field>
      <AssetField
        label="Promotion image"
        value={value.image.src}
        contentType="promotions"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={(src) => onChange({ ...value, image: { ...value.image, src } })}
      />
      <Field label="Image alternative text" full>
        <input
          value={value.image.alt}
          required
          onChange={(event) =>
            onChange({ ...value, image: { ...value.image, alt: event.target.value } })
          }
        />
      </Field>
      <Field label="Offers" hint="One per line: qualifying purchase | inclusion" full>
        <textarea
          rows={5}
          value={pairsToText(
            value.offers.map((offer) => ({ first: offer.threshold, second: offer.inclusion })),
          )}
          onChange={(event) =>
            onChange({
              ...value,
              offers: textToPairs(event.target.value).map(({ first, second }) => ({
                threshold: first,
                inclusion: second,
              })),
            })
          }
        />
      </Field>
      <Field label="Highlights" hint="One verified highlight per line" full>
        <textarea
          rows={4}
          value={listToText(value.highlights)}
          onChange={(event) => onChange({ ...value, highlights: textToList(event.target.value) })}
        />
      </Field>
      <AvailabilityField
        value={value.availability}
        onChange={(availability) => onChange({ ...value, availability })}
      />
    </>
  );
}

function PortfolioFields({
  value,
  onChange,
}: {
  value: PortfolioEntry;
  onChange: (value: PortfolioEntry) => void;
}) {
  return (
    <>
      <Field label="Project title" full>
        <input
          value={value.title}
          required
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
      </Field>
      <AssetField
        label="Approved project photograph"
        value={value.image.src}
        contentType="portfolio"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={(src) => onChange({ ...value, image: { ...value.image, src } })}
      />
      <Field label="Image alternative text" full>
        <input
          value={value.image.alt}
          required
          onChange={(event) =>
            onChange({ ...value, image: { ...value.image, alt: event.target.value } })
          }
        />
      </Field>
      <Field label="Verified project details" hint="One confirmed detail per line" full>
        <textarea
          rows={5}
          value={listToText(value.verifiedDetails)}
          onChange={(event) =>
            onChange({ ...value, verifiedDetails: textToList(event.target.value) })
          }
        />
      </Field>
    </>
  );
}

function ServiceFields({
  value,
  onChange,
}: {
  value: Service;
  onChange: (value: Service) => void;
}) {
  return (
    <>
      <Field label="Service title" full>
        <input
          value={value.title}
          required
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
      </Field>
      <Field label="Description" full>
        <textarea
          rows={5}
          value={value.description}
          required
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </Field>
      <Field label="Icon">
        <select
          value={value.icon}
          onChange={(event) => onChange({ ...value, icon: event.target.value as Service['icon'] })}
        >
          <option value="home">Home</option>
          <option value="building">Commercial building</option>
          <option value="factory">Factory</option>
          <option value="tools">Support tools</option>
          <option value="shield">Warranty shield</option>
        </select>
      </Field>
      <Field label="Verification source">
        <select
          value={value.source}
          onChange={(event) =>
            onChange({ ...value, source: event.target.value as Service['source'] })
          }
        >
          <option value="cover">Supplied cover</option>
          <option value="business-message">Verified business message</option>
        </select>
      </Field>
      <AvailabilityField
        value={value.availability}
        onChange={(availability) => onChange({ ...value, availability })}
      />
    </>
  );
}

/**
 * Media and Content fields.
 *
 * The administrator pastes the snippet exactly as the platform issued it. It is parsed here and
 * only the resulting address and natural size are kept — the markup itself is never stored and
 * never rendered, so nothing an administrator pastes can execute on the public website.
 */
function MediaFields({
  value,
  onChange,
}: {
  value: MediaItem;
  onChange: (value: MediaItem) => void;
}) {
  const [pasted, setPasted] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const applyEmbed = (code: string) => {
    setPasted(code);
    if (!code.trim()) {
      setParseError(null);
      return;
    }

    const { embed, error } = parseEmbedCode(code);
    if (!embed) {
      setParseError(error ?? 'This embed could not be read.');
      return;
    }

    setParseError(null);
    onChange({
      ...value,
      embedUrl: embed.url,
      embedWidth: embed.width,
      embedHeight: embed.height,
      platform: embed.platform,
    });
  };

  const previewScale = Math.min(1, 320 / value.embedHeight, 460 / value.embedWidth);

  return (
    <>
      <Field label="Title" hint="Shown under the post on the website." full>
        <input
          value={value.title}
          required
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
      </Field>

      <Field label="Platform">
        <select
          value={value.platform}
          onChange={(event) =>
            onChange({ ...value, platform: event.target.value as MediaPlatform })
          }
        >
          {mediaPlatforms.map((platform) => (
            <option key={platform} value={platform}>
              {mediaPlatformLabels[platform]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Description" hint="Optional line shown beneath the title.">
        <input
          value={value.description ?? ''}
          onChange={(event) => onChange({ ...value, description: event.target.value || undefined })}
        />
      </Field>

      <Field
        label="Embed code"
        hint="Paste the whole embed code from the platform, or just the embed address. Facebook, Instagram, YouTube and TikTok embeds are accepted."
        full
      >
        <textarea
          rows={5}
          value={pasted}
          placeholder='<iframe src="https://www.facebook.com/plugins/post.php?..." …></iframe>'
          onChange={(event) => applyEmbed(event.target.value)}
        />
      </Field>

      {parseError ? (
        <p className="admin-editor__error admin-field--full" role="alert">
          {parseError}
        </p>
      ) : null}

      <div className="admin-field admin-field--full">
        <span>Stored embed address</span>
        <code className="admin-media-url">{value.embedUrl || 'Nothing stored yet.'}</code>
        <small>
          Only this address is saved. It is rebuilt into an iframe by the website, so the original
          markup never reaches a visitor.
        </small>
      </div>

      <div className="admin-field admin-field--full">
        <span>Preview</span>
        <div className="admin-media-preview">
          {isAllowedEmbedUrl(value.embedUrl) ? (
            <div
              className="admin-media-preview__stage"
              style={{ height: `${value.embedHeight * previewScale}px` }}
            >
              <iframe
                title={`Preview of ${value.title || 'the media post'}`}
                src={value.embedUrl}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                allowFullScreen
                style={{
                  width: `${value.embedWidth}px`,
                  height: `${value.embedHeight}px`,
                  transform: `translate(-50%, -50%) scale(${previewScale})`,
                }}
              />
            </div>
          ) : (
            <p className="admin-media-preview__empty">
              Paste a supported embed to see how it will appear.
            </p>
          )}
        </div>
        <small>
          Natural size {value.embedWidth} × {value.embedHeight}. The website scales each embed to
          fit its card without distorting it.
        </small>
      </div>
    </>
  );
}

function DocumentFields({
  value,
  onChange,
}: {
  value: DocumentEntry;
  onChange: (value: DocumentEntry) => void;
}) {
  return (
    <>
      <Field label="Document title">
        <input
          value={value.title}
          required
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
      </Field>
      <Field label="Product or subject">
        <input
          value={value.product}
          required
          onChange={(event) => onChange({ ...value, product: event.target.value })}
        />
      </Field>
      <Field label="Category">
        <input
          value={value.category}
          required
          onChange={(event) => onChange({ ...value, category: event.target.value })}
        />
      </Field>
      <Field label="File type">
        <input
          value={value.fileType}
          required
          placeholder="PDF"
          onChange={(event) => onChange({ ...value, fileType: event.target.value })}
        />
      </Field>
      <Field label="File size" hint="Optional display value, such as 2.4 MB.">
        <input
          value={value.fileSize ?? ''}
          onChange={(event) => onChange({ ...value, fileSize: event.target.value || undefined })}
        />
      </Field>
      <AssetField
        label="Document file"
        value={value.href}
        contentType="documents"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf"
        hint="Upload a verified file or paste its public URL."
        onChange={(href) => onChange({ ...value, href })}
      />
    </>
  );
}

const commitmentsToText = (items: AboutCommitment[]) =>
  items.map((item) => `${item.title} | ${item.copy} | ${item.icon}`).join('\n');

const textToCommitments = (value: string): AboutCommitment[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title = '', copy = '', requestedIcon = 'support'] = line
        .split('|')
        .map((part) => part.trim());
      const icon = ['tools', 'support', 'shield'].includes(requestedIcon)
        ? (requestedIcon as AboutCommitment['icon'])
        : 'support';
      return { title, copy, icon };
    });

function AboutFields({
  value,
  onChange,
}: {
  value: AboutContent;
  onChange: (value: AboutContent) => void;
}) {
  return (
    <>
      <Field label="Section eyebrow">
        <input
          value={value.eyebrow}
          required
          onChange={(event) => onChange({ ...value, eyebrow: event.target.value })}
        />
      </Field>
      <Field label="Organization name">
        <input
          value={value.organizationName}
          required
          onChange={(event) => onChange({ ...value, organizationName: event.target.value })}
        />
      </Field>
      <Field label="Section title" full>
        <input
          value={value.title}
          required
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
      </Field>
      <Field label="Introduction" full>
        <textarea
          rows={4}
          value={value.description}
          required
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </Field>
      <Field label="Company commitment quote" full>
        <textarea
          rows={4}
          value={value.quote}
          required
          onChange={(event) => onChange({ ...value, quote: event.target.value })}
        />
      </Field>
      <Field label="Location shown in About Us" full>
        <input
          value={value.location}
          required
          onChange={(event) => onChange({ ...value, location: event.target.value })}
        />
      </Field>
      <Field
        label="Commitments"
        hint="One per line: title | description | tools, support, or shield"
        full
      >
        <textarea
          rows={6}
          value={commitmentsToText(value.commitments)}
          onChange={(event) =>
            onChange({ ...value, commitments: textToCommitments(event.target.value) })
          }
        />
      </Field>
    </>
  );
}

function validateDraft(type: ContentType, data: ContentData) {
  if (!isContentData(type, data)) return 'Some required content fields are invalid.';

  switch (type) {
    case 'products': {
      const product = data as Product;
      if (!product.name.trim() || !product.eyebrow.trim() || !product.summary.trim()) {
        return 'Product name, specification line, and summary are required.';
      }
      if (!product.images[0]?.src.trim() || !product.images[0]?.alt.trim()) {
        return 'A primary product image and alternative text are required.';
      }
      return null;
    }
    case 'promotions': {
      const promotion = data as Promotion;
      return promotion.title.trim() && promotion.image.src.trim()
        ? null
        : 'Promotion title and image are required.';
    }
    case 'portfolio': {
      const entry = data as PortfolioEntry;
      return entry.title.trim() && entry.image.src.trim()
        ? null
        : 'Project title and approved photograph are required.';
    }
    case 'services': {
      const service = data as Service;
      return service.title.trim() && service.description.trim()
        ? null
        : 'Service title and description are required.';
    }
    case 'documents': {
      const document = data as DocumentEntry;
      return document.title.trim() && document.href.trim()
        ? null
        : 'Document title and file are required.';
    }
    case 'media': {
      const media = data as MediaItem;
      if (!media.title.trim()) return 'A media title is required.';
      if (!isAllowedEmbedUrl(media.embedUrl)) {
        return 'Paste an embed from a supported platform before saving.';
      }
      return null;
    }
    case 'about': {
      const about = data as AboutContent;
      return about.title.trim() && about.description.trim() && about.quote.trim()
        ? null
        : 'About title, introduction, and commitment quote are required.';
    }
  }
}

export function ContentEditor({
  contentType,
  item,
  isSaving,
  saveError,
  onCancel,
  onSave,
}: ContentEditorProps) {
  const initialContent = useMemo(
    () => structuredClone(item?.data ?? createDefaultContent(contentType)),
    [contentType, item],
  );
  const [draft, setDraft] = useState<ContentData>(initialContent);
  const [isPublished, setIsPublished] = useState(item?.isPublished ?? true);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = validateDraft(contentType, draft);
    setValidationError(nextError);
    if (nextError) return;
    await onSave(draft, isPublished);
  };

  return (
    <form className="admin-editor" onSubmit={submit} noValidate>
      <div className="admin-editor__header">
        <div>
          <p className="eyebrow">{item ? 'Edit record' : 'New record'}</p>
          <h3>{item ? item.data.id : `Add ${contentType}`}</h3>
        </div>
        <button className="icon-button" type="button" aria-label="Close editor" onClick={onCancel}>
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="admin-editor__fields">
        {contentType === 'products' ? (
          <ProductFields value={draft as Product} onChange={setDraft} />
        ) : null}
        {contentType === 'promotions' ? (
          <PromotionFields value={draft as Promotion} onChange={setDraft} />
        ) : null}
        {contentType === 'portfolio' ? (
          <PortfolioFields value={draft as PortfolioEntry} onChange={setDraft} />
        ) : null}
        {contentType === 'services' ? (
          <ServiceFields value={draft as Service} onChange={setDraft} />
        ) : null}
        {contentType === 'documents' ? (
          <DocumentFields value={draft as DocumentEntry} onChange={setDraft} />
        ) : null}
        {contentType === 'media' ? (
          <MediaFields value={draft as MediaItem} onChange={setDraft} />
        ) : null}
        {contentType === 'about' ? (
          <AboutFields value={draft as AboutContent} onChange={setDraft} />
        ) : null}
      </div>

      <label className="admin-check admin-editor__publish">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(event) => setIsPublished(event.target.checked)}
        />
        <span>
          <strong>Published</strong>
          <small>Uncheck to keep this record available only inside the admin dashboard.</small>
        </span>
      </label>

      {validationError || saveError ? (
        <p className="admin-editor__error" role="alert">
          {validationError ?? saveError}
        </p>
      ) : null}

      <div className="admin-editor__actions">
        <button className="button button--ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button--primary" type="submit" disabled={isSaving}>
          {isSaving ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          {isSaving ? 'Saving…' : 'Save content'}
        </button>
      </div>
    </form>
  );
}
