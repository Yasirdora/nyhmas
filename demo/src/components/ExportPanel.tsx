// Export dialog. "Record" captures the live show in real time; "Fast render"
// (where WebCodecs is available) renders deterministically, faster than real
// time. The controller binds the start button and updates the status + REC dot.
// Stopping a recording lives in the transport: the play button becomes the
// pulsing red stop-and-save control while the panel is closed.
export function ExportPanel() {
  return (
    <div
      id="export"
      className="export"
      role="dialog"
      aria-modal="true"
      aria-label="Export video"
      hidden
    >
      <div className="scrim" data-close="" />
      <div className="sheet glass" role="document">
        <div className="head">
          <p className="eyebrow">Export video</p>
          <button
            id="export-close"
            className="btn btn-icon"
            type="button"
            data-close=""
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <p className="lead">
          Renders your visual and audio together into a video file — all on your device, nothing
          uploaded.
        </p>

        <div id="export-quality" className="quality" role="radiogroup" aria-label="Export mode">
          {/* biome-ignore lint/a11y/useSemanticElements: segmented export-mode control; button radios keep the controller's click handling and styling intact */}
          <button
            className="seg is-selected"
            type="button"
            data-quality="quick"
            role="radio"
            aria-checked="true"
          >
            <span className="seg-title">Record</span>
            <span className="seg-sub">Real time — what you see</span>
          </button>
          {/* biome-ignore lint/a11y/useSemanticElements: segmented export-mode control; button radios keep the controller's click handling and styling intact */}
          <button
            className="seg"
            type="button"
            data-quality="high"
            role="radio"
            aria-checked="false"
          >
            <span className="seg-title">Fast render</span>
            <span className="seg-sub">Same look, faster than real time</span>
          </button>
        </div>

        <div id="export-meta" className="meta">
          <div className="rec-dot" data-state="idle" aria-hidden="true" />
          <span id="export-status" className="status" role="status" aria-live="polite">
            Ready when you are.
          </span>
        </div>

        <div className="actions">
          <button id="export-start" className="btn btn-primary" type="button">
            Start recording
          </button>
        </div>

        <p className="fineprint">
          <strong>Record</strong> captures the visuals live as the track plays — exactly what you
          see. This panel closes so you watch the show; press the red stop button to save (it also
          saves itself when the track ends). Keep this tab visible while recording — background tabs
          freeze the video. <strong>Fast render</strong> produces the same 60fps look as an MP4,
          without waiting for the track to play through. Both stay on your device.
        </p>
      </div>
    </div>
  );
}
