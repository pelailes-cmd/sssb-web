/**
 * Embed handling for the Media and Content section.
 *
 * Administrator-supplied markup is never stored and never rendered. What an administrator pastes
 * is parsed once, the iframe's `src` is checked against a fixed allowlist of social platforms, and
 * only that URL plus the embed's natural dimensions are saved. The website then builds its own
 * iframe from the URL, with attributes it chooses itself.
 *
 * That is a stronger boundary than sanitising HTML: because no pasted markup is ever inserted into
 * the page, there is no path by which a `<script>` tag, an inline event handler, a `javascript:`
 * URL or an unexpected element could reach a visitor's browser. The worst a compromised
 * administrator account could achieve is an iframe pointing at one of the listed social platforms.
 *
 * The same check runs again in the runtime content guard (src/cms/types.ts), so a record written
 * directly through the API — bypassing the admin form — is dropped before it can be rendered.
 */

export const mediaPlatforms = ['facebook', 'instagram', 'youtube', 'tiktok', 'other'] as const;

export type MediaPlatform = (typeof mediaPlatforms)[number];

export const mediaPlatformLabels: Record<MediaPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  other: 'Other',
};

/**
 * Hosts an embed URL may point at. Anything else is refused, in the admin form and again when the
 * stored record is read back.
 */
export const allowedEmbedHosts: readonly string[] = [
  'facebook.com',
  'www.facebook.com',
  'web.facebook.com',
  'instagram.com',
  'www.instagram.com',
  'youtube.com',
  'www.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'tiktok.com',
  'www.tiktok.com',
];

/** Natural embed sizes outside this range are treated as a mistake rather than honoured. */
const MIN_DIMENSION = 80;
const MAX_DIMENSION = 2000;
const MAX_URL_LENGTH = 2000;

export function isAllowedEmbedUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > MAX_URL_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  // https only, and no embedded credentials, which some browsers strip and others honour.
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;

  return allowedEmbedHosts.includes(url.hostname.toLowerCase());
}

export function platformForUrl(value: string): MediaPlatform {
  let hostname: string;
  try {
    hostname = new URL(value).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  if (hostname.includes('facebook.com')) return 'facebook';
  if (hostname.includes('instagram.com')) return 'instagram';
  if (hostname.includes('youtube')) return 'youtube';
  if (hostname.includes('tiktok.com')) return 'tiktok';
  return 'other';
}

export type ParsedEmbed = {
  url: string;
  width: number;
  height: number;
  platform: MediaPlatform;
};

/** Exactly one of the two is set; check `embed` first. */
export type EmbedParseResult = { embed?: ParsedEmbed; error?: string };

function clampDimension(value: number | null, fallback: number): number {
  if (value === null || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(value)));
}

function numberOrNull(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Reads the iframe attributes without ever inserting the markup into the live document. */
function readIframeAttributes(code: string): { src: string; width: string; height: string } | null {
  if (typeof DOMParser !== 'undefined') {
    // Parsing into a detached document does not run scripts or load subresources.
    const parsed = new DOMParser().parseFromString(code, 'text/html');
    const iframe = parsed.querySelector('iframe');
    if (!iframe) return null;
    return {
      src: iframe.getAttribute('src') ?? '',
      width: iframe.getAttribute('width') ?? '',
      height: iframe.getAttribute('height') ?? '',
    };
  }

  // Fallback for non-browser callers such as the test suite.
  const iframe = /<iframe\b[^>]*>/i.exec(code);
  if (!iframe) return null;
  const attribute = (name: string) => {
    const match = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(iframe[0]);
    return match ? match[1] : '';
  };
  return { src: attribute('src'), width: attribute('width'), height: attribute('height') };
}

/**
 * Accepts either a complete embed snippet copied from a social platform or a bare embed URL, and
 * returns the pieces worth storing. Administrators are not asked to edit the code they were given.
 */
export function parseEmbedCode(input: string): EmbedParseResult {
  const code = input.trim();
  if (!code) return { error: 'Paste the embed code supplied by the social media platform.' };

  let src: string;
  let widthAttribute: string | null = null;
  let heightAttribute: string | null = null;

  if (/^https?:\/\//i.test(code) && !/[<>]/.test(code)) {
    src = code;
  } else {
    const attributes = readIframeAttributes(code);
    if (!attributes) {
      return {
        error: 'No <iframe> was found. Paste the full embed code, or the embed URL on its own.',
      };
    }
    src = attributes.src.trim();
    widthAttribute = attributes.width;
    heightAttribute = attributes.height;
  }

  // Embed codes are commonly pasted with HTML-escaped ampersands in the query string.
  src = src.replace(/&amp;/g, '&').trim();

  if (!src) return { error: 'The embed code does not contain a source address.' };
  if (!isAllowedEmbedUrl(src)) {
    return {
      error: `This embed is not from a supported platform. Allowed sources are ${allowedEmbedHosts
        .filter((host) => !host.startsWith('www.') && !host.startsWith('web.'))
        .join(', ')}, over https.`,
    };
  }

  const url = new URL(src);
  // Facebook plugin URLs repeat the intended size in the query string, which is a better fallback
  // than a generic default when the snippet omits the attributes.
  const width = clampDimension(
    numberOrNull(widthAttribute) ?? numberOrNull(url.searchParams.get('width')),
    500,
  );
  const height = clampDimension(
    numberOrNull(heightAttribute) ?? numberOrNull(url.searchParams.get('height')),
    500,
  );

  return { embed: { url: src, width, height, platform: platformForUrl(src) } };
}
