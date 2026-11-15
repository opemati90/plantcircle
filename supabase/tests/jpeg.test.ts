import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanJpeg } from '../functions/_shared/jpeg';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', name)));
const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

describe('cleanJpeg', () => {
  for (const name of ['gps.jpg', 'gps-progressive.jpg']) {
    it(`drops EXIF (with GPS), comments and every APP segment from ${name}`, () => {
      const input = fixture(name);
      expect(text(input)).toContain('PhoneModel');
      const clean = cleanJpeg(input);
      expect(clean).toMatchObject({ width: 64, height: 48 });
      const out = text(clean.bytes);
      expect(out).not.toContain('Exif');
      expect(out).not.toContain('PhoneModel');
      expect(out).not.toContain('secret comment');
      expect(out).not.toContain('JFIF');
      for (let i = 0; i < clean.bytes.length - 1; i += 1) {
        // No APPn or COM marker survives before the first scan.
        if (clean.bytes[i] === 0xff && clean.bytes[i + 1] === 0xda) break;
        if (clean.bytes[i] === 0xff) {
          const marker = clean.bytes[i + 1]!;
          expect(marker >= 0xe0 && marker <= 0xef).toBe(false);
          expect(marker).not.toBe(0xfe);
        }
      }
      expect(clean.bytes.subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
      expect(clean.bytes.subarray(-2)).toEqual(new Uint8Array([0xff, 0xd9]));
    });
  }

  it('refuses what is not a whole JPEG', () => {
    expect(() => cleanJpeg(new TextEncoder().encode('<svg></svg>'))).toThrow(/not_jpeg/);
    const input = fixture('gps.jpg');
    expect(() => cleanJpeg(input.subarray(0, input.length - 40))).toThrow(/truncated/);
    expect(() => cleanJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow(/bad_frame/);
    // A frame header with no tables or image data claims a size but holds no picture.
    const header = [
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x06, 0x40, 0x05, 0x00, 0x01, 0x01, 0x11, 0x00,
    ];
    expect(() => cleanJpeg(new Uint8Array([...header, 0xff, 0xd9]))).toThrow(/bad_scan/);
    expect(() =>
      cleanJpeg(
        new Uint8Array([
          ...header,
          0xff,
          0xda,
          0x00,
          0x08,
          0x01,
          0x01,
          0x00,
          0x00,
          0x3f,
          0x00,
          0xff,
          0xd9,
        ]),
      ),
    ).toThrow(/bad_scan/);
    // Arithmetic-coded and lossless frames are refused.
    expect(() =>
      cleanJpeg(
        new Uint8Array([
          0xff, 0xd8, 0xff, 0xc9, 0x00, 0x0b, 0x08, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xd9,
        ]),
      ),
    ).toThrow(/unsupported/);
  });
});
