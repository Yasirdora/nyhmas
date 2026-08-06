/**
 * SRT subtitle parsing — ported from the original prototype's inline parser
 * and made pure/testable. Cue times are in seconds.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** "00:00:57,966" → seconds. Accepts a period as the millisecond separator too. */
function parseTime(timeString: string): number {
  const [hms, ms] = timeString.replace('.', ',').split(',');
  const parts = (hms ?? '').split(':').map(Number);
  const [h, m, s] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  return h * 3600 + m * 60 + s + Number.parseInt(ms ?? '0', 10) / 1000;
}

const CUE_RE =
  /(\d+)\r?\n(\d{2}:\d{2}:\d{2}[,.]\d{3}) --> (\d{2}:\d{2}:\d{2}[,.]\d{3})[^\n]*\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n*$)/g;

/**
 * Parse SRT text into cues sorted by start time. Tolerant of CRLF, BOM,
 * trailing whitespace, and simple markup tags (stripped). Malformed blocks
 * are skipped rather than throwing.
 */
export function parseSrt(srtText: string): Cue[] {
  const clean = srtText.replace(/^﻿/, '').trim();
  const cues: Cue[] = [];

  CUE_RE.lastIndex = 0;
  let match = CUE_RE.exec(clean);
  while (match !== null) {
    const start = parseTime(match[2] ?? '');
    const end = parseTime(match[3] ?? '');
    const text = (match[4] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, '')
      .trim();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && text.length > 0) {
      cues.push({ start, end, text });
    }
    match = CUE_RE.exec(clean);
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

/** The active cue at time `t`, or null. Cues are assumed sorted by start. */
export function cueAt(cues: Cue[], t: number): Cue | null {
  for (const cue of cues) {
    if (t < cue.start) break;
    if (t <= cue.end) return cue;
  }
  return null;
}
