/**
 * Show/hide lifecycle for the app's modal sheets (picker, overlays, export).
 *
 * One class owns the whole pattern so the behavior can't drift between dialogs:
 *
 *   open()   — unhide immediately, animate `.is-open` on the next frame, move
 *              focus inside, and mark the trigger `aria-expanded`.
 *   close()  — start the fade-out, return focus to the trigger, and only hide
 *              the element after the CSS transition (320ms) has finished.
 *
 * The hide timer is cancelable: a close→reopen within the transition window no
 * longer strands the dialog in `hidden` while logically open (the previous
 * per-controller timeouts raced). Escape and `[data-close]` clicks are wired
 * here as well, and `canClose` lets a dialog veto closing (e.g. mid-export).
 */

/** Matches `--dur-med` in tokens.css — the sheet's fade-out transition. */
const HIDE_AFTER_MS = 320;

export interface DialogOptions {
  /** The button that opens the dialog: gets `aria-expanded` and focus on close. */
  trigger?: HTMLElement | null;
  /** Resolved each time the dialog opens; the result receives focus. */
  initialFocus?: () => HTMLElement | null;
  /** Return false to veto closing (Escape, scrim, close button). */
  canClose?: () => boolean;
}

export class Dialog {
  private hideTimer = 0;
  /** Logical open state — guards the async open frame against rapid toggles. */
  private openState = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: DialogOptions = {},
  ) {
    for (const el of this.root.querySelectorAll('[data-close]')) {
      el.addEventListener('click', () => this.close());
    }
    document.addEventListener('keydown', this.onKeydown);
  }

  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (!this.openState) return;
    if (e.key === 'Escape') this.close();
    if (e.key === 'Tab') this.trapFocus(e);
  };

  /** Keep Tab cycling inside the sheet while it's modal. */
  private trapFocus(e: KeyboardEvent): void {
    const focusable = [
      ...this.root.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !this.root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !this.root.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  /** Remove the document-level listener (dialogs are app-lifetime today). */
  dispose(): void {
    document.removeEventListener('keydown', this.onKeydown);
    window.clearTimeout(this.hideTimer);
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(): void {
    window.clearTimeout(this.hideTimer);
    this.openState = true;
    this.root.hidden = false;
    this.options.trigger?.setAttribute('aria-expanded', 'true');
    // Wait a frame so the browser paints the unhidden sheet before the
    // transition class lands — otherwise the open animation is skipped.
    requestAnimationFrame(() => {
      if (!this.openState) return; // closed again before the frame ran
      this.root.classList.add('is-open');
      this.options.initialFocus?.()?.focus();
    });
  }

  /**
   * Close the dialog. `force` skips the canClose veto; `focusOverride` receives
   * focus instead of the trigger (used when recording starts: focus must land
   * on the transport's stop control, not the Export button).
   */
  close(force = false, focusOverride?: HTMLElement): void {
    if (!force && this.options.canClose && !this.options.canClose()) return;
    this.openState = false;
    this.root.classList.remove('is-open');
    this.options.trigger?.setAttribute('aria-expanded', 'false');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.root.hidden = true;
    }, HIDE_AFTER_MS);
    (focusOverride ?? this.options.trigger)?.focus();
  }
}
