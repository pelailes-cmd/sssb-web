/**
 * WordprocessingML (.docx) renderer for the quotation document.
 *
 * The package is assembled by hand: every part is a UTF-8 XML string, the logo is embedded as
 * a real inline DrawingML picture, and the whole thing is stored (uncompressed) into a ZIP by
 * `createZip`. The output is a genuine Word document — paragraphs, styles and a real table —
 * so the client can edit it, not a picture of a quotation.
 *
 * Measurements: Word counts most lengths in twips (1/20 pt, 1440 per inch), font sizes in
 * half-points, and DrawingML extents in EMU (914400 per inch).
 */

import type { DocumentMetaRow, QuotationDocumentModel, QuotationDocumentRenderer } from './types';
import { createZip, type ZipEntry } from './zip';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** A4 portrait with 20mm margins: 11906 x 16838 twips, 1134 twip margins. */
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const PAGE_MARGIN = 1134;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const EMU_PER_PIXEL = 9525; // 96dpi pixel
const EMU_PER_POINT = 12700;
/** Geometry of the header cell that holds the logo, in twips. */
const MARK_CELL_WIDTH = 2400;
const MARK_CELL_MARGIN = 150;
/** Derived from the cell so a wide wordmark can never overflow it under a fixed table layout. */
const MAX_LOGO_WIDTH_PT = (MARK_CELL_WIDTH - MARK_CELL_MARGIN * 2) / 20;
const MAX_LOGO_HEIGHT_PT = 54;

const COLOR = {
  navy950: '061B31',
  navy900: '082F55',
  blue700: '0768B2',
  blue500: '18A2E3',
  cyan300: '78D9E9',
  cyan100: 'DFF7FB',
  solar: 'F1E92E',
  ink: '0A2035',
  text: '243E54',
  muted: '60778A',
  border: 'D9E5EC',
  white: 'FFFFFF',
} as const;

const NS_WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_DRAWING_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const NS_DRAWING_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_DRAWING_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const NS_PACKAGE_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CONTENT_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';

const REL_TYPE_DOCUMENT = `${NS_REL}/officeDocument`;
const REL_TYPE_STYLES = `${NS_REL}/styles`;
const REL_TYPE_IMAGE = `${NS_REL}/image`;

const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const STYLES_REL_ID = 'rId1';
const LOGO_REL_ID = 'rId2';

/* ------------------------------------------------------------------ XML primitives */

/**
 * Keeps only what the XML 1.0 Char production allows. This is a whitelist rather than a control
 * character blacklist because U+FFFE, U+FFFF and lone surrogates are equally illegal, and a single
 * one of them anywhere in the client's own text makes Word refuse to open the whole document.
 */
const stripControl = (value: string): string => {
  let output = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff)
    ) {
      output += char;
    }
  }
  return output;
};

const esc = (value: string): string =>
  stripControl(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** A text run; hard line breaks in the source text become real `w:br` breaks. */
const run = (text: string): string => {
  const segments = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(
      (line, index) => `${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(line)}</w:t>`,
    );
  return `<w:r>${segments.join('')}</w:r>`;
};

const paragraph = (styleId: string, text?: string): string =>
  `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>${text ? run(text) : ''}</w:p>`;

/** Bulleted note: the glyph and a tab stop keep the list editable without a numbering part. */
const bullet = (text: string): string =>
  `<w:p><w:pPr><w:pStyle w:val="NoteItem"/></w:pPr>` +
  `<w:r><w:t>•</w:t><w:tab/></w:r>${run(text)}</w:p>`;

const SPACER = paragraph('Spacer');

const shading = (fill: string): string => `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;

const edge = (side: string, size: number, color: string): string =>
  `<w:${side} w:val="single" w:sz="${size}" w:space="0" w:color="${color}"/>`;

/** Child order inside w:tblBorders is fixed: top, left, bottom, right, insideH, insideV. */
const BORDERS_ITEMS =
  `<w:tblBorders>${edge('top', 8, COLOR.navy900)}${edge('bottom', 8, COLOR.navy900)}` +
  `${edge('insideH', 4, COLOR.border)}</w:tblBorders>`;

const BORDERS_TINTED =
  `<w:tblBorders>${edge('top', 4, COLOR.cyan300)}${edge('left', 4, COLOR.cyan300)}` +
  `${edge('bottom', 4, COLOR.cyan300)}${edge('right', 4, COLOR.cyan300)}` +
  `${edge('insideV', 4, COLOR.cyan300)}</w:tblBorders>`;

type CellOptions = {
  fill?: string;
  vAlign?: 'top' | 'center';
};

const cell = (width: number, content: string, options: CellOptions = {}): string =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
  `${options.fill ? shading(options.fill) : ''}` +
  `<w:vAlign w:val="${options.vAlign ?? 'top'}"/></w:tcPr>${content}</w:tc>`;

/** `repeatAsHeader` re-prints the row at the top of each page the table spills onto. */
const tableRow = (cells: string[], minHeight?: number, repeatAsHeader = false): string => {
  // CT_TrPrBase orders trHeight before tblHeader; swapping them makes the file invalid.
  const props =
    (minHeight ? `<w:trHeight w:val="${minHeight}" w:hRule="atLeast"/>` : '') +
    (repeatAsHeader ? '<w:tblHeader/>' : '');
  return `<w:tr>${props ? `<w:trPr>${props}</w:trPr>` : ''}${cells.join('')}</w:tr>`;
};

type TableOptions = {
  borders?: string;
  marginX?: number;
  marginY?: number;
};

const table = (grid: number[], rows: string[], options: TableOptions = {}): string => {
  const width = grid.reduce((total, column) => total + column, 0);
  const marginX = options.marginX ?? 110;
  const marginY = options.marginY ?? 90;
  const margins =
    `<w:tblCellMar><w:top w:w="${marginY}" w:type="dxa"/><w:left w:w="${marginX}" w:type="dxa"/>` +
    `<w:bottom w:w="${marginY}" w:type="dxa"/><w:right w:w="${marginX}" w:type="dxa"/></w:tblCellMar>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/>${options.borders ?? ''}` +
    `<w:tblLayout w:type="fixed"/>${margins}</w:tblPr>` +
    `<w:tblGrid>${grid.map((column) => `<w:gridCol w:w="${column}"/>`).join('')}</w:tblGrid>` +
    `${rows.join('')}</w:tbl>`
  );
};

/* ------------------------------------------------------------------ logo decoding */

type LogoImage = {
  bytes: Uint8Array;
  widthEmu: number;
  heightEmu: number;
};

const base64ToBytes = (base64: string): Uint8Array | null => {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Reads the pixel size straight out of the PNG header. A PNG always starts with the 8-byte
 * signature followed by the IHDR chunk, whose width and height are big-endian uint32s at
 * byte offsets 16 and 20. Word needs the real aspect ratio to size the inline picture.
 */
const decodeLogo = (dataUrl: string | null): LogoImage | null => {
  if (!dataUrl) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !/^data:image\/png;base64$/i.test(dataUrl.slice(0, comma))) return null;

  const bytes = base64ToBytes(dataUrl.slice(comma + 1));
  if (!bytes || bytes.length < 24) return null;
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;

  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const widthPx = header.getUint32(16, false);
  const heightPx = header.getUint32(20, false);
  if (widthPx < 1 || heightPx < 1) return null;

  const scale = Math.min(
    1,
    (MAX_LOGO_WIDTH_PT * EMU_PER_POINT) / (widthPx * EMU_PER_PIXEL),
    (MAX_LOGO_HEIGHT_PT * EMU_PER_POINT) / (heightPx * EMU_PER_PIXEL),
  );

  return {
    bytes,
    widthEmu: Math.max(1, Math.round(widthPx * EMU_PER_PIXEL * scale)),
    heightEmu: Math.max(1, Math.round(heightPx * EMU_PER_PIXEL * scale)),
  };
};

const logoDrawing = (logo: LogoImage): string =>
  `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
  `<wp:extent cx="${logo.widthEmu}" cy="${logo.heightEmu}"/>` +
  `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
  `<wp:docPr id="1" name="Company logo" descr="Company logo"/>` +
  `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
  `<a:graphic><a:graphicData uri="${NS_DRAWING_PIC}">` +
  `<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
  `<pic:blipFill><a:blip r:embed="${LOGO_REL_ID}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
  `<pic:spPr><a:xfrm><a:off x="0" y="0"/>` +
  `<a:ext cx="${logo.widthEmu}" cy="${logo.heightEmu}"/></a:xfrm>` +
  `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
  `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

const initialsOf = (name: string): string => {
  const letters = name
    .split(/\s+/)
    .map((word) => word.match(/[A-Za-z0-9]/)?.[0] ?? '')
    .join('');
  return (letters || '?').slice(0, 3).toUpperCase();
};

/* ------------------------------------------------------------------ document blocks */

const headerBand = (model: QuotationDocumentModel, logo: LogoImage | null): string => {
  const markWidth = logo ? MARK_CELL_WIDTH : 1080;
  const contactWidth = 2900;
  const grid = [markWidth, CONTENT_WIDTH - markWidth - contactWidth, contactWidth];

  // No logo: a brand-coloured block carrying the company initials stands in for the mark.
  const mark = logo
    ? cell(
        markWidth,
        `<w:p><w:pPr><w:pStyle w:val="LogoFrame"/></w:pPr>${logoDrawing(logo)}</w:p>`,
        {
          fill: COLOR.navy950,
          vAlign: 'center',
        },
      )
    : cell(markWidth, paragraph('LogoInitials', initialsOf(model.company.name)), {
        fill: COLOR.blue700,
        vAlign: 'center',
      });

  const identity =
    paragraph('CompanyName', model.company.name) +
    (model.company.tagline ? paragraph('CompanyTagline', model.company.tagline) : '');
  const contact =
    paragraph('CompanyPhone', model.company.phone) +
    paragraph('CompanyAddress', model.company.address);

  return table(
    grid,
    [
      tableRow(
        [
          mark,
          cell(grid[1], identity, { fill: COLOR.navy950, vAlign: 'center' }),
          cell(grid[2], contact, { fill: COLOR.navy950, vAlign: 'center' }),
        ],
        1180,
      ),
    ],
    { marginX: MARK_CELL_MARGIN, marginY: 140 },
  );
};

const metaColumn = (rows: DocumentMetaRow[]): string =>
  rows.length > 0
    ? rows
        .map((row) => paragraph('MetaLabel', row.label) + paragraph('MetaValue', row.value))
        .join('')
    : paragraph('MetaValue');

const metaBlock = (model: QuotationDocumentModel): string => {
  const column = Math.floor(CONTENT_WIDTH / 2);
  const grid = [column, CONTENT_WIDTH - column];
  return table(
    grid,
    [
      tableRow([
        cell(grid[0], metaColumn(model.metaLeft)),
        cell(grid[1], metaColumn(model.metaRight)),
      ]),
    ],
    { marginX: 0, marginY: 0 },
  );
};

const highlightsStrip = (highlights: DocumentMetaRow[]): string => {
  const column = Math.floor(CONTENT_WIDTH / highlights.length);
  const grid = highlights.map((_, index) =>
    index === highlights.length - 1 ? CONTENT_WIDTH - column * (highlights.length - 1) : column,
  );
  const cells = highlights.map((highlight, index) =>
    cell(
      grid[index],
      paragraph('HighlightLabel', highlight.label) + paragraph('HighlightValue', highlight.value),
      {
        fill: COLOR.cyan100,
      },
    ),
  );
  return table(grid, [tableRow(cells)], { borders: BORDERS_TINTED, marginX: 150, marginY: 130 });
};

const itemsTable = (model: QuotationDocumentModel): string => {
  const amountWidth = 2700;
  const grid = [CONTENT_WIDTH - amountWidth, amountWidth];

  const headerRow = tableRow(
    [
      cell(grid[0], paragraph('TableHeader', 'Description'), {
        fill: COLOR.cyan100,
        vAlign: 'center',
      }),
      cell(grid[1], paragraph('TableHeaderRight', 'Estimated amount'), {
        fill: COLOR.cyan100,
        vAlign: 'center',
      }),
    ],
    420,
    true,
  );

  const itemRows = model.lineItems.map((item) =>
    tableRow([
      cell(grid[0], paragraph('ItemLabel', item.label)),
      cell(grid[1], paragraph('ItemAmount', item.amount)),
    ]),
  );

  const totalRow = tableRow(
    [
      cell(grid[0], paragraph('TotalLabel', model.totalLabel), {
        fill: COLOR.navy950,
        vAlign: 'center',
      }),
      cell(grid[1], paragraph('TotalAmount', model.totalAmount), {
        fill: COLOR.navy950,
        vAlign: 'center',
      }),
    ],
    640,
  );

  return table(grid, [headerRow, ...itemRows, totalRow], {
    borders: BORDERS_ITEMS,
    marginX: 130,
    marginY: 120,
  });
};

const disclaimerBox = (model: QuotationDocumentModel): string =>
  table(
    [CONTENT_WIDTH],
    [
      tableRow([
        cell(
          CONTENT_WIDTH,
          paragraph('DisclaimerLabel', model.disclaimerLabel) +
            paragraph('DisclaimerBody', model.disclaimer),
          { fill: COLOR.cyan100 },
        ),
      ]),
    ],
    { borders: BORDERS_TINTED, marginX: 180, marginY: 160 },
  );

const SECTION_PROPERTIES =
  `<w:sectPr><w:pgSz w:w="${PAGE_WIDTH}" w:h="${PAGE_HEIGHT}"/>` +
  `<w:pgMar w:top="${PAGE_MARGIN}" w:right="${PAGE_MARGIN}" w:bottom="${PAGE_MARGIN}" ` +
  `w:left="${PAGE_MARGIN}" w:header="708" w:footer="708" w:gutter="0"/>` +
  `<w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`;

const buildDocument = (model: QuotationDocumentModel, logo: LogoImage | null): string => {
  const notes = model.notes.filter((note) => note.trim().length > 0);
  const blocks: string[] = [
    headerBand(model, logo),
    paragraph('AccentRule'),
    paragraph('DocTitle', model.title),
  ];

  if (model.quotationNumber.trim().length > 0) {
    blocks.push(paragraph('QuoteRef', model.quotationNumber));
  }

  // Consecutive tables would be merged into one by Word, so every table is followed by a spacer.
  blocks.push(metaBlock(model), SPACER);

  if (model.highlights.length > 0) {
    blocks.push(highlightsStrip(model.highlights), SPACER);
  }

  blocks.push(paragraph('SectionHeading', model.scopeHeading), itemsTable(model), SPACER);

  if (notes.length > 0) {
    blocks.push(...notes.map(bullet), SPACER);
  }

  blocks.push(disclaimerBox(model), paragraph('Footnote', model.footnote), SECTION_PROPERTIES);

  return (
    `${XML_PROLOG}<w:document xmlns:w="${NS_WORD}" xmlns:r="${NS_REL}" xmlns:wp="${NS_DRAWING_WP}" ` +
    `xmlns:a="${NS_DRAWING_A}" xmlns:pic="${NS_DRAWING_PIC}"><w:body>${blocks.join('')}</w:body></w:document>`
  );
};

/* ------------------------------------------------------------------ static parts */

type StyleSpec = {
  id: string;
  name: string;
  pPr?: string;
  rPr?: string;
};

/**
 * Child elements of w:pPr and w:rPr must appear in schema order (for w:pPr: keepNext, pBdr,
 * shd, tabs, spacing, ind, jc; for w:rPr: rFonts, b, caps, color, spacing, sz), so these
 * fragments are written out longhand rather than composed from unordered pieces.
 */
const STYLE_SPECS: StyleSpec[] = [
  {
    id: 'CompanyName',
    name: 'Company Name',
    pPr: '<w:spacing w:before="0" w:after="20"/>',
    rPr: `<w:b/><w:color w:val="${COLOR.white}"/><w:sz w:val="30"/>`,
  },
  {
    id: 'CompanyTagline',
    name: 'Company Tagline',
    pPr: '<w:spacing w:before="0" w:after="0"/>',
    rPr: `<w:color w:val="${COLOR.cyan300}"/><w:sz w:val="17"/>`,
  },
  {
    id: 'CompanyPhone',
    name: 'Company Phone',
    pPr: '<w:spacing w:before="0" w:after="20"/><w:jc w:val="right"/>',
    rPr: `<w:b/><w:color w:val="${COLOR.cyan100}"/><w:sz w:val="17"/>`,
  },
  {
    id: 'CompanyAddress',
    name: 'Company Address',
    pPr: '<w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/>',
    rPr: `<w:color w:val="${COLOR.cyan300}"/><w:sz w:val="16"/>`,
  },
  {
    id: 'LogoFrame',
    name: 'Logo Frame',
    pPr: '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>',
  },
  {
    id: 'LogoInitials',
    name: 'Logo Initials',
    pPr: '<w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/>',
    rPr: `<w:b/><w:caps/><w:color w:val="${COLOR.white}"/><w:spacing w:val="30"/><w:sz w:val="32"/>`,
  },
  {
    id: 'AccentRule',
    name: 'Accent Rule',
    pPr:
      `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="${COLOR.blue500}"/></w:pBdr>` +
      '<w:spacing w:before="0" w:after="160" w:line="180" w:lineRule="exact"/>',
    rPr: '<w:sz w:val="8"/>',
  },
  {
    id: 'DocTitle',
    name: 'Document Title',
    pPr: '<w:keepNext/><w:spacing w:before="120" w:after="60"/>',
    rPr:
      '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:caps/>' +
      `<w:color w:val="${COLOR.navy950}"/><w:spacing w:val="60"/><w:sz w:val="36"/>`,
  },
  {
    id: 'QuoteRef',
    name: 'Quotation Reference',
    pPr: '<w:spacing w:before="0" w:after="220"/>',
    rPr: `<w:b/><w:caps/><w:color w:val="${COLOR.blue700}"/><w:spacing w:val="30"/><w:sz w:val="16"/>`,
  },
  {
    id: 'MetaLabel',
    name: 'Meta Label',
    pPr: '<w:spacing w:before="0" w:after="0"/>',
    rPr: `<w:b/><w:caps/><w:color w:val="${COLOR.muted}"/><w:spacing w:val="24"/><w:sz w:val="14"/>`,
  },
  {
    id: 'MetaValue',
    name: 'Meta Value',
    pPr: '<w:spacing w:before="0" w:after="140"/>',
    rPr: `<w:color w:val="${COLOR.ink}"/><w:sz w:val="20"/>`,
  },
  {
    id: 'HighlightLabel',
    name: 'Highlight Label',
    pPr: '<w:spacing w:before="0" w:after="30"/>',
    rPr: `<w:b/><w:caps/><w:color w:val="${COLOR.blue700}"/><w:spacing w:val="24"/><w:sz w:val="13"/>`,
  },
  {
    id: 'HighlightValue',
    name: 'Highlight Value',
    pPr: '<w:spacing w:before="0" w:after="0"/>',
    rPr: `<w:b/><w:color w:val="${COLOR.navy950}"/><w:sz w:val="22"/>`,
  },
  {
    id: 'SectionHeading',
    name: 'Section Heading',
    pPr: '<w:keepNext/><w:spacing w:before="280" w:after="120"/>',
    rPr: `<w:b/><w:caps/><w:color w:val="${COLOR.blue700}"/><w:spacing w:val="32"/><w:sz w:val="22"/>`,
  },
  {
    id: 'TableHeader',
    name: 'Table Header',
    pPr: '<w:spacing w:before="0" w:after="0"/>',
    rPr: `<w:b/><w:caps/><w:color w:val="${COLOR.navy900}"/><w:spacing w:val="24"/><w:sz w:val="14"/>`,
  },
  {
    id: 'TableHeaderRight',
    name: 'Table Header Right',
    pPr: '<w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/>',
    rPr: `<w:b/><w:caps/><w:color w:val="${COLOR.navy900}"/><w:spacing w:val="24"/><w:sz w:val="14"/>`,
  },
  {
    id: 'ItemLabel',
    name: 'Item Label',
    pPr: '<w:spacing w:before="0" w:after="0"/>',
    rPr: `<w:color w:val="${COLOR.text}"/><w:sz w:val="20"/>`,
  },
  {
    id: 'ItemAmount',
    name: 'Item Amount',
    pPr: '<w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/>',
    rPr: `<w:b/><w:color w:val="${COLOR.ink}"/><w:sz w:val="20"/>`,
  },
  {
    id: 'TotalLabel',
    name: 'Total Label',
    pPr: '<w:spacing w:before="0" w:after="0"/>',
    rPr: `<w:b/><w:caps/><w:color w:val="${COLOR.white}"/><w:spacing w:val="34"/><w:sz w:val="20"/>`,
  },
  {
    id: 'TotalAmount',
    name: 'Total Amount',
    pPr: '<w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/>',
    rPr: `<w:b/><w:color w:val="${COLOR.solar}"/><w:sz w:val="30"/>`,
  },
  {
    id: 'NoteItem',
    name: 'Note Item',
    pPr:
      '<w:tabs><w:tab w:val="left" w:pos="284"/></w:tabs>' +
      '<w:spacing w:before="0" w:after="80"/><w:ind w:left="284" w:hanging="284"/>',
    rPr: `<w:color w:val="${COLOR.text}"/><w:sz w:val="18"/>`,
  },
  {
    id: 'DisclaimerLabel',
    name: 'Disclaimer Label',
    pPr: '<w:spacing w:before="0" w:after="70"/>',
    rPr: `<w:b/><w:caps/><w:color w:val="${COLOR.navy900}"/><w:spacing w:val="28"/><w:sz w:val="15"/>`,
  },
  {
    id: 'DisclaimerBody',
    name: 'Disclaimer Body',
    pPr: '<w:spacing w:before="0" w:after="0"/>',
    rPr: `<w:color w:val="${COLOR.text}"/><w:sz w:val="16"/>`,
  },
  {
    id: 'Footnote',
    name: 'Footnote',
    pPr: '<w:spacing w:before="260" w:after="0"/>',
    rPr: `<w:color w:val="${COLOR.muted}"/><w:sz w:val="13"/>`,
  },
  {
    id: 'Spacer',
    name: 'Spacer',
    pPr: '<w:spacing w:before="0" w:after="0" w:line="140" w:lineRule="exact"/>',
    rPr: '<w:sz w:val="8"/>',
  },
];

const buildStyles = (): string => {
  const normal =
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/><w:qFormat/></w:style>';
  const custom = STYLE_SPECS.map(
    (style) =>
      `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${style.id}">` +
      `<w:name w:val="${esc(style.name)}"/><w:basedOn w:val="Normal"/><w:qFormat/>` +
      `${style.pPr ? `<w:pPr>${style.pPr}</w:pPr>` : ''}` +
      `${style.rPr ? `<w:rPr>${style.rPr}</w:rPr>` : ''}</w:style>`,
  ).join('');

  return (
    `${XML_PROLOG}<w:styles xmlns:w="${NS_WORD}"><w:docDefaults><w:rPrDefault><w:rPr>` +
    '<w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/>' +
    `<w:color w:val="${COLOR.text}"/><w:sz w:val="20"/><w:szCs w:val="20"/>` +
    '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' +
    '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>' +
    `</w:pPr></w:pPrDefault></w:docDefaults>${normal}${custom}</w:styles>`
  );
};

const CONTENT_TYPES =
  `${XML_PROLOG}<Types xmlns="${NS_CONTENT_TYPES}">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Default Extension="png" ContentType="image/png"/>' +
  '<Override PartName="/word/document.xml" ContentType="' +
  `${DOCX_MIME}.main+xml"/>` +
  '<Override PartName="/word/styles.xml" ContentType="' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '</Types>';

const PACKAGE_RELS =
  `${XML_PROLOG}<Relationships xmlns="${NS_PACKAGE_REL}">` +
  `<Relationship Id="rId1" Type="${REL_TYPE_DOCUMENT}" Target="word/document.xml"/>` +
  '</Relationships>';

const documentRels = (hasLogo: boolean): string =>
  `${XML_PROLOG}<Relationships xmlns="${NS_PACKAGE_REL}">` +
  `<Relationship Id="${STYLES_REL_ID}" Type="${REL_TYPE_STYLES}" Target="styles.xml"/>` +
  (hasLogo
    ? `<Relationship Id="${LOGO_REL_ID}" Type="${REL_TYPE_IMAGE}" Target="media/logo.png"/>`
    : '') +
  '</Relationships>';

/* ------------------------------------------------------------------ renderer */

export const renderQuotationDocx: QuotationDocumentRenderer = async (model, assets) => {
  const logo = decodeLogo(assets.logoDataUrl);
  const utf8 = new TextEncoder();

  const entries: ZipEntry[] = [
    { path: '[Content_Types].xml', data: utf8.encode(CONTENT_TYPES) },
    { path: '_rels/.rels', data: utf8.encode(PACKAGE_RELS) },
    { path: 'word/document.xml', data: utf8.encode(buildDocument(model, logo)) },
    { path: 'word/_rels/document.xml.rels', data: utf8.encode(documentRels(logo !== null)) },
    { path: 'word/styles.xml', data: utf8.encode(buildStyles()) },
  ];

  if (logo) {
    entries.push({ path: 'word/media/logo.png', data: logo.bytes });
  }

  return new Blob([createZip(entries)], { type: DOCX_MIME });
};
