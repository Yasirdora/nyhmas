import type { Effect, EffectMeta } from '../engine/effects/Effect';

/** Factory that builds an effect instance at a given size. */
export type EffectFactory = (width: number, height: number) => Effect;

/**
 * A registry entry. `meta` is available without loading the effect (so the
 * picker renders instantly), while `load` dynamically imports the effect — each
 * one is its own Vite chunk, fetched only when selected. This is what keeps the
 * initial bundle small as the library grows toward 100+ effects.
 */
export interface EffectEntry {
  meta: EffectMeta;
  load: () => Promise<EffectFactory>;
}

export const EFFECTS: EffectEntry[] = [
  {
    meta: {
      id: 'gold-particles',
      title: 'Gold',
      kind: '3d',
      description: 'Heart-shaped noise field that expands on bass and sparkles on treble.',
    },
    load: async () => {
      const { GoldParticles } = await import('../effects/goldParticles');
      return (w, h) => new GoldParticles(w, h);
    },
  },
  {
    meta: {
      id: 'orb',
      title: 'Orb',
      kind: '3d',
      description: 'A sphere of light that listens — breathing with the bass, singing in gold.',
    },
    load: async () => {
      const { Orb } = await import('../effects/orb');
      return (w, h) => new Orb(w, h);
    },
  },
  {
    meta: {
      id: 'galaxy',
      title: 'Galaxy',
      kind: '3d',
      description: 'A black hole wrapped in a swirling galaxy — stars, dust and light in orbit.',
    },
    load: async () => {
      const { Galaxy } = await import('../effects/galaxy');
      return (w, h) => new Galaxy(w, h);
    },
  },
  {
    meta: {
      id: 'aura',
      title: 'Aura',
      kind: '3d',
      description: 'A sphere of flowing light — luminous currents swirling like slow silk.',
    },
    load: async () => {
      const { Aura } = await import('../effects/aura');
      return (w, h) => new Aura(w, h);
    },
  },
];

export const DEFAULT_EFFECT_ID = EFFECTS[0]!.meta.id;

export function getEntry(id: string): EffectEntry {
  return EFFECTS.find((e) => e.meta.id === id) ?? EFFECTS[0]!;
}
