import { describe, expect, it } from 'vitest';
import { cueAt, parseSrt } from './srt';

const BASIC = `1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:04,000 --> 00:00:06,000
Second line
`;

describe('parseSrt', () => {
  it('parses basic cues with correct times', () => {
    const cues = parseSrt(BASIC);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 3.5, text: 'Hello world' });
    expect(cues[1]?.text).toBe('Second line');
  });

  it('handles CRLF line endings and BOM', () => {
    const crlf = `﻿${BASIC.replace(/\n/g, '\r\n')}`;
    const cues = parseSrt(crlf);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.text).toBe('Hello world');
  });

  it('joins multi-line cue text and strips markup tags', () => {
    const srt = `1
00:01:00,250 --> 00:01:02,000
<b>Bold line</b>
and a second line`;
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.start).toBeCloseTo(60.25, 3);
    expect(cues[0]?.text).toBe('Bold line\nand a second line');
  });

  it('sorts cues by start time and skips malformed blocks', () => {
    const srt = `2
00:00:10,000 --> 00:00:12,000
Later

garbage block
not a timestamp

1
00:00:02,000 --> 00:00:04,000
Earlier`;
    const cues = parseSrt(srt);
    expect(cues.map((c) => c.text)).toEqual(['Earlier', 'Later']);
  });

  it('returns empty for empty/nonsense input', () => {
    expect(parseSrt('')).toEqual([]);
    expect(parseSrt('just some text')).toEqual([]);
  });
});

describe('cueAt', () => {
  const cues = parseSrt(BASIC);

  it('finds the active cue', () => {
    expect(cueAt(cues, 2)?.text).toBe('Hello world');
    expect(cueAt(cues, 5)?.text).toBe('Second line');
  });

  it('returns null in gaps and outside the range', () => {
    expect(cueAt(cues, 0.5)).toBeNull();
    expect(cueAt(cues, 3.75)).toBeNull();
    expect(cueAt(cues, 99)).toBeNull();
  });
});
