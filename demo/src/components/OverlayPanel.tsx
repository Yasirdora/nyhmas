// "Titles & lyrics" dialog: title/subtitle text and an SRT lyrics upload.
// Everything here renders into the overlay canvas, so it appears live AND in
// exported videos. The controller binds inputs and toggles `.is-open`.
export function OverlayPanel() {
  return (
    <div
      id="overlays"
      className="overlays"
      role="dialog"
      aria-modal="true"
      aria-label="Titles and lyrics"
      hidden
    >
      <div className="scrim" data-close="" />
      <div className="sheet glass" role="document">
        <div className="head">
          <p className="eyebrow">Titles &amp; lyrics</p>
          <button
            id="overlays-close"
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

        <div className="field">
          <label htmlFor="overlay-title" className="field-label">
            Title
          </label>
          <input
            id="overlay-title"
            type="text"
            placeholder="Your track or album title"
            maxLength={80}
          />
        </div>

        <div className="field">
          <label htmlFor="overlay-subtitle" className="field-label">
            Subtitle
          </label>
          <input
            id="overlay-subtitle"
            type="text"
            placeholder="e.g. Cinematic Experience"
            maxLength={80}
          />
        </div>

        <div className="field">
          <span className="field-label">Lyrics</span>
          <div className="lyrics-row">
            <button id="lyrics-btn" className="btn" type="button">
              Upload lyrics (.srt)
            </button>
            <button id="lyrics-clear" className="btn ghost" type="button" hidden>
              Clear
            </button>
            <span id="lyrics-status" className="lyrics-status" role="status" aria-live="polite" />
          </div>
          <input id="lyrics-input" type="file" accept=".srt,text/plain" hidden />
        </div>

        <p className="section eyebrow">Branding</p>

        <div className="card-row">
          <div className="card-header">
            <div className="card-input-row">
              <input
                id="badge-text"
                type="text"
                className="card-inline-input"
                placeholder="listen for free on"
                maxLength={40}
                defaultValue="listen for free on"
                aria-label="Badge helper text"
              />
              <input
                id="badge-enabled"
                type="checkbox"
                className="switch"
                aria-label="Show listen-on badge"
              />
            </div>
          </div>
          <div className="card-details">
            <div className="badge-brands">
              <label className="brand-check">
                <input id="badge-spotify" type="checkbox" defaultChecked />
                Spotify
              </label>
              <label className="brand-check">
                <input id="badge-apple" type="checkbox" defaultChecked />
                Apple Music
              </label>
            </div>
          </div>
        </div>

        <div className="card-row">
          <div className="card-header">
            <div className="card-input-row">
              <input
                id="footer-text"
                type="text"
                className="card-inline-input"
                placeholder="Shows the track name"
                maxLength={80}
                aria-label="Footer track name"
              />
              <input
                id="footer-enabled"
                type="checkbox"
                className="switch"
                aria-label="Show now-playing footer"
              />
            </div>
          </div>
        </div>

        <label className="switch-row">
          <span>Brand logo</span>
          <input id="logo-enabled" type="checkbox" className="switch" defaultChecked />
        </label>

        <p className="fineprint">
          The title appears near the start of the track, then fades. Lyrics follow the timestamps in
          your SRT file. The badge cycles Spotify and Apple Music like the original — everything
          here is burned into exports.
        </p>
      </div>
    </div>
  );
}
