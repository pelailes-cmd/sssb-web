/**
 * Minimal STORE-only ZIP writer (no dependencies, browser-only).
 *
 * Emits the three structures a reader needs, in order: a Local File Header plus the raw
 * bytes for every entry, then one Central Directory record per entry, then the End Of
 * Central Directory record. Nothing is compressed — OOXML parts are small and Word does
 * not care — so the compressed and uncompressed sizes are always identical.
 *
 * Every multi-byte integer is little-endian, and the MS-DOS timestamp is frozen at
 * 1980-01-01 so that generating the same document twice produces the same bytes.
 */

export type ZipEntry = {
  /** Path inside the archive, e.g. "word/document.xml". Always stored with forward slashes. */
  path: string;
  data: Uint8Array;
};

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const EOCD_SIZE = 22;

/** 2.0 — the minimum for a reader that understands folders and STORE entries. */
const VERSION = 20;
/** General purpose bit 11: file names in this archive are UTF-8. */
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;

/** MS-DOS packed time/date for 1980-01-01 00:00:00 (year 0 of the DOS epoch, month 1, day 1). */
const DOS_TIME = 0;
const DOS_DATE = 33;

const utf8 = new TextEncoder();

/** CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320) lookup table, built once per module. */
const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** ZIP paths are POSIX-style and never absolute; normalise so callers cannot break readers. */
const normalisePath = (path: string): string => path.replace(/\\/g, '/').replace(/^\/+/, '');

type PreparedEntry = {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
  /** Byte offset of this entry's local header from the start of the archive. */
  offset: number;
};

/** Returns a freshly allocated buffer, so the result is safe to hand straight to `Blob`. */
export function createZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const prepared: PreparedEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = utf8.encode(normalisePath(entry.path));
    prepared.push({ name, data: entry.data, crc: crc32(entry.data), offset });
    offset += LOCAL_HEADER_SIZE + name.length + entry.data.length;
  }

  const centralStart = offset;
  const centralSize = prepared.reduce(
    (total, entry) => total + CENTRAL_HEADER_SIZE + entry.name.length,
    0,
  );

  const output = new Uint8Array(centralStart + centralSize + EOCD_SIZE);
  const view = new DataView(output.buffer);
  let at = 0;

  const u16 = (value: number): void => {
    view.setUint16(at, value, true);
    at += 2;
  };
  const u32 = (value: number): void => {
    view.setUint32(at, value >>> 0, true);
    at += 4;
  };
  const bytes = (source: Uint8Array): void => {
    output.set(source, at);
    at += source.length;
  };

  for (const entry of prepared) {
    u32(SIG_LOCAL);
    u16(VERSION); // version needed to extract
    u16(FLAG_UTF8);
    u16(METHOD_STORE);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(entry.crc);
    u32(entry.data.length); // compressed size == uncompressed size under STORE
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0); // extra field length
    bytes(entry.name);
    bytes(entry.data);
  }

  for (const entry of prepared) {
    u32(SIG_CENTRAL);
    u16(VERSION); // version made by
    u16(VERSION); // version needed to extract
    u16(FLAG_UTF8);
    u16(METHOD_STORE);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(entry.crc);
    u32(entry.data.length);
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0); // extra field length
    u16(0); // file comment length
    u16(0); // disk number start
    u16(0); // internal file attributes
    u32(0); // external file attributes
    u32(entry.offset);
    bytes(entry.name);
  }

  u32(SIG_EOCD);
  u16(0); // number of this disk
  u16(0); // disk holding the central directory
  u16(prepared.length); // entries on this disk
  u16(prepared.length); // entries in total
  u32(centralSize);
  u32(centralStart);
  u16(0); // archive comment length

  return output;
}
