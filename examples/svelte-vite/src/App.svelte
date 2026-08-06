<script lang="ts">
  import { onMount } from 'svelte';
  import { createVisualizer, type Visualizer } from 'nyhmas';

  const EFFECTS = ['gold-particles', 'orb', 'galaxy', 'aura'];

  let stage: HTMLDivElement;
  let viz: Visualizer | undefined;
  let ready = $state(false);
  let playing = $state(false);

  onMount(() => {
    let cancelled = false;

    createVisualizer(stage, { effect: EFFECTS[0] }).then((v) => {
      if (cancelled) {
        v.dispose();
        return;
      }
      viz = v;
      viz.start();
      ready = true;
    });

    return () => {
      cancelled = true;
      viz?.dispose();
      viz = undefined;
    };
  });

  function onEffectChange(e: Event) {
    void viz?.setEffect((e.currentTarget as HTMLSelectElement).value);
  }

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !viz) return;
    await viz.loadTrack(file);
    await viz.play();
    playing = true;
  }

  async function togglePlay() {
    if (!viz) return;
    if (playing) {
      viz.pause();
      playing = false;
    } else {
      await viz.play();
      playing = true;
    }
  }
</script>

<div bind:this={stage} class="stage"></div>

<div class="controls">
  <select onchange={onEffectChange} disabled={!ready} aria-label="Effect">
    {#each EFFECTS as id}
      <option value={id}>{id}</option>
    {/each}
  </select>
  <input type="file" accept="audio/*" onchange={onFile} aria-label="Load audio track" />
  <button onclick={togglePlay} disabled={!ready}>
    {playing ? 'Pause' : 'Play'}
  </button>
</div>
