// Minimal top bar: wordmark + the active effect's name. Purely presentational;
// the controller sets #effect-name. Hidden until a track is loaded.
export function TopBar() {
  return (
    <header id="topbar" className="topbar" hidden>
      <span className="wordmark">NYHMAS</span>
      <span id="effect-name" className="effect-name eyebrow" aria-live="polite" />
    </header>
  );
}
