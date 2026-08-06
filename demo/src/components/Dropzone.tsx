// The entry point: a frosted card over the live stage. Drag audio anywhere, or
// browse / try the demo. The controller wires the interactions and toggles
// `.is-dragging` and `.is-hidden`.
export function Dropzone() {
  return (
    <div id="dropzone" className="dropzone">
      <div className="veil" />
      <div id="dz-card" className="card glass">
        <p className="eyebrow">NYHMAS</p>
        <h1 className="title">Drop a track to begin</h1>
        <p className="sub">
          Upload any audio and watch it become a living visual — then export it as video.
        </p>

        <div className="actions">
          <button id="browse-btn" className="btn btn-primary" type="button">
            Choose audio…
          </button>
          <button id="demo-btn" className="btn" type="button">
            Try the demo
          </button>
        </div>

        <p id="dz-status" className="status" role="status" aria-live="polite" />
        <p className="formats">MP3 · WAV · OGG · FLAC · M4A · AAC</p>

        <input id="file-input" type="file" accept="audio/*" hidden />
      </div>
    </div>
  );
}
