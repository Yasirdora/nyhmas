import { useEffect, useRef } from 'react';
import { Dropzone } from './components/Dropzone';
import { EffectPicker } from './components/EffectPicker';
import { ExportPanel } from './components/ExportPanel';
import { OverlayPanel } from './components/OverlayPanel';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { TransportBar } from './components/TransportBar';
import { AppController } from './lib/AppController';

/**
 * The playground is a single-page imperative surface: AppController binds
 * global listeners and owns the engine for the app's lifetime, so we mount it
 * once and never tear it down (no StrictMode double-mount by design). All
 * markup exists before the effect runs, which is what the controller's
 * id-based lookups rely on.
 */
export function App() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const app = new AppController(stageRef.current!);
    void app.start();
  }, []);

  return (
    <main className="stage">
      {/* Engine canvas mounts here. */}
      <div ref={stageRef} id="stage-root" className="stage-root" />

      {/* UI overlay: pointer-events pass through to the canvas except on controls. */}
      <div className="ui">
        <TopBar />
        <Dropzone />
        <TransportBar />
        <EffectPicker />
        <ExportPanel />
        <OverlayPanel />
        <Toast />
      </div>

      <div id="fps" className="fps" aria-hidden="true" />
    </main>
  );
}
