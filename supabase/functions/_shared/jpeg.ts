// A photo members share must carry nothing but the picture. This walks a JPEG's segments and
// keeps only what a decoder needs: every APPn segment (EXIF with GPS, XMP, IPTC, ICC, JFIF
// thumbnails) and every comment is dropped. It refuses anything that is not a well-formed
// Huffman-coded baseline or progressive JPEG with one or three colour components, its tables
// and at least one scan of image data. It decodes nothing; cook-upload decodes the result too.

export interface CleanJpeg {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export class JpegError extends Error {}

/** Baseline, extended and progressive Huffman frames: what phones and browsers write. */
const SOF = new Set([0xc0, 0xc1, 0xc2]);
/** Every other frame type (lossless, hierarchical, arithmetic) is refused. */
const OTHER_SOF = new Set([0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const DHT = 0xc4;
const DQT = 0xdb;

function isMetadata(marker: number): boolean {
  return (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
}

export function cleanJpeg(input: Uint8Array): CleanJpeg {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8)
    throw new JpegError('not_jpeg');
  const parts: Uint8Array[] = [input.subarray(0, 2)];
  let i = 2;
  let width = 0;
  let height = 0;
  let frames = 0;
  let quantTables = 0;
  let huffmanTables = 0;
  let scans = 0;
  let ended = false;

  while (i < input.length) {
    if (input[i] !== 0xff) throw new JpegError('bad_marker');
    // Fill bytes before a marker.
    while (input[i] === 0xff && i < input.length) i += 1;
    const marker = input[i];
    if (marker === undefined) throw new JpegError('truncated');
    const start = i - 1;
    i += 1;
    if (marker === 0xd9) {
      parts.push(input.subarray(start, i));
      ended = true;
      break;
    }
    if (
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0x01 ||
      marker === 0x00
    ) {
      throw new JpegError('bad_marker');
    }
    if (i + 2 > input.length) throw new JpegError('truncated');
    const length = (input[i]! << 8) | input[i + 1]!;
    if (length < 2 || i + length > input.length) throw new JpegError('truncated');
    const end = i + length;

    if (OTHER_SOF.has(marker)) throw new JpegError('unsupported');
    if (marker === DQT) quantTables += 1;
    if (marker === DHT) huffmanTables += 1;
    if (SOF.has(marker)) {
      if (length < 8) throw new JpegError('bad_frame');
      height = (input[i + 3]! << 8) | input[i + 4]!;
      width = (input[i + 5]! << 8) | input[i + 6]!;
      const components = input[i + 7]!;
      if (components !== 1 && components !== 3) throw new JpegError('bad_frame');
      frames += 1;
    }

    if (marker === 0xda) {
      if (frames !== 1 || quantTables === 0 || huffmanTables === 0)
        throw new JpegError('bad_scan');
      // Start of scan: the header, then entropy-coded data up to the next real marker
      // (0xFF followed by anything but a stuffed zero or a restart marker).
      let j = end;
      while (j < input.length) {
        if (input[j] === 0xff) {
          const next = input[j + 1];
          if (next === undefined) throw new JpegError('truncated');
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7) || next === 0xff) {
            j += next === 0xff ? 1 : 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      // Progressive scans can be tiny, but none is empty.
      if (j === end) throw new JpegError('bad_scan');
      scans += 1;
      parts.push(input.subarray(start, j));
      i = j;
      continue;
    }

    if (!isMetadata(marker)) parts.push(input.subarray(start, end));
    i = end;
  }

  if (!ended) throw new JpegError('truncated');
  if (frames !== 1 || width < 1 || height < 1) throw new JpegError('bad_frame');
  if (scans === 0) throw new JpegError('bad_scan');
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return { bytes, width, height };
}
