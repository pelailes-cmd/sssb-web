import type { DocumentAssets, QuotationDocumentRenderer } from './types';

/**
 * Minimal PDF 1.4 writer for quotation documents.
 *
 * It uses the base-14 Helvetica faces, so no font data has to be embedded, and builds the file as
 * raw byte chunks while tracking offsets for a correct cross-reference table.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const NAVY: RGB = [0.024, 0.106, 0.192];
const INK: RGB = [0.039, 0.125, 0.208];
const TEXT: RGB = [0.141, 0.243, 0.329];
const MUTED: RGB = [0.376, 0.467, 0.541];
const BORDER: RGB = [0.851, 0.898, 0.925];
const TINT: RGB = [0.874, 0.968, 0.984];
const SOLAR: RGB = [0.945, 0.913, 0.18];
const WHITE: RGB = [1, 1, 1];
const DISCLAIMER_BG: RGB = [1, 0.992, 0.941];

type RGB = [number, number, number];

/**
 * Adobe Core-14 advance widths (units of 1/1000 em) for printable ASCII, indexed from code 32.
 * They drive every wrap and right-alignment decision, so they are transcribed rather than guessed.
 */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Characters outside ASCII that WinAnsi can represent, with their advance widths. */
const WIN_ANSI_EXTRAS: Record<string, { code: number; width: number; boldWidth: number }> = {
  '–': { code: 0x96, width: 556, boldWidth: 556 },
  '—': { code: 0x97, width: 1000, boldWidth: 1000 },
  '‘': { code: 0x91, width: 222, boldWidth: 278 },
  '’': { code: 0x92, width: 222, boldWidth: 278 },
  '“': { code: 0x93, width: 333, boldWidth: 500 },
  '”': { code: 0x94, width: 333, boldWidth: 500 },
  '•': { code: 0x95, width: 350, boldWidth: 350 },
  '…': { code: 0x85, width: 1000, boldWidth: 1000 },
  '°': { code: 0xb0, width: 400, boldWidth: 400 },
  '²': { code: 0xb2, width: 333, boldWidth: 333 },
  '×': { code: 0xd7, width: 584, boldWidth: 584 },
  '·': { code: 0xb7, width: 278, boldWidth: 278 },
};

const PESO = '₱';
/** The peso sign has no WinAnsi code point, so it is drawn as a P with two struck bars. */
const PESO_WIDTH = 667;

function charWidth(char: string, bold: boolean): number {
  if (char === PESO) return PESO_WIDTH;
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 126) {
    return (bold ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS)[code - 32];
  }
  const extra = WIN_ANSI_EXTRAS[char];
  if (extra) return bold ? extra.boldWidth : extra.width;
  return bold ? HELVETICA_BOLD_WIDTHS[31] : HELVETICA_WIDTHS[31];
}

function measure(text: string, bold: boolean, size: number): number {
  let total = 0;
  for (const char of text) total += charWidth(char, bold);
  return (total * size) / 1000;
}

/** Maps a string onto WinAnsi bytes, escaping the three characters PDF strings reserve. */
function pdfString(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    let byte: number;
    if (code >= 32 && code <= 126) byte = code;
    else if (WIN_ANSI_EXTRAS[char]) byte = WIN_ANSI_EXTRAS[char].code;
    else if (char === '\t') byte = 32;
    else continue;

    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
    else if (byte < 32) out += ' ';
    else out += String.fromCharCode(byte);
  }
  return out;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

function wrap(text: string, bold: boolean, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate, bold, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

type TextStyle = {
  size: number;
  bold?: boolean;
  color?: RGB;
};

/** One page's content-stream operators, plus the marker for whether the logo was used. */
class Page {
  readonly ops: string[] = [];
  usesImage = false;

  fill(color: RGB) {
    this.ops.push(`${round(color[0])} ${round(color[1])} ${round(color[2])} rg`);
  }

  rect(x: number, y: number, width: number, height: number, color: RGB) {
    this.fill(color);
    this.ops.push(`${round(x)} ${round(y)} ${round(width)} ${round(height)} re f`);
  }

  /** Draws a run at the PDF baseline, splitting out any peso signs so they can be stroked. */
  text(x: number, baseline: number, value: string, style: TextStyle) {
    const bold = Boolean(style.bold);
    const font = bold ? '/F2' : '/F1';
    const color = style.color ?? TEXT;
    const segments = value.split(PESO);
    let cursor = x;

    segments.forEach((segment, index) => {
      if (segment) {
        this.fill(color);
        this.ops.push(
          `BT ${font} ${round(style.size)} Tf ${round(cursor)} ${round(baseline)} Td (${pdfString(segment)}) Tj ET`,
        );
        cursor += measure(segment, bold, style.size);
      }
      // Each gap between two segments is where a peso sign was removed by the split.
      if (index < segments.length - 1) {
        this.peso(cursor, baseline, style.size, color);
        cursor += (PESO_WIDTH * style.size) / 1000;
      }
    });
  }

  private peso(x: number, baseline: number, size: number, color: RGB) {
    this.fill(color);
    this.ops.push(`BT /F2 ${round(size)} Tf ${round(x)} ${round(baseline)} Td (P) Tj ET`);
    const barHeight = size * 0.055;
    const left = x + size * 0.02;
    const width = size * 0.58;
    this.ops.push(
      `${round(left)} ${round(baseline + size * 0.3)} ${round(width)} ${round(barHeight)} re f`,
    );
    this.ops.push(
      `${round(left)} ${round(baseline + size * 0.46)} ${round(width)} ${round(barHeight)} re f`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, color: RGB, width = 0.6) {
    this.ops.push(`${round(color[0])} ${round(color[1])} ${round(color[2])} RG`);
    this.ops.push(`${round(width)} w`);
    this.ops.push(`${round(x1)} ${round(y1)} m ${round(x2)} ${round(y2)} l S`);
  }

  image(x: number, y: number, width: number, height: number) {
    this.usesImage = true;
    this.ops.push(`q ${round(width)} 0 0 ${round(height)} ${round(x)} ${round(y)} cm /Im0 Do Q`);
  }
}

type LogoImage = { bytes: Uint8Array; width: number; height: number };

/**
 * Re-encodes the PNG logo as a JPEG so it can be embedded with the DCTDecode filter, which needs
 * no compression code of our own. JPEG has no alpha, so the navy header colour is painted behind
 * the mark first.
 */
async function loadLogo(assets: DocumentAssets): Promise<LogoImage | null> {
  if (!assets.logoDataUrl) return null;
  try {
    const image = new Image();
    image.src = assets.logoDataUrl;
    await image.decode();

    const width = image.naturalWidth || 256;
    const height = image.naturalHeight || 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.fillStyle = '#061b31';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, width, height };
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();

function concatBytes(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export const renderQuotationPdf: QuotationDocumentRenderer = async (model, assets) => {
  const logo = await loadLogo(assets);

  const pages: Page[] = [];
  let page = new Page();
  let cursor = PAGE_HEIGHT - MARGIN;
  pages.push(page);

  const newPage = () => {
    page = new Page();
    pages.push(page);
    cursor = PAGE_HEIGHT - MARGIN;
  };

  const ensure = (needed: number) => {
    if (cursor - needed < MARGIN + 46) newPage();
  };

  const paragraph = (
    text: string,
    style: TextStyle,
    lineHeight: number,
    x = MARGIN,
    maxWidth = CONTENT_WIDTH,
  ) => {
    for (const line of wrap(text, Boolean(style.bold), style.size, maxWidth)) {
      ensure(lineHeight);
      cursor -= lineHeight;
      if (line) page.text(x, cursor, line, style);
    }
  };

  // ---- Header band -------------------------------------------------------------------------
  const bandHeight = 96;
  page.rect(0, PAGE_HEIGHT - bandHeight, PAGE_WIDTH, bandHeight, NAVY);

  let headerTextX = MARGIN;
  if (logo) {
    const logoHeight = 52;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    page.image(MARGIN, PAGE_HEIGHT - bandHeight / 2 - logoHeight / 2, logoWidth, logoHeight);
    headerTextX = MARGIN + logoWidth + 16;
  }

  page.text(headerTextX, PAGE_HEIGHT - 44, model.company.name, {
    size: 16,
    bold: true,
    color: WHITE,
  });
  if (model.company.tagline) {
    page.text(headerTextX, PAGE_HEIGHT - 60, model.company.tagline, {
      size: 8.5,
      color: SOLAR,
    });
  }
  const contact = `${model.company.phone}  ·  ${model.company.address}`;
  page.text(headerTextX, PAGE_HEIGHT - 76, contact, { size: 8, color: [0.75, 0.85, 0.92] });

  cursor = PAGE_HEIGHT - bandHeight - 34;

  // ---- Title -------------------------------------------------------------------------------
  page.text(MARGIN, cursor, model.title, { size: 15, bold: true, color: INK });
  cursor -= 12;
  page.rect(MARGIN, cursor, 64, 2.5, SOLAR);
  cursor -= 24;

  // ---- Meta columns ------------------------------------------------------------------------
  const columnWidth = (CONTENT_WIDTH - 24) / 2;
  const metaTop = cursor;

  const metaColumn = (
    rows: Array<{ label: string; value: string }>,
    x: number,
    startY: number,
  ): number => {
    let y = startY;
    for (const row of rows) {
      y -= 11;
      page.text(x, y, row.label.toUpperCase(), { size: 7, bold: true, color: MUTED });
      for (const line of wrap(row.value, false, 9.5, columnWidth)) {
        y -= 12;
        page.text(x, y, line, { size: 9.5, color: INK });
      }
      y -= 6;
    }
    return y;
  };

  const leftCursor = metaColumn(model.metaLeft, MARGIN, metaTop);
  const rightCursor = metaColumn(model.metaRight, MARGIN + columnWidth + 24, metaTop);
  cursor = Math.min(leftCursor, rightCursor) - 10;

  // ---- Highlights --------------------------------------------------------------------------
  if (model.highlights.length) {
    const boxHeight = 34;
    ensure(boxHeight + 12);
    cursor -= boxHeight;
    page.rect(MARGIN, cursor, CONTENT_WIDTH, boxHeight, TINT);
    const cellWidth = CONTENT_WIDTH / model.highlights.length;
    model.highlights.forEach((highlight, index) => {
      const x = MARGIN + cellWidth * index + 12;
      page.text(x, cursor + boxHeight - 13, highlight.label.toUpperCase(), {
        size: 6.5,
        bold: true,
        color: MUTED,
      });
      page.text(x, cursor + 10, highlight.value, { size: 10, bold: true, color: INK });
    });
    cursor -= 22;
  }

  // ---- Scope table -------------------------------------------------------------------------
  const amountColumn = Math.max(
    110,
    ...model.lineItems.map((item) => measure(item.amount, true, 10) + 16),
  );
  const labelColumn = CONTENT_WIDTH - amountColumn - 16;
  const rowPadding = 8;

  const tableHeader = () => {
    ensure(30);
    cursor -= 20;
    page.rect(MARGIN, cursor, CONTENT_WIDTH, 20, TINT);
    page.text(MARGIN + 10, cursor + 6.5, 'DESCRIPTION', { size: 7, bold: true, color: MUTED });
    const label = 'ESTIMATED AMOUNT';
    page.text(MARGIN + CONTENT_WIDTH - 10 - measure(label, true, 7), cursor + 6.5, label, {
      size: 7,
      bold: true,
      color: MUTED,
    });
  };

  ensure(46);
  page.text(MARGIN, cursor, model.scopeHeading, { size: 11, bold: true, color: INK });
  cursor -= 12;
  tableHeader();

  for (const item of model.lineItems) {
    const lines = wrap(item.label, false, 9.5, labelColumn);
    const rowHeight = lines.length * 12 + rowPadding * 2;
    if (cursor - rowHeight < MARGIN + 46) {
      newPage();
      tableHeader();
    }
    cursor -= rowHeight;
    page.line(MARGIN, cursor, MARGIN + CONTENT_WIDTH, cursor, BORDER, 0.5);
    lines.forEach((line, index) => {
      page.text(MARGIN + 10, cursor + rowHeight - rowPadding - 9.5 - index * 12, line, {
        size: 9.5,
        color: TEXT,
      });
    });
    page.text(
      MARGIN + CONTENT_WIDTH - 10 - measure(item.amount, false, 9.5),
      cursor + rowHeight - rowPadding - 9.5,
      item.amount,
      { size: 9.5, color: INK },
    );
  }

  // Total row: the amount is measured first so a long label can never overprint it.
  const totalHeight = 30;
  if (cursor - totalHeight < MARGIN + 46) newPage();
  cursor -= totalHeight;
  page.rect(MARGIN, cursor, CONTENT_WIDTH, totalHeight, NAVY);
  const totalAmountWidth = measure(model.totalAmount, true, 12);
  const totalLabelMax = CONTENT_WIDTH - 20 - totalAmountWidth - 16;
  const totalLabel = wrap(model.totalLabel.toUpperCase(), true, 9, totalLabelMax)[0] ?? '';
  page.text(MARGIN + 10, cursor + 11, totalLabel, { size: 9, bold: true, color: SOLAR });
  page.text(MARGIN + CONTENT_WIDTH - 10 - totalAmountWidth, cursor + 9, model.totalAmount, {
    size: 12,
    bold: true,
    color: WHITE,
  });
  cursor -= 22;

  // ---- Notes -------------------------------------------------------------------------------
  for (const note of model.notes) {
    const lines = wrap(note, false, 8.5, CONTENT_WIDTH - 14);
    ensure(lines.length * 11 + 4);
    lines.forEach((line, index) => {
      cursor -= 11;
      if (index === 0) page.text(MARGIN, cursor, '•', { size: 8.5, color: MUTED });
      page.text(MARGIN + 14, cursor, line, { size: 8.5, color: MUTED });
    });
    cursor -= 3;
  }
  if (model.notes.length) cursor -= 8;

  // ---- Disclaimer --------------------------------------------------------------------------
  const disclaimerLines = wrap(model.disclaimer, false, 8, CONTENT_WIDTH - 28);
  const disclaimerHeight = disclaimerLines.length * 10.5 + 30;
  if (cursor - disclaimerHeight < MARGIN + 46) newPage();
  cursor -= disclaimerHeight;
  page.rect(MARGIN, cursor, CONTENT_WIDTH, disclaimerHeight, DISCLAIMER_BG);
  page.rect(MARGIN, cursor, 3, disclaimerHeight, SOLAR);
  page.text(MARGIN + 14, cursor + disclaimerHeight - 14, model.disclaimerLabel.toUpperCase(), {
    size: 7,
    bold: true,
    color: INK,
  });
  disclaimerLines.forEach((line, index) => {
    page.text(MARGIN + 14, cursor + disclaimerHeight - 28 - index * 10.5, line, {
      size: 8,
      color: TEXT,
    });
  });
  cursor -= 16;

  paragraph(model.footnote, { size: 7, color: MUTED }, 9);

  // ---- Page furniture ----------------------------------------------------------------------
  pages.forEach((entry, index) => {
    entry.line(MARGIN, MARGIN + 22, PAGE_WIDTH - MARGIN, MARGIN + 22, BORDER, 0.5);
    const label = `Page ${index + 1} of ${pages.length}`;
    entry.text(PAGE_WIDTH - MARGIN - measure(label, false, 7.5), MARGIN + 10, label, {
      size: 7.5,
      color: MUTED,
    });
    entry.text(MARGIN, MARGIN + 10, model.quotationNumber, { size: 7.5, color: MUTED });
  });

  // ---- Serialize ---------------------------------------------------------------------------
  const objects: Uint8Array[] = [];
  const addObject = (body: Uint8Array) => {
    objects.push(body);
    return objects.length; // 1-based object number
  };
  const addTextObject = (body: string) => addObject(encoder.encode(body));

  const pageObjectNumbers: number[] = [];
  const contentNumbers: number[] = [];

  // Reserve 1 = catalog, 2 = pages tree.
  addTextObject('');
  addTextObject('');
  const fontRegular = addTextObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const fontBold = addTextObject(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  let imageNumber = 0;
  if (logo) {
    const header = encoder.encode(
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n`,
    );
    imageNumber = addObject(concatBytes([header, logo.bytes, encoder.encode('\nendstream')]));
  }

  for (const entry of pages) {
    const stream = entry.ops.join('\n');
    const contentNumber = addTextObject(
      `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`,
    );
    contentNumbers.push(contentNumber);
    const resources =
      imageNumber && entry.usesImage
        ? `<< /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> /XObject << /Im0 ${imageNumber} 0 R >> >>`
        : `<< /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >>`;
    pageObjectNumbers.push(
      addTextObject(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
          `/Resources ${resources} /Contents ${contentNumber} 0 R >>`,
      ),
    );
  }

  objects[0] = encoder.encode('<< /Type /Catalog /Pages 2 0 R >>');
  objects[1] = encoder.encode(
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>`,
  );

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  push(encoder.encode('%PDF-1.4\n'));
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(offset);
    push(encoder.encode(`${index + 1} 0 obj\n`));
    push(body);
    push(encoder.encode('\nendobj\n'));
  });

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const entryOffset of offsets) {
    xref += `${String(entryOffset).padStart(10, '0')} 00000 n \n`;
  }
  push(encoder.encode(xref));
  push(
    encoder.encode(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );

  return new Blob([concatBytes(chunks)], { type: 'application/pdf' });
};
