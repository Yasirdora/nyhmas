import { describe, expect, it } from 'vitest';
import { applySrgbColorTag } from './mp4ColorTag';

// --- Minimal MP4 box builders (big-endian, 32-bit sizes) -------------------

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n);
  return b;
}

function raw(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function box(type: string, ...children: Uint8Array[]): Uint8Array {
  return concat(
    u32(8 + children.reduce((a, c) => a + c.length, 0)),
    raw(...[...type].map((c) => c.charCodeAt(0))),
    ...children,
  );
}

function find(haystack: Uint8Array, needle: string): number {
  const bytes = [...needle].map((c) => c.charCodeAt(0));
  for (let i = 0; i + bytes.length <= haystack.length; i++) {
    if (bytes.every((b, j) => haystack[i + j] === b)) return i;
  }
  return -1;
}

/** stsd with a version/flags + entry-count header and the given sample entries. */
function stsd(...entries: Uint8Array[]): Uint8Array {
  return box('stsd', raw(0, 0, 0, 0), u32(entries.length), ...entries);
}

/** avc1 sample entry: 78-byte VideoSampleEntry header, then child boxes. */
function avc1(...children: Uint8Array[]): Uint8Array {
  return box('avc1', new Uint8Array(78), ...children);
}

function colrNclx(
  primaries: number,
  transfer: number,
  matrix: number,
  fullRange: boolean,
): Uint8Array {
  return box(
    'colr',
    raw(0x6e, 0x63, 0x6c, 0x78),
    u16(primaries),
    u16(transfer),
    u16(matrix),
    raw(fullRange ? 0x80 : 0),
  );
}

/** Chrome-fMP4-shaped file: ftyp, moov (video trak, stco after stsd), mdat. */
function sampleMp4(videoEntry: Uint8Array, stcoEntry: number): Uint8Array {
  const stco = box('stco', raw(0, 0, 0, 0), u32(1), u32(stcoEntry));
  const stbl = box('stbl', stsd(videoEntry), box('stts', raw(0, 0, 0, 0), u32(0)), stco);
  const moov = box(
    'moov',
    box('mvhd', new Uint8Array(100)),
    box('trak', box('mdia', box('minf', stbl))),
  );
  const ftyp = box('ftyp', raw(...[...'isom'].map((c) => c.charCodeAt(0))), u32(0));
  return concat(ftyp, moov, box('mdat', new Uint8Array(256)));
}

function readColr(buf: Uint8Array) {
  const i = find(buf, 'colr');
  if (i < 0) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    size: view.getUint32(i - 4),
    kind: String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]),
    primaries: view.getUint16(i + 8),
    transfer: view.getUint16(i + 10),
    matrix: view.getUint16(i + 12),
    fullRange: (buf[i + 14] & 0x80) !== 0,
  };
}

// ---------------------------------------------------------------------------

describe('applySrgbColorTag', () => {
  it('inserts a colr box when the sample entry has none (Chrome MediaRecorder shape)', () => {
    const entry = avc1(box('avcC', raw(1, 100, 0, 31)));
    // Chunk offset points into the mdat payload, past the moov.
    const probe = sampleMp4(entry, 0);
    const moovEnd = find(probe, 'mdat') - 4;
    const chunkOffset = moovEnd + 100;
    const input = sampleMp4(entry, chunkOffset);

    const out = new Uint8Array(applySrgbColorTag(input.buffer as ArrayBuffer));

    expect(out.length).toBe(input.length + 19);
    expect(readColr(out)).toEqual({
      size: 19,
      kind: 'nclx',
      primaries: 1, // bt709 (sRGB primaries)
      transfer: 13, // iec61966-2-1 (sRGB EOTF)
      matrix: 6, // smpte170m — the matrix Chrome's MediaRecorder encodes with
      fullRange: false,
    });

    // Every ancestor box grew by the colr box size.
    const view = new DataView(out.buffer);
    const origMoovSize = new DataView(probe.buffer).getUint32(find(probe, 'moov') - 4);
    expect(view.getUint32(find(out, 'moov') - 4)).toBe(origMoovSize + 19);
    expect(view.getUint32(find(out, 'avc1') - 4)).toBe(entry.length + 19);

    // The chunk offset moved with the grown moov.
    const stcoPos = find(out, 'stco');
    expect(view.getUint32(stcoPos + 12)).toBe(chunkOffset + 19);

    // Media payload is byte-identical.
    const mdatOut = find(out, 'mdat');
    expect(out.subarray(mdatOut)).toEqual(input.subarray(find(input, 'mdat')));
  });

  it('honors insertMatrix bt709 for WebCodecs-produced files', () => {
    const input = sampleMp4(avc1(box('avcC', raw(1))), 0);
    const out = new Uint8Array(
      applySrgbColorTag(input.buffer as ArrayBuffer, { insertMatrix: 'bt709' }),
    );
    expect(readColr(out)?.matrix).toBe(1);
  });

  it('rewrites an existing colr box in place, preserving matrix and range', () => {
    const entry = avc1(box('avcC', raw(1)), colrNclx(6, 6, 1, false));
    const input = sampleMp4(entry, 0);

    const out = new Uint8Array(applySrgbColorTag(input.buffer as ArrayBuffer));

    expect(out.length).toBe(input.length); // in-place, no growth
    const colr = readColr(out);
    expect(colr?.primaries).toBe(1);
    expect(colr?.transfer).toBe(13);
    expect(colr?.matrix).toBe(1); // untouched — the encoder's actual matrix
    expect(colr?.fullRange).toBe(false);
  });

  it('is idempotent', () => {
    const input = sampleMp4(avc1(box('avcC', raw(1))), 0);
    const once = applySrgbColorTag(input.buffer as ArrayBuffer);
    const twice = applySrgbColorTag(once);
    expect(new Uint8Array(twice)).toEqual(new Uint8Array(once));
  });

  it('returns non-MP4 data unchanged', () => {
    const garbage = new Uint8Array([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5]).buffer;
    expect(applySrgbColorTag(garbage)).toBe(garbage);
  });

  it('returns files without a moov box unchanged', () => {
    const input = concat(box('ftyp', raw(1, 2, 3, 4)), box('mdat', new Uint8Array(16)));
    expect(applySrgbColorTag(input.buffer as ArrayBuffer)).toBe(input.buffer);
  });
});
