/**
 * Compact in-place iterative radix-2 Cooley–Tukey FFT.
 *
 * Used by the offline (export) audio path to compute a spectrum per frame
 * deterministically — the live AnalyserNode only works in real time. Arrays
 * must have a power-of-two length; `re`/`im` are transformed in place.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const rb = re[b]!;
        const ib = im[b]!;
        const tr = cwr * rb - cwi * ib;
        const ti = cwr * ib + cwi * rb;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = ncwr;
      }
    }
  }
}

/**
 * Blackman window — what the Web Audio spec (and Chrome's AnalyserNode) uses.
 * Matching it keeps offline export reactions identical to live playback.
 */
export function blackman(i: number, n: number): number {
  const x = (2 * Math.PI * i) / n;
  return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
}
