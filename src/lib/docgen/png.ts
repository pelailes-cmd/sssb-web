/**
 * Canvas 2D renderer for the quotation document.
 *
 * Layout runs twice over the same code path: once against a scratch canvas with drawing
 * disabled (text can only be measured once a context exists, and the final page height is
 * only known after every block has been wrapped), then again against the real canvas sized
 * to the measured height. Everything is expressed in a 900px logical space and the real
 * canvas is scaled by SCALE, so the exported PNG is 1800px wide.
 */

import type {
  DocumentAssets,
  DocumentMetaRow,
  QuotationDocumentModel,
  QuotationDocumentRenderer,
} from './types';

const WIDTH = 900;
const SCALE = 2;
const MARGIN = 56;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;

const HEADER_PAD = 26;
const LOGO_BOX = 66;
const ACCENT_HEIGHT = 4;
const CONTACT_WIDTH = 290;
const BADGE_HEIGHT = 26;
const BADGE_PAD_X = 14;
const META_COLUMN_GAP = 36;
const META_ROW_GAP = 14;
const ROW_PAD = 13;
const TOTAL_HEIGHT = 56;
const FOOTER_BAR = 8;

const SANS = "'Segoe UI Variable', 'Segoe UI', Inter, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const COLOR = {
  navy975: '#041423',
  navy950: '#061b31',
  navy900: '#082f55',
  blue700: '#0768b2',
  blue500: '#18a2e3',
  cyan300: '#78d9e9',
  cyan100: '#dff7fb',
  solar: '#f1e92e',
  ink: '#0a2035',
  text: '#243e54',
  muted: '#60778a',
  border: '#d9e5ec',
  white: '#ffffff',
} as const;

const font = (weight: number, size: number, family: string = SANS): string =>
  `${weight} ${size}px ${family}`;

type TextStyle = {
  font: string;
  color: string;
  lineHeight: number;
  /** Extra px inserted between glyphs; drawn manually so measuring and painting agree. */
  tracking?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
};

const STYLE = {
  companyName: { font: font(600, 25), color: COLOR.white, lineHeight: 31 },
  tagline: { font: font(400, 13), color: COLOR.cyan300, lineHeight: 17 },
  phone: { font: font(600, 13), color: COLOR.cyan100, lineHeight: 18, align: 'right' },
  address: { font: font(400, 12.5), color: COLOR.cyan300, lineHeight: 17, align: 'right' },
  initials: {
    font: font(700, 24),
    color: COLOR.white,
    lineHeight: 24,
    tracking: 1,
    align: 'center',
    baseline: 'middle',
  },
  title: { font: font(600, 29, SERIF), color: COLOR.navy950, lineHeight: 38, tracking: 3 },
  badge: {
    font: font(700, 11.5),
    color: COLOR.navy900,
    lineHeight: 14,
    tracking: 1.2,
    baseline: 'middle',
  },
  metaLabel: { font: font(600, 10), color: COLOR.muted, lineHeight: 13, tracking: 1.1 },
  metaValue: { font: font(400, 13.5), color: COLOR.ink, lineHeight: 18 },
  highlightLabel: { font: font(600, 9.5), color: COLOR.blue700, lineHeight: 13, tracking: 1.1 },
  highlightValue: { font: font(600, 17), color: COLOR.navy950, lineHeight: 22 },
  sectionHeading: { font: font(700, 12), color: COLOR.blue700, lineHeight: 16, tracking: 1.6 },
  itemLabel: { font: font(400, 14), color: COLOR.text, lineHeight: 20 },
  itemAmount: { font: font(600, 14), color: COLOR.ink, lineHeight: 20, align: 'right' },
  totalLabel: {
    font: font(700, 13),
    color: COLOR.white,
    lineHeight: 16,
    tracking: 1.5,
    baseline: 'middle',
  },
  totalAmount: {
    font: font(700, 21),
    color: COLOR.solar,
    lineHeight: 24,
    align: 'right',
    baseline: 'middle',
  },
  note: { font: font(400, 12.5), color: COLOR.text, lineHeight: 18 },
  disclaimerLabel: { font: font(700, 11), color: COLOR.navy900, lineHeight: 15, tracking: 1.4 },
  disclaimerBody: { font: font(400, 11.5), color: COLOR.text, lineHeight: 17 },
  footnote: { font: font(400, 10), color: COLOR.muted, lineHeight: 14 },
} satisfies Record<string, TextStyle>;

type Painter = {
  ctx: CanvasRenderingContext2D;
  /** False during the measure pass: geometry is computed, nothing is committed to pixels. */
  drawing: boolean;
};

const measureTracked = (ctx: CanvasRenderingContext2D, text: string, tracking: number): number => {
  if (tracking === 0) return ctx.measureText(text).width;
  const chars = Array.from(text);
  let width = 0;
  for (const char of chars) width += ctx.measureText(char).width;
  return width + tracking * Math.max(0, chars.length - 1);
};

const measureStyled = (ctx: CanvasRenderingContext2D, style: TextStyle, text: string): number => {
  ctx.font = style.font;
  return measureTracked(ctx, text, style.tracking ?? 0);
};

const wrapText = (
  ctx: CanvasRenderingContext2D,
  style: TextStyle,
  text: string,
  maxWidth: number,
): string[] => {
  ctx.font = style.font;
  const tracking = style.tracking ?? 0;
  const widthOf = (value: string): number => measureTracked(ctx, value, tracking);
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
    // An empty paragraph is a deliberate blank line; keep it so authored spacing survives.
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (line !== '' && widthOf(candidate) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
      // A single unbreakable token (long reference codes, URLs) is split character by character.
      while (widthOf(line) > maxWidth && Array.from(line).length > 1) {
        const chars = Array.from(line);
        let cut = chars.length - 1;
        while (cut > 1 && widthOf(chars.slice(0, cut).join('')) > maxWidth) cut -= 1;
        lines.push(chars.slice(0, cut).join(''));
        line = chars.slice(cut).join('');
      }
    }
    if (line !== '') lines.push(line);
  }

  return lines;
};

const paintText = (p: Painter, text: string, x: number, y: number, style: TextStyle): void => {
  if (!p.drawing || text === '') return;
  const { ctx } = p;
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.textBaseline = style.baseline ?? 'top';

  const tracking = style.tracking ?? 0;
  if (tracking === 0) {
    ctx.textAlign = style.align ?? 'left';
    ctx.fillText(text, x, y);
    return;
  }

  // Letter spacing is applied by hand: ctx.letterSpacing is not universally supported and the
  // measure pass has to agree with the paint pass to the pixel.
  const width = measureTracked(ctx, text, tracking);
  const align = style.align ?? 'left';
  const startX = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  ctx.textAlign = 'left';
  let cursor = startX;
  for (const char of Array.from(text)) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
};

const paintLines = (
  p: Painter,
  lines: string[],
  x: number,
  y: number,
  style: TextStyle,
): number => {
  lines.forEach((line, index) => paintText(p, line, x, y + index * style.lineHeight, style));
  return lines.length * style.lineHeight;
};

const paintParagraph = (
  p: Painter,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  style: TextStyle,
): number => paintLines(p, wrapText(p.ctx, style, text, maxWidth), x, y, style);

const traceRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void => {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const paintRect = (
  p: Painter,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  radius = 0,
): void => {
  if (!p.drawing || w <= 0 || h <= 0) return;
  const { ctx } = p;
  ctx.fillStyle = fill;
  if (radius <= 0) {
    ctx.fillRect(x, y, w, h);
    return;
  }
  traceRoundedRect(ctx, x, y, w, h, radius);
  ctx.fill();
};

const paintDot = (p: Painter, cx: number, cy: number, radius: number, fill: string): void => {
  if (!p.drawing) return;
  const { ctx } = p;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
};

const initialsOf = (name: string): string => {
  const letters = name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0))
    .join('')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase();
  return letters === '' ? '•' : letters;
};

const paintLogo = (
  p: Painter,
  logo: HTMLImageElement | null,
  companyName: string,
  x: number,
  y: number,
): void => {
  if (!logo) {
    paintRect(p, x, y, LOGO_BOX, LOGO_BOX, COLOR.blue700, 16);
    paintText(p, initialsOf(companyName), x + LOGO_BOX / 2, y + LOGO_BOX / 2 + 1, STYLE.initials);
    return;
  }
  // A white plate keeps transparent logos legible against the navy header band.
  paintRect(p, x, y, LOGO_BOX, LOGO_BOX, COLOR.white, 16);
  const inner = LOGO_BOX - 18;
  const fit = Math.min(inner / logo.naturalWidth, inner / logo.naturalHeight);
  const w = logo.naturalWidth * fit;
  const h = logo.naturalHeight * fit;
  if (!p.drawing) return;
  p.ctx.drawImage(logo, x + (LOGO_BOX - w) / 2, y + (LOGO_BOX - h) / 2, w, h);
};

const highlightColumns = (count: number): number => {
  if (count <= 3) return Math.max(1, count);
  if (count === 4) return 2;
  return 3;
};

const paintMetaColumn = (
  p: Painter,
  rows: DocumentMetaRow[],
  x: number,
  top: number,
  width: number,
): number => {
  let y = top;
  rows.forEach((row, index) => {
    if (index > 0) y += META_ROW_GAP;
    y += paintParagraph(p, row.label.toUpperCase(), x, y, width, STYLE.metaLabel);
    y += 2;
    y += paintParagraph(p, row.value, x, y, width, STYLE.metaValue);
  });
  return y - top;
};

const amountColumnWidth = (
  ctx: CanvasRenderingContext2D,
  model: QuotationDocumentModel,
): number => {
  // Only the item amounts are painted in this column; the total lives in its own bar below, so
  // seeding from the larger total string would shrink the label column for nothing.
  let widest = 0;
  for (const item of model.lineItems) {
    widest = Math.max(widest, measureStyled(ctx, STYLE.itemAmount, item.amount));
  }
  return Math.min(Math.max(widest + 8, 120), CONTENT_WIDTH * 0.45);
};

/** Lays out the whole document and returns the page height in logical pixels. */
const layoutDocument = (
  p: Painter,
  model: QuotationDocumentModel,
  logo: HTMLImageElement | null,
): number => {
  const { ctx } = p;
  const right = WIDTH - MARGIN;

  // 1. Header band -----------------------------------------------------------------
  const brandX = MARGIN + LOGO_BOX + 22;
  const brandWidth = CONTENT_WIDTH - LOGO_BOX - 22 - CONTACT_WIDTH - 28;
  const nameLines = wrapText(ctx, STYLE.companyName, model.company.name, brandWidth);
  const taglineLines = model.company.tagline
    ? wrapText(ctx, STYLE.tagline, model.company.tagline, brandWidth)
    : [];
  const phoneLines = wrapText(ctx, STYLE.phone, model.company.phone, CONTACT_WIDTH);
  const addressLines = wrapText(ctx, STYLE.address, model.company.address, CONTACT_WIDTH);

  const brandHeight =
    nameLines.length * STYLE.companyName.lineHeight +
    (taglineLines.length > 0 ? 5 + taglineLines.length * STYLE.tagline.lineHeight : 0);
  const contactHeight =
    phoneLines.length * STYLE.phone.lineHeight +
    (addressLines.length > 0 ? 3 + addressLines.length * STYLE.address.lineHeight : 0);
  const bandHeight = HEADER_PAD * 2 + Math.max(LOGO_BOX, brandHeight, contactHeight);

  paintRect(p, 0, 0, WIDTH, bandHeight, COLOR.navy950);
  paintRect(p, 0, bandHeight, WIDTH, ACCENT_HEIGHT, COLOR.blue500);
  paintLogo(p, logo, model.company.name, MARGIN, (bandHeight - LOGO_BOX) / 2);

  let brandY = (bandHeight - brandHeight) / 2;
  brandY += paintLines(p, nameLines, brandX, brandY, STYLE.companyName);
  paintLines(p, taglineLines, brandX, brandY + 5, STYLE.tagline);

  let contactY = (bandHeight - contactHeight) / 2;
  contactY += paintLines(p, phoneLines, right, contactY, STYLE.phone);
  paintLines(p, addressLines, right, contactY + 3, STYLE.address);

  let y = bandHeight + ACCENT_HEIGHT + 36;

  // 2. Title, with the quotation number as a pill on the same line -------------------
  const badgeLabel = model.quotationNumber.trim();
  // Clamped to the content box: the stacked branch below exists to handle long references, so it
  // must not itself be able to run past the right margin.
  const badgeWidth =
    badgeLabel === ''
      ? 0
      : Math.min(measureStyled(ctx, STYLE.badge, badgeLabel) + BADGE_PAD_X * 2, CONTENT_WIDTH);
  // An unusually long reference gets its own line instead of squeezing the title column.
  const badgeInline = badgeWidth > 0 && badgeWidth <= CONTENT_WIDTH * 0.4;
  if (badgeWidth > 0 && !badgeInline) {
    const badgeLines = wrapText(ctx, STYLE.badge, badgeLabel, CONTENT_WIDTH - BADGE_PAD_X * 2);
    const stackedHeight = Math.max(BADGE_HEIGHT, badgeLines.length * STYLE.badge.lineHeight + 12);
    paintRect(p, MARGIN, y, badgeWidth, stackedHeight, COLOR.cyan100, BADGE_HEIGHT / 2);
    badgeLines.forEach((line, index) => {
      paintText(
        p,
        line,
        MARGIN + BADGE_PAD_X,
        y +
          stackedHeight / 2 -
          ((badgeLines.length - 1) * STYLE.badge.lineHeight) / 2 +
          index * STYLE.badge.lineHeight,
        STYLE.badge,
      );
    });
    y += stackedHeight + 16;
  } else if (badgeInline) {
    const badgeY = y + (STYLE.title.lineHeight - BADGE_HEIGHT) / 2;
    const badgeX = right - badgeWidth;
    paintRect(p, badgeX, badgeY, badgeWidth, BADGE_HEIGHT, COLOR.cyan100, BADGE_HEIGHT / 2);
    paintText(p, badgeLabel, badgeX + BADGE_PAD_X, badgeY + BADGE_HEIGHT / 2, STYLE.badge);
  }
  const titleWidth = badgeInline ? CONTENT_WIDTH - badgeWidth - 28 : CONTENT_WIDTH;
  y += paintParagraph(p, model.title, MARGIN, y, titleWidth, STYLE.title);
  y += 26;

  // 3. Two-column meta block ---------------------------------------------------------
  const columnWidth = (CONTENT_WIDTH - META_COLUMN_GAP) / 2;
  const leftHeight = paintMetaColumn(p, model.metaLeft, MARGIN, y, columnWidth);
  const rightX = MARGIN + columnWidth + META_COLUMN_GAP;
  const rightHeight = paintMetaColumn(p, model.metaRight, rightX, y, columnWidth);
  const metaHeight = Math.max(leftHeight, rightHeight);
  y += metaHeight > 0 ? metaHeight + 28 : 0;

  // 4. Highlights strip --------------------------------------------------------------
  if (model.highlights.length > 0) {
    paintRect(p, MARGIN, y, CONTENT_WIDTH, 1, COLOR.border);
    y += 17;
    const columns = highlightColumns(model.highlights.length);
    const cellWidth = CONTENT_WIDTH / columns;
    const stripTop = y;
    let rowTop = y;
    let rowHeight = 0;
    model.highlights.forEach((item, index) => {
      const column = index % columns;
      if (column === 0 && index > 0) {
        rowTop += rowHeight + 18;
        rowHeight = 0;
      }
      const padLeft = column === 0 ? 0 : 20;
      const cellX = MARGIN + column * cellWidth + padLeft;
      const innerWidth = cellWidth - padLeft - 20;
      const label = item.label.toUpperCase();
      let cellY = rowTop;
      cellY += paintParagraph(p, label, cellX, cellY, innerWidth, STYLE.highlightLabel);
      cellY += 4;
      cellY += paintParagraph(p, item.value, cellX, cellY, innerWidth, STYLE.highlightValue);
      rowHeight = Math.max(rowHeight, cellY - rowTop);
    });
    const stripBottom = rowTop + rowHeight;
    const stripHeight = stripBottom - stripTop;
    for (let column = 1; column < columns; column += 1) {
      paintRect(p, MARGIN + column * cellWidth - 0.5, stripTop, 1, stripHeight, COLOR.border);
    }
    y = stripBottom + 16;
    paintRect(p, MARGIN, y, CONTENT_WIDTH, 1, COLOR.border);
    y += 29;
  }

  // 5. Scope heading and line-item table ---------------------------------------------
  const scopeHeading = model.scopeHeading.toUpperCase();
  y += paintParagraph(p, scopeHeading, MARGIN, y, CONTENT_WIDTH, STYLE.sectionHeading);
  y += 12;
  paintRect(p, MARGIN, y, CONTENT_WIDTH, 1.5, COLOR.navy900);
  y += 1.5;

  const amountWidth = amountColumnWidth(ctx, model);
  const labelWidth = CONTENT_WIDTH - amountWidth - 28;
  model.lineItems.forEach((item, index) => {
    y += ROW_PAD;
    const labelHeight = paintParagraph(p, item.label, MARGIN, y, labelWidth, STYLE.itemLabel);
    paintText(p, item.amount, right, y, STYLE.itemAmount);
    y += Math.max(labelHeight, STYLE.itemAmount.lineHeight) + ROW_PAD;
    if (index < model.lineItems.length - 1) {
      paintRect(p, MARGIN, y, CONTENT_WIDTH, 1, COLOR.border);
      y += 1;
    }
  });

  y += 14;
  // The amount is measured first and the label is given only the space that remains, so a long
  // label can never overprint the single most important number on the document.
  const totalAmountWidth = measureStyled(ctx, STYLE.totalAmount, model.totalAmount);
  const totalLabelWidth = Math.max(80, CONTENT_WIDTH - 48 - totalAmountWidth - 24);
  const totalLabelLines = wrapText(
    ctx,
    STYLE.totalLabel,
    model.totalLabel.toUpperCase(),
    totalLabelWidth,
  );
  const totalHeight = Math.max(
    TOTAL_HEIGHT,
    totalLabelLines.length * STYLE.totalLabel.lineHeight + 24,
  );
  paintRect(p, MARGIN, y, CONTENT_WIDTH, totalHeight, COLOR.navy950, 12);
  totalLabelLines.forEach((line, index) => {
    paintText(
      p,
      line,
      MARGIN + 24,
      y +
        totalHeight / 2 -
        ((totalLabelLines.length - 1) * STYLE.totalLabel.lineHeight) / 2 +
        index * STYLE.totalLabel.lineHeight,
      STYLE.totalLabel,
    );
  });
  paintText(p, model.totalAmount, right - 24, y + totalHeight / 2, STYLE.totalAmount);
  y += totalHeight + 30;

  // 6. Notes -------------------------------------------------------------------------
  const notes = model.notes.filter((note) => note.trim().length > 0);
  if (notes.length > 0) {
    for (const note of notes) {
      paintDot(p, MARGIN + 4, y + 8, 2.5, COLOR.blue500);
      y += paintParagraph(p, note, MARGIN + 18, y, CONTENT_WIDTH - 18, STYLE.note);
      y += 8;
    }
    y += 14;
  }

  // 7. Disclaimer box ----------------------------------------------------------------
  const boxPad = 20;
  const boxInner = CONTENT_WIDTH - boxPad * 2;
  const disclaimerLabelLines = wrapText(
    ctx,
    STYLE.disclaimerLabel,
    model.disclaimerLabel.toUpperCase(),
    boxInner,
  );
  const disclaimerLines = wrapText(ctx, STYLE.disclaimerBody, model.disclaimer, boxInner);
  const labelHeight = disclaimerLabelLines.length * STYLE.disclaimerLabel.lineHeight;
  const bodyHeight = disclaimerLines.length * STYLE.disclaimerBody.lineHeight;
  if (labelHeight + bodyHeight > 0) {
    const gap = labelHeight > 0 && bodyHeight > 0 ? 8 : 0;
    const boxHeight = boxPad * 2 + labelHeight + gap + bodyHeight;
    paintRect(p, MARGIN, y, CONTENT_WIDTH, boxHeight, COLOR.cyan100, 14);
    const textX = MARGIN + boxPad;
    let boxY = y + boxPad;
    boxY += paintLines(p, disclaimerLabelLines, textX, boxY, STYLE.disclaimerLabel);
    paintLines(p, disclaimerLines, textX, boxY + gap, STYLE.disclaimerBody);
    y += boxHeight + 22;
  }

  // 8. Footnote ----------------------------------------------------------------------
  y += paintParagraph(p, model.footnote, MARGIN, y, CONTENT_WIDTH, STYLE.footnote);

  y += 30;
  // The page height is rounded up first and the bar stretched to meet it, so the rounding
  // remainder cannot leave a white sliver along the bottom edge of the exported image.
  const pageHeight = Math.ceil(y + FOOTER_BAR);
  paintRect(p, 0, y, WIDTH, pageHeight - y, COLOR.navy975);
  return pageHeight;
};

const loadLogo = async (dataUrl: string | null): Promise<HTMLImageElement | null> => {
  if (!dataUrl) return null;
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null;
  } catch {
    // A broken logo must never fail the document; the initials block takes over.
    return null;
  }
};

const createContext = (width: number, height: number): CanvasRenderingContext2D => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable, so the quotation PNG cannot be rendered.');
  return ctx;
};

export const renderQuotationPng: QuotationDocumentRenderer = async (
  model: QuotationDocumentModel,
  assets: DocumentAssets,
): Promise<Blob> => {
  const logo = await loadLogo(assets.logoDataUrl);

  const measureCtx = createContext(8, 8);
  const height = layoutDocument({ ctx: measureCtx, drawing: false }, model, logo);

  // Browsers cap canvas dimensions (16384px per side, and about 16.7 Mpx of area on iOS). Past
  // those limits getContext still succeeds but drawing silently degrades, so a very long
  // quotation is exported at 1x rather than as a blank image.
  const maxSide = 16384;
  const maxArea = 16_777_216;
  const scale = height * SCALE > maxSide || WIDTH * SCALE * height * SCALE > maxArea ? 1 : SCALE;

  const ctx = createContext(WIDTH * scale, height * scale);
  ctx.scale(scale, scale);
  ctx.imageSmoothingQuality = 'high';
  // Messaging apps composite transparency onto black, so the page gets an explicit white fill.
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(0, 0, WIDTH, height);
  layoutDocument({ ctx, drawing: true }, model, logo);

  return new Promise<Blob>((resolve, reject) => {
    ctx.canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null, so the quotation PNG was not encoded.'));
    }, 'image/png');
  });
};
