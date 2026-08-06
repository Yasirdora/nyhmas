// Minimal glass toast for transient confirmations (e.g. "Saved video.mp4").
// The controller sets the text and toggles `.is-visible`; it auto-hides.
export function Toast() {
  return <div id="toast" className="toast glass" role="status" aria-live="polite" />;
}
