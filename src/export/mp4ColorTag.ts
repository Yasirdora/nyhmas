/**
 * MP4 color-tag correction for canvas-derived exports.
 *
 * The pixels we encode are sRGB (that is what a canvas contains), but the
 * encoders tag the stream for a broadcast pipeline: Chrome's MediaRecorder
 * writes BT.601 (smpte170m) into the SPS VUI and no `colr` box at all, while
 * WebCodecs output is tagged BT.709. QuickTime/ColorSync then renders the
 * file with the BT.709/601 EOTF (~gamma 1.96) instead of sRGB (~2.2), which
 * lifts midtones and makes the video look dull and desaturated next to the
 * live page. (Browsers map BT.709 to sRGB on playback, which is why the same
 * file looks fine in Chrome.)
 *
 * The fix is metadata only — the YUV values are already correct: ensure every
 * video sample entry carries a `colr` (nclx) box declaring sRGB primaries
 * (BT.709) and the sRGB transfer function, so color-managed players use the
 * sRGB EOTF. A `colr` box takes precedence over the bitstream VUI per
 * ISO/IEC 14496-12, so there is no need to rewrite the SPS. Players that
 * ignore `colr` behave exactly as before, so this can only improve things.
 *
 * The matrix coefficient and range flag are encoding facts and are preserved:
 * an existing `colr` keeps its matrix/range (only primaries + transfer are
 * rewritten); when inserting a new box the caller states the matrix the
 * encoder actually used (Chrome's MediaRecorder converts canvas RGB with the
 * BT.601 matrix; WebCodecs canvas encodes use BT.709).
 */

/** nclx codes (ISO/IEC 23001-8). */
const PRIMARIES_BT709 = 1;
const TRANSFER_SRGB = 13; // iec61966-2-1
const MATRIX_BT709 = 1;
const MATRIX_SMPTE170M = 6; // BT.601

const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'udta']);
const VIDEO_SAMPLE_ENTRIES = new Set(['avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'vp09', 'mp4v']);
/** VideoSampleEntry fields between the box header and the first child box. */
const SAMPLE_ENTRY_HEADER = 78;

interface Box {
  /** Absolute offset of the box's size field. */
  start: number;
  /** Total box size in bytes (header included). */
  size: number;
  type: string;
  /** Offset of the first byte after the header. */
  bodyStart: number;
  /** 8 normally; 16 for largesize boxes (their u32 size field must not be patched). */
  headerSize: number;
}

interface Insertion {
  at: number;
  bytes: Uint8Array;
}

interface SizePatch {
  /** Absolute offset of a u32 size field to grow. */
  at: number;
  delta: number;
}

interface OffsetTable {
  /** Absolute offset of the first entry (after box header + entry_count). */
  entriesStart: number;
  entryCount: number;
  entrySize: 4 | 8;
}

export interface SrgbTagOptions {
  /**
   * Matrix the encoder used, written only when a `colr` box must be inserted
   * (an existing box keeps its matrix). Defaults to BT.601, matching Chrome's
   * MediaRecorder canvas capture; pass 'bt709' for WebCodecs-encoded output.
   */
  insertMatrix?: 'bt601' | 'bt709';
}

/**
 * Return a copy of `mp4` whose video tracks are tagged as sRGB content.
 * If the file has no `moov`, no video sample entry, or an unexpected
 * structure, the input is returned unchanged (never throws on bad data).
 */
export function applySrgbColorTag(mp4: ArrayBuffer, options: SrgbTagOptions = {}): ArrayBuffer {
  try {
    return tag(new Uint8Array(mp4), options) ?? mp4;
  } catch {
    return mp4; // defensive: exporting must never fail over metadata
  }
}

function tag(buf: Uint8Array, options: SrgbTagOptions): ArrayBuffer | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const moov = topLevelBoxes(view).find((b) => b.type === 'moov');
  if (!moov) return null;

  const insertions: Insertion[] = [];
  const sizePatches: SizePatch[] = [];
  const rewrites: { at: number; value: number }[] = [];
  const offsetTables: OffsetTable[] = [];

  const matrixCode = options.insertMatrix === 'bt709' ? MATRIX_BT709 : MATRIX_SMPTE170M;

  // Walk the moov subtree, collecting the edits each video track needs.
  const walk = (start: number, end: number, ancestors: Box[]): void => {
    let off = start;
    while (off + 8 <= end) {
      const box = readBox(view, off, end);
      if (!box) return;
      if (CONTAINER_BOXES.has(box.type)) {
        walk(box.bodyStart, box.start + box.size, [...ancestors, box]);
      } else if (box.type === 'stsd') {
        visitStsd(view, box, ancestors, insertions, sizePatches, rewrites, matrixCode);
      } else if (box.type === 'stco' || box.type === 'co64') {
        const entryCount = view.getUint32(box.bodyStart + 4);
        offsetTables.push({
          entriesStart: box.bodyStart + 8,
          entryCount,
          entrySize: box.type === 'stco' ? 4 : 8,
        });
      }
      off += box.size;
    }
  };
  walk(moov.bodyStart, moov.start + moov.size, [moov]);

  if (insertions.length === 0 && rewrites.length === 0) return null;

  // Rebuild the buffer with insertions applied (positions are ascending by
  // construction: the walk visits boxes in file order).
  insertions.sort((a, b) => a.at - b.at);
  const growth = (pos: number): number =>
    insertions.reduce((acc, ins) => (ins.at <= pos ? acc + ins.bytes.length : acc), 0);
  const totalGrowth = growth(Number.POSITIVE_INFINITY);

  const out = new Uint8Array(buf.length + totalGrowth);
  const outView = new DataView(out.buffer);
  let cursor = 0;
  let read = 0;
  for (const ins of insertions) {
    out.set(buf.subarray(read, ins.at), cursor);
    cursor += ins.at - read;
    out.set(ins.bytes, cursor);
    cursor += ins.bytes.length;
    read = ins.at;
  }
  out.set(buf.subarray(read), cursor);

  // Grow ancestor size fields. A box's size field sits before anything
  // inserted inside it, but earlier insertions in sibling tracks can shift it.
  for (const patch of sizePatches) {
    const at = patch.at + growth(patch.at - 1);
    outView.setUint32(at, outView.getUint32(at) + patch.delta);
  }
  // Rewrite primaries/transfer of existing colr boxes.
  for (const rw of rewrites) {
    outView.setUint16(rw.at + growth(rw.at - 1), rw.value);
  }
  // Chunk offsets pointing into the shifted region move with it. (Chrome's
  // fragmented output uses moof-relative offsets and an empty stco, but
  // non-fragmented files — e.g. Safari's MediaRecorder — rely on stco/co64.)
  for (const table of offsetTables) {
    for (let i = 0; i < table.entryCount; i++) {
      const at = table.entriesStart + i * table.entrySize + growth(table.entriesStart - 1);
      if (table.entrySize === 4) {
        outView.setUint32(at, outView.getUint32(at) + growth(outView.getUint32(at) - 1));
      } else {
        const v = outView.getBigUint64(at);
        outView.setBigUint64(at, v + BigInt(growth(Number(v) - 1)));
      }
    }
  }
  return out.buffer as ArrayBuffer;
}

/** Apply colr rewrite/insert edits for every video sample entry in an stsd. */
function visitStsd(
  view: DataView,
  stsd: Box,
  ancestors: Box[],
  insertions: Insertion[],
  sizePatches: SizePatch[],
  rewrites: { at: number; value: number }[],
  matrixCode: number,
): void {
  const entryCount = view.getUint32(stsd.bodyStart + 4);
  let off = stsd.bodyStart + 8;
  const stsdEnd = stsd.start + stsd.size;
  for (let i = 0; i < entryCount && off + 8 <= stsdEnd; i++) {
    const entry = readBox(view, off, stsdEnd);
    if (!entry) return;
    if (VIDEO_SAMPLE_ENTRIES.has(entry.type)) {
      const childrenStart = entry.bodyStart + SAMPLE_ENTRY_HEADER;
      const entryEnd = entry.start + entry.size;
      let colr: Box | null = null;
      let child = childrenStart;
      while (child + 8 <= entryEnd) {
        const box = readBox(view, child, entryEnd);
        if (!box) break;
        if (box.type === 'colr') {
          colr = box;
          break;
        }
        child += box.size;
      }
      if (colr) {
        // Keep matrix + range (encoding facts); declare sRGB content.
        rewrites.push({ at: colr.bodyStart + 4, value: PRIMARIES_BT709 });
        rewrites.push({ at: colr.bodyStart + 6, value: TRANSFER_SRGB });
      } else {
        // Growing a box requires patching its u32 size field — impossible for
        // largesize (64-bit) boxes. They never occur in our export pipelines;
        // skip rather than risk corruption if one shows up.
        const chain = [...ancestors, stsd, entry];
        if (chain.every((b) => b.headerSize === 8)) {
          const colrBox = buildColrBox(matrixCode);
          insertions.push({ at: entryEnd, bytes: colrBox });
          for (const ancestor of chain) {
            sizePatches.push({ at: ancestor.start, delta: colrBox.length });
          }
        }
      }
    }
    off += entry.size;
  }
}

function buildColrBox(matrixCode: number): Uint8Array {
  const box = new Uint8Array(19);
  const view = new DataView(box.buffer);
  view.setUint32(0, 19);
  box.set([0x63, 0x6f, 0x6c, 0x72], 4); // 'colr'
  box.set([0x6e, 0x63, 0x6c, 0x78], 8); // 'nclx'
  view.setUint16(12, PRIMARIES_BT709);
  view.setUint16(14, TRANSFER_SRGB);
  view.setUint16(16, matrixCode);
  box[18] = 0; // full_range_flag = 0 (limited/TV range, as encoded)
  return box;
}

function topLevelBoxes(view: DataView): Box[] {
  const boxes: Box[] = [];
  let off = 0;
  while (off + 8 <= view.byteLength) {
    const box = readBox(view, off, view.byteLength);
    if (!box) break;
    boxes.push(box);
    off += box.size;
  }
  return boxes;
}

function readBox(view: DataView, start: number, parentEnd: number): Box | null {
  if (start + 8 > parentEnd) return null;
  let size = view.getUint32(start);
  let headerSize = 8;
  if (size === 1) {
    if (start + 16 > parentEnd) return null;
    const large = view.getBigUint64(start + 8);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(large);
    headerSize = 16;
  } else if (size === 0) {
    size = parentEnd - start;
  }
  if (size < headerSize || start + size > parentEnd) return null;
  const type = String.fromCharCode(
    view.getUint8(start + 4),
    view.getUint8(start + 5),
    view.getUint8(start + 6),
    view.getUint8(start + 7),
  );
  return { start, size, type, bodyStart: start + headerSize, headerSize };
}
