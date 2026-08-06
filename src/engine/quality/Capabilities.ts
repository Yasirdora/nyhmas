import type { QualityTier } from '../types';

/**
 * Device capability probe. Runs once at boot to pick a starting quality tier
 * and pixel-ratio ceiling. The QualityManager then does the fine, per-frame
 * adaptation — this only sets sane defaults so we don't start too hot on a
 * weak GPU or too cold on a strong one.
 */
export interface Capabilities {
  /** WebGPU is present (reserved for the future WebGPU backend seam). */
  webgpu: boolean;
  isMobile: boolean;
  /** Raw devicePixelRatio. */
  dpr: number;
  /** Pixel-ratio ceiling we allow the renderer to use. */
  maxPixelRatio: number;
  /** Starting quality tier. */
  initialTier: QualityTier;
}

export function detectCapabilities(): Capabilities {
  const nav = navigator;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(nav.userAgent);
  const dpr = window.devicePixelRatio || 1;
  const webgpu = typeof (nav as { gpu?: unknown }).gpu !== 'undefined';

  // Mid-range default: cap pixel ratio at 2, start desktops high and phones
  // medium. Adaptive resolution drops from there under load; 'low' is only
  // reached when adaptation bottoms out.
  const initialTier: QualityTier = isMobile ? 'medium' : 'high';

  return {
    webgpu,
    isMobile,
    dpr,
    maxPixelRatio: 2,
    initialTier,
  };
}
