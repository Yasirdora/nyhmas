const closeIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

// Frosted overlay for switching effects. The controller fills #picker-list from
// the registry (so it needs no per-effect markup) and toggles `.is-open`.
export function EffectPicker() {
  return (
    <div
      id="picker"
      className="picker"
      role="dialog"
      aria-modal="true"
      aria-label="Choose an effect"
      hidden
    >
      <div className="scrim" data-close="" />
      <div className="sheet glass" role="document">
        <div className="head">
          <div>
            <p className="eyebrow">Effects</p>
            <p className="hint">Choose how your track looks. Switching keeps playback going.</p>
          </div>
          <button
            id="picker-close"
            className="btn btn-icon"
            type="button"
            data-close=""
            aria-label="Close"
          >
            {closeIcon}
          </button>
        </div>
        <div id="picker-list" className="grid" />
      </div>
    </div>
  );
}
