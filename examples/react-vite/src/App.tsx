import { useEffect, useRef, useState } from 'react';
import { createVisualizer, type Visualizer } from 'nyhmas';

const EFFECTS = ['gold-particles', 'orb', 'galaxy', 'aura'] as const;

export function App() {
  const stageRef = useRef<HTMLDivElement>(null);
  const vizRef = useRef<Visualizer | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    createVisualizer(stageRef.current!, { effect: EFFECTS[0] }).then((viz) => {
      // React StrictMode mounts effects twice in dev — dispose the orphan.
      if (cancelled) {
        viz.dispose();
        return;
      }
      vizRef.current = viz;
      viz.start();
      setReady(true);
    });

    return () => {
      cancelled = true;
      vizRef.current?.dispose();
      vizRef.current = undefined;
    };
  }, []);

  const onEffectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void vizRef.current?.setEffect(e.target.value);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vizRef.current) return;
    await vizRef.current.loadTrack(file);
    await vizRef.current.play();
    setPlaying(true);
  };

  const togglePlay = async () => {
    const viz = vizRef.current;
    if (!viz) return;
    if (playing) {
      viz.pause();
      setPlaying(false);
    } else {
      await viz.play();
      setPlaying(true);
    }
  };

  return (
    <>
      <div ref={stageRef} className="stage" />
      <div className="controls">
        <select onChange={onEffectChange} disabled={!ready} aria-label="Effect">
          {EFFECTS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <input type="file" accept="audio/*" onChange={onFile} aria-label="Load audio track" />
        <button onClick={togglePlay} disabled={!ready}>
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
    </>
  );
}
