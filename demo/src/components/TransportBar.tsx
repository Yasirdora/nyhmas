// Bottom-docked frosted transport. The controller binds play/pause, the
// scrubber (0–1000 → seconds), the time labels, and the Effects/Export buttons.
// Hidden until a track is loaded.
import type { CSSProperties } from 'react';

export function TransportBar() {
  return (
    <div id="transport-wrap" className="wrap" hidden>
      {/* biome-ignore lint/a11y/useSemanticElements: labelled control group for playback; a fieldset would bring unwanted form semantics */}
      <div className="transport glass" role="group" aria-label="Playback controls">
        <button
          id="play-btn"
          className="btn btn-icon play"
          type="button"
          aria-label="Play"
          aria-pressed="false"
        >
          <svg className="icon icon-play" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
          </svg>
          <svg className="icon icon-pause" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" fill="currentColor" />
          </svg>
          <svg className="icon icon-stop" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
          </svg>
        </button>

        <span id="time-current" className="time">
          0:00
        </span>

        <input
          id="scrubber"
          className="scrubber"
          type="range"
          min="0"
          max="1000"
          defaultValue="0"
          step="1"
          aria-label="Seek"
          style={{ '--progress': '0%' } as CSSProperties}
        />

        <span id="time-total" className="time time-total">
          0:00
        </span>

        <div className="divider" aria-hidden="true" />

        <button
          id="titles-btn"
          className="btn ghost"
          type="button"
          aria-haspopup="dialog"
          aria-expanded="false"
        >
          Titles
        </button>
        <button
          id="effects-btn"
          className="btn ghost"
          type="button"
          aria-haspopup="dialog"
          aria-expanded="false"
        >
          Effects
        </button>
        <button
          id="export-btn"
          className="btn ghost"
          type="button"
          disabled
          aria-haspopup="dialog"
          aria-expanded="false"
        >
          Export
        </button>
      </div>
    </div>
  );
}
