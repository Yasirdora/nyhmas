import {
  AudioEngine,
  Compositor,
  DEFAULT_EFFECT_ID,
  downloadBlob,
  EFFECTS,
  EndReveal,
  Engine,
  getEntry,
  ListenBadge,
  LiveAudioSource,
  Lyrics,
  Monogram,
  NowPlaying,
  OfflineRenderer,
  OverlayLayer,
  offlineExportSupported,
  parseSrt,
  Recorder,
  TitleCard,
} from 'nyhmas';
import { Dialog } from './dialog';

/**
 * The app controller: the single place that wires the engine + audio to the DOM.
 *
 * It owns the Engine, the AudioEngine, and the live audio source, and binds the
 * upload flow, the transport, effect switching, and the picker. UI markup lives
 * in the React components; this only reads/writes their elements by id, so the
 * view stays declarative and the behavior stays in one testable place. Modal
 * show/hide mechanics are delegated to Dialog instances.
 *
 * Everything engine-related comes from the public `nyhmas` package surface
 * (aliased to ../src in dev) — the demo consumes the package like any user would.
 */
export class AppController {
  private readonly engine: Engine;
  private readonly audio: AudioEngine;
  private currentEffectId = DEFAULT_EFFECT_ID;
  private hasTrack = false;
  private scrubbing = false;
  private trackLabel = 'nyhmas';
  private recorder: Recorder | null = null;
  private recording = false;
  private toastTimer = 0;
  private exportQuality: 'high' | 'quick' = 'quick';
  private busy = false;
  /** Aborts an in-flight Fast render (the export button becomes "Cancel"). */
  private exportAbort: AbortController | null = null;

  // Story overlays (burned into exports via the compositor).
  private readonly overlayLayer: OverlayLayer;
  private readonly titleCard = new TitleCard();
  private readonly lyricsItem = new Lyrics();
  private readonly listenBadge = new ListenBadge();
  private readonly nowPlaying = new NowPlaying();
  private readonly monogram = new Monogram();
  private readonly endReveal = new EndReveal();
  private readonly compositor = new Compositor();
  /** Per-feature overlay switches (title/lyrics are always eligible). */
  private readonly overlayPrefs = { badge: false, footer: false, logo: true };

  private readonly pickerDialog: Dialog;
  private readonly overlaysDialog: Dialog;
  private readonly exportDialog: Dialog;

  private readonly el: {
    dropzone: HTMLElement;
    fileInput: HTMLInputElement;
    browse: HTMLElement;
    demo: HTMLElement;
    status: HTMLElement;
    topbar: HTMLElement;
    effectName: HTMLElement;
    transportWrap: HTMLElement;
    transport: HTMLElement;
    playBtn: HTMLButtonElement;
    scrubber: HTMLInputElement;
    timeCurrent: HTMLElement;
    timeTotal: HTMLElement;
    effectsBtn: HTMLButtonElement;
    exportBtn: HTMLButtonElement;
    picker: HTMLElement;
    pickerList: HTMLElement;
    exportPanel: HTMLElement;
    exportStart: HTMLButtonElement;
    exportStatus: HTMLElement;
    recDot: HTMLElement;
    toast: HTMLElement;
    titlesBtn: HTMLButtonElement;
    overlayPanel: HTMLElement;

    overlayTitle: HTMLInputElement;
    overlaySubtitle: HTMLInputElement;
    lyricsBtn: HTMLButtonElement;
    lyricsClear: HTMLButtonElement;
    lyricsInput: HTMLInputElement;
    lyricsStatus: HTMLElement;
    badgeEnabled: HTMLInputElement;
    badgeText: HTMLInputElement;
    badgeSpotify: HTMLInputElement;
    badgeApple: HTMLInputElement;
    footerEnabled: HTMLInputElement;
    footerText: HTMLInputElement;
    logoEnabled: HTMLInputElement;
    fps: HTMLElement | null;
  };

  constructor(root: HTMLElement) {
    const transportWrap = byId('transport-wrap');
    const exportPanel = byId('export');
    this.el = {
      dropzone: byId('dropzone'),
      fileInput: byId<HTMLInputElement>('file-input'),
      browse: byId('browse-btn'),
      demo: byId('demo-btn'),
      status: byId('dz-status'),
      topbar: byId('topbar'),
      effectName: byId('effect-name'),
      transportWrap,
      transport: transportWrap.querySelector('.transport') as HTMLElement,
      playBtn: byId<HTMLButtonElement>('play-btn'),
      scrubber: byId<HTMLInputElement>('scrubber'),
      timeCurrent: byId('time-current'),
      timeTotal: byId('time-total'),
      effectsBtn: byId<HTMLButtonElement>('effects-btn'),
      exportBtn: byId<HTMLButtonElement>('export-btn'),
      picker: byId('picker'),
      pickerList: byId('picker-list'),
      exportPanel,
      exportStart: byId<HTMLButtonElement>('export-start'),
      exportStatus: byId('export-status'),
      recDot: exportPanel.querySelector('.rec-dot') as HTMLElement,
      toast: byId('toast'),
      titlesBtn: byId<HTMLButtonElement>('titles-btn'),
      overlayPanel: byId('overlays'),

      overlayTitle: byId<HTMLInputElement>('overlay-title'),
      overlaySubtitle: byId<HTMLInputElement>('overlay-subtitle'),
      lyricsBtn: byId<HTMLButtonElement>('lyrics-btn'),
      lyricsClear: byId<HTMLButtonElement>('lyrics-clear'),
      lyricsInput: byId<HTMLInputElement>('lyrics-input'),
      lyricsStatus: byId('lyrics-status'),
      badgeEnabled: byId<HTMLInputElement>('badge-enabled'),
      badgeText: byId<HTMLInputElement>('badge-text'),
      badgeSpotify: byId<HTMLInputElement>('badge-spotify'),
      badgeApple: byId<HTMLInputElement>('badge-apple'),
      footerEnabled: byId<HTMLInputElement>('footer-enabled'),
      footerText: byId<HTMLInputElement>('footer-text'),
      logoEnabled: byId<HTMLInputElement>('logo-enabled'),
      fps: document.getElementById('fps'),
    };

    this.engine = new Engine(root, {
      onStats: (s) => {
        if (this.el.fps && import.meta.env.DEV) {
          this.el.fps.textContent = `${s.fps.toFixed(0)} fps · ${Math.round(s.scale * 100)}%`;
        }
      },
    });

    this.audio = new AudioEngine();
    this.audio.onEnded = () => this.handleEnded();
    this.engine.setAudioSource(new LiveAudioSource(this.audio));

    // Overlay layer: a 2D canvas above the WebGL stage, driven by the engine.
    this.overlayLayer = new OverlayLayer(root, 2);
    this.overlayLayer.setItems([
      this.titleCard,
      this.lyricsItem,
      this.listenBadge,
      this.nowPlaying,
      this.monogram,
      this.endReveal,
    ]);
    this.engine.setOverlay(this.overlayLayer);

    this.pickerDialog = new Dialog(this.el.picker, {
      trigger: this.el.effectsBtn,
      initialFocus: () =>
        this.el.pickerList.querySelector<HTMLElement>('.effect-card.is-active') ??
        this.el.pickerList.querySelector<HTMLElement>('.effect-card'),
    });
    this.overlaysDialog = new Dialog(this.el.overlayPanel, {
      trigger: this.el.titlesBtn,
      initialFocus: () => this.el.overlayTitle,
    });
    this.exportDialog = new Dialog(this.el.exportPanel, {
      trigger: this.el.exportBtn,
      initialFocus: () => this.el.exportStart,
      canClose: () => !this.isExportBusy(),
    });

    this.bindUpload();
    this.bindTransport();
    this.bindPicker();
    this.bindExport();
    this.bindOverlays();
    this.bindKeyboard();
    this.bindVisibility();
  }

  /**
   * Single source of truth for whether the render loop runs. It runs only
   * while audio plays (or a recording must capture frames) and the tab is
   * visible — otherwise it stops and leaves a frozen frame, costing zero
   * GPU/CPU. Offline export drives frames manually, so it's left alone.
   */
  private syncLoop(): void {
    if (this.busy) return;
    const shouldRun = (this.audio.isPlaying || this.recording) && !document.hidden;
    if (shouldRun) {
      this.engine.start();
      return;
    }
    this.engine.stop();
    // Show the current state as a frozen frame (skip when tab is hidden).
    if (!document.hidden && this.hasTrack) this.engine.renderStill();
  }

  private bindVisibility(): void {
    document.addEventListener('visibilitychange', () => {
      // A live recording must keep capturing; the browser throttles hidden
      // tabs anyway, so don't fight it mid-record — warn instead: rAF is
      // suspended, which freezes the captured video while audio continues.
      if (this.recording) {
        if (document.hidden) {
          this.showToast('Keep this tab visible — the recording freezes while it is hidden.');
        }
        return;
      }
      if (this.busy) return;
      this.syncLoop();
    });
  }

  async start(): Promise<void> {
    const params = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
    // `?effect=<id>` starts on a specific effect (dev preview).
    const startId = params?.get('effect');
    if (startId) this.currentEffectId = getEntry(startId).meta.id;

    // The effect is built and ready, but the render loop stays paused until a
    // track is loaded — no GPU/CPU spent animating behind the upload screen.
    try {
      await this.mountEffect(this.currentEffectId);
    } catch (err) {
      // The app still works — uploads and effect switching can recover — so
      // surface the failure instead of dying before any UI is interactive.
      console.error('[boot] default effect failed to load', err);
      this.setStatus('The visual engine failed to load — check your connection and reload.');
    }
    this.startTransportSync();

    if (params) {
      // `?demo` auto-loads the bundled track for a quick preview.
      if (params.has('demo')) void this.loadDemo();
      // Dev preview hooks render the field without a track, so start the loop.
      if (params.get('ui') === 'player') {
        this.previewPlayerChrome();
        this.engine.start();
      }
      if (params.get('ui') === 'export') {
        this.previewPlayerChrome();
        this.hasTrack = true;
        this.engine.start();
        this.openExport();
      }
      if (params.get('ui') === 'picker') {
        this.previewPlayerChrome();
        this.hasTrack = true;
        this.engine.start();
        this.openPicker();
      }
      // Overlay layout preview: title, lyric, badge, and footer pinned visible.
      if (params.get('ui') === 'overlays') {
        this.previewPlayerChrome();
        this.hasTrack = true;
        this.titleCard.title = 'Mah Jan';
        this.titleCard.subtitle = 'Cinematic Experience';
        this.titleCard.timing = { start: -2, inDur: 1, outAt: 9999, outDur: 1 };
        this.lyricsItem.cues = [
          { start: -1, end: 9999, text: 'And the city lights fade into gold' },
        ];
        this.overlayPrefs.badge = true;
        this.overlayPrefs.footer = true;
        this.overlayPrefs.logo = true;
        this.applyOverlayPrefs();
        this.listenBadge.timing = { start: -2, inDur: 1, outAt: 9999, outDur: 1 };
        this.nowPlaying.timing = { start: -2, inDur: 1, outAt: 9999, outDur: 1 };
        this.nowPlaying.trackName = 'Golden Hour — Demo Mix';
        // Pin the monogram mid-HOLD so the drawn logo is visible at t=0.
        this.monogram.timing = { start: -35, inDur: 0.1, outAt: 9999, outDur: 1 };
        this.engine.start();
      }
      // End-reveal finale preview, pinned mid-sequence.
      if (params.get('ui') === 'endlogo') {
        this.previewPlayerChrome();
        this.hasTrack = true;
        this.overlayPrefs.logo = true;
        this.applyOverlayPrefs();
        this.endReveal.forceTau = 3.5;
        this.engine.start();
      }
      // Recording-state layout preview (no real MediaRecorder involved).
      if (params.get('ui') === 'recording') {
        this.previewPlayerChrome();
        this.hasTrack = true;
        this.engine.start();
        this.el.playBtn.classList.add('is-recording');
        this.el.playBtn.setAttribute('aria-label', 'Stop recording and save');
        this.el.transport.classList.add('is-recording');
        this.el.scrubber.disabled = true;
        this.el.exportBtn.disabled = true;
        this.showToast('Saved demo.webm (12.3 MB)');
      }
      // `?selftest=export` runs a 2s offline render end-to-end (dev CI smoke).
      if (params.get('selftest') === 'export') {
        void this.runExportSelfTest();
      }
    }
  }

  /**
   * Dev-only end-to-end check of the offline export pipeline: renders a 2s
   * stereo tone through OfflineRenderer and reports the resulting MP4 size in
   * the status line and document title (headless QA reads it from there).
   */
  private async runExportSelfTest(): Promise<void> {
    if (!offlineExportSupported()) {
      document.title = 'SELFTEST SKIP: WebCodecs unavailable';
      this.setStatus(document.title);
      return;
    }
    const sampleRate = 44_100;
    const length = sampleRate * 2; // 2 seconds
    const buffer = this.audio.ctx.createBuffer(2, length, sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
      }
    }
    try {
      const { blob, filename } = await new OfflineRenderer(this.engine, buffer).render('selftest');
      // Re-open the file and validate its structure: duration + both tracks.
      const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const duration = await input.computeDuration();
      const video = await input.getPrimaryVideoTrack();
      const audio = await input.getPrimaryAudioTrack();
      const spec = video
        ? `${await video.getCodec()} ${await video.getDisplayWidth()}x${await video.getDisplayHeight()}`
        : 'no-video';
      const msg = `SELFTEST OK: ${filename} · ${(blob.size / 1024).toFixed(0)} KB · ${duration.toFixed(2)}s · ${spec} · ${audio ? await audio.getCodec() : 'no-audio'}`;
      document.title = msg;
      this.setStatus(msg);
    } catch (err) {
      const msg = `SELFTEST FAIL: ${err instanceof Error ? err.message : String(err)}`;
      document.title = msg;
      this.setStatus(msg);
      console.error('[selftest]', err);
    }
  }

  private previewPlayerChrome(): void {
    this.el.dropzone.classList.add('is-hidden');
    this.el.topbar.hidden = false;
    this.el.transportWrap.hidden = false;
    this.el.effectName.textContent = getEntry(this.currentEffectId).meta.title;
    this.el.timeCurrent.textContent = '1:12';
    this.el.timeTotal.textContent = '3:48';
    this.el.scrubber.value = '320';
    this.setProgress(32);
  }

  // ---- Upload ------------------------------------------------------------

  private bindUpload(): void {
    this.el.browse.addEventListener('click', () => this.el.fileInput.click());
    this.el.fileInput.addEventListener('change', () => {
      const file = this.el.fileInput.files?.[0];
      if (file) void this.loadFile(file);
    });
    this.el.demo.addEventListener('click', () => void this.loadDemo());

    // Drag & drop anywhere while the dropzone is visible.
    const dz = this.el.dropzone;
    const setDragging = (on: boolean) => dz.classList.toggle('is-dragging', on);
    for (const ev of ['dragenter', 'dragover']) {
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        setDragging(true);
      });
    }
    for (const ev of ['dragleave', 'dragend']) {
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        if (e.target === dz) setDragging(false);
      });
    }
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void this.loadFile(file);
    });
  }

  private async loadDemo(): Promise<void> {
    this.setStatus('Loading demo…');
    try {
      const res = await fetch('/demo/track.mp3');
      if (!res.ok) throw new Error(`demo fetch failed: ${res.status}`);
      const buffer = await res.arrayBuffer();
      await this.decodeAndStart(buffer, 'Demo — Mah Jan');
    } catch {
      this.setStatus('Could not load the demo. Try uploading a file.');
    }
  }

  private async loadFile(file: File): Promise<void> {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)) {
      this.setStatus('That does not look like an audio file.');
      return;
    }
    this.setStatus(`Decoding “${file.name}”…`);
    try {
      const buffer = await file.arrayBuffer();
      await this.decodeAndStart(buffer, cleanName(file.name));
    } catch {
      this.setStatus('Could not decode that file. Try MP3, WAV, or M4A.');
    }
  }

  private async decodeAndStart(buffer: ArrayBuffer, label: string): Promise<void> {
    const decoded = await this.audio.decode(buffer); // throws → caller's catch
    this.audio.setBuffer(decoded);
    this.hasTrack = true;
    this.setStatus('');
    this.revealPlayer(label);
    try {
      await this.audio.play();
    } catch {
      // Autoplay can be blocked once the user gesture has expired during a long
      // decode. The player is fully revealed — the user just presses play.
      this.showToast('Press play to start');
    }
    this.reflectPlaying();
    this.syncLoop(); // playback started → loop starts with it
  }

  private revealPlayer(label: string): void {
    this.trackLabel = label;
    this.nowPlaying.trackName = this.el.footerText.value || label;
    this.syncOverlayTimings(); // duration is known now
    this.el.dropzone.classList.add('is-hidden');
    this.el.topbar.hidden = false;
    this.el.transportWrap.hidden = false;
    this.el.exportBtn.disabled = false;
    this.el.effectName.textContent = getEntry(this.currentEffectId).meta.title;
    this.el.timeTotal.textContent = formatTime(this.audio.duration);
  }

  // ---- Transport ---------------------------------------------------------

  private bindTransport(): void {
    this.el.playBtn.addEventListener('click', () => void this.togglePlayback());

    this.el.scrubber.addEventListener('pointerdown', () => (this.scrubbing = true));
    // Clear the flag even when the pointer is released off-element (where no
    // `change` event fires), so transport sync never gets stuck.
    window.addEventListener('pointerup', () => (this.scrubbing = false));
    this.el.scrubber.addEventListener('input', () => {
      const t = (Number(this.el.scrubber.value) / 1000) * this.audio.duration;
      this.el.timeCurrent.textContent = formatTime(t);
      this.setProgress(Number(this.el.scrubber.value) / 10);
    });
    // `change` fires exactly once per committed seek (mouse release or keyboard
    // step) — committing here instead of on pointerup avoids double-seeking.
    this.el.scrubber.addEventListener('change', () => {
      const t = (Number(this.el.scrubber.value) / 1000) * this.audio.duration;
      this.audio.seek(t);
      this.scrubbing = false;
      this.reflectPlaying();
      this.syncLoop(); // renders the seeked position even while paused
    });
  }

  private async togglePlayback(): Promise<void> {
    if (!this.hasTrack || this.busy) return;
    // While recording, the primary control means one thing: stop & save.
    if (this.recording) {
      this.stopRecording();
      return;
    }
    await this.audio.toggle();
    this.reflectPlaying();
    this.syncLoop();
  }

  private startTransportSync(): void {
    // Independent of the render loop; a 4Hz UI tick is plenty for the clock.
    // Skipped entirely while paused — nothing changes, so no work.
    window.setInterval(() => {
      if (!this.hasTrack || this.scrubbing || !this.audio.isPlaying) return;
      const { currentTime, duration } = this.audio;
      this.el.timeCurrent.textContent = formatTime(currentTime);
      const ratio = duration > 0 ? currentTime / duration : 0;
      this.el.scrubber.value = String(Math.round(ratio * 1000));
      this.setProgress(ratio * 100);
    }, 250);
  }

  private reflectPlaying(): void {
    const playing = this.audio.isPlaying;
    this.el.playBtn.classList.toggle('is-playing', playing);
    this.el.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.el.playBtn.setAttribute('aria-pressed', String(playing));
  }

  private handleEnded(): void {
    if (this.recording) this.stopRecording();
    this.audio.seek(0);
    this.reflectPlaying();
    this.el.scrubber.value = '0';
    this.setProgress(0);
    this.el.timeCurrent.textContent = '0:00';
    this.syncLoop(); // track over → loop stops until play is pressed again
  }

  private setProgress(percent: number): void {
    this.el.scrubber.style.setProperty('--progress', `${percent}%`);
  }

  // ---- Effect picker -----------------------------------------------------

  private bindPicker(): void {
    this.renderPickerCards();
    this.el.effectsBtn.addEventListener('click', () => this.openPicker());
  }

  private renderPickerCards(): void {
    this.el.pickerList.replaceChildren(
      ...EFFECTS.map((entry) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'effect-card';
        card.dataset.effectId = entry.meta.id;
        card.classList.toggle('is-active', entry.meta.id === this.currentEffectId);
        card.innerHTML = `
          <span class="ec-title">${entry.meta.title}</span>
          <span class="ec-desc">${entry.meta.description ?? ''}</span>
          <span class="ec-kind">${entry.meta.kind === '3d' ? '3D' : 'Shader'}</span>`;
        card.addEventListener('click', () => void this.selectEffect(entry.meta.id));
        return card;
      }),
    );
  }

  private openPicker(): void {
    this.renderPickerCards(); // reflect the current effect's active state
    this.pickerDialog.open();
  }

  private async selectEffect(id: string): Promise<void> {
    if (id !== this.currentEffectId) {
      const previous = this.currentEffectId;
      this.currentEffectId = id;
      try {
        await this.mountEffect(id);
      } catch (err) {
        // Isolation: a broken effect must never take the app down. Fall back
        // to the previous effect and tell the user.
        console.error(`[effects] "${id}" failed to load`, err);
        this.currentEffectId = previous;
        this.showToast('That effect failed to load — staying on the current one.');
        try {
          await this.mountEffect(previous);
        } catch {
          // Previous also broken (should not happen): leave the stage as-is.
        }
        this.pickerDialog.close();
        return;
      }
      this.syncLoop(); // if paused, draw the new effect once as a still
      this.renderPickerCards();
      if (this.hasTrack) {
        this.el.effectName.textContent = getEntry(id).meta.title;
      }
    }
    this.pickerDialog.close();
  }

  private async mountEffect(id: string): Promise<void> {
    const factory = await getEntry(id).load();
    const { width, height } = this.engine.getSize();
    await this.engine.mountEffect(factory(width, height));
  }

  // ---- Story overlays (titles & lyrics) -----------------------------------

  private bindOverlays(): void {
    this.el.titlesBtn.addEventListener('click', () => this.overlaysDialog.open());

    const refresh = () => this.refreshOverlayPreview();

    this.el.overlayTitle.addEventListener('input', () => {
      this.titleCard.title = this.el.overlayTitle.value;
      refresh();
    });
    this.el.overlaySubtitle.addEventListener('input', () => {
      this.titleCard.subtitle = this.el.overlaySubtitle.value;
      refresh();
    });

    // Branding: Listen-on badge + Now Playing footer.
    const syncBadgeInputState = () => {
      const enabled = this.el.badgeEnabled.checked;
      this.el.badgeText.disabled = !enabled;
      this.el.badgeSpotify.disabled = !enabled;
      this.el.badgeApple.disabled = !enabled;
    };
    this.el.badgeEnabled.addEventListener('change', () => {
      this.overlayPrefs.badge = this.el.badgeEnabled.checked;
      syncBadgeInputState();
      this.applyOverlayPrefs();
      refresh();
    });
    this.el.badgeText.addEventListener('input', () => {
      this.listenBadge.helperText = this.el.badgeText.value || 'listen for free on';
      refresh();
    });
    const syncBrands = () => {
      this.listenBadge.showSpotify = this.el.badgeSpotify.checked;
      this.listenBadge.showApple = this.el.badgeApple.checked;
      refresh();
    };
    this.el.badgeSpotify.addEventListener('change', syncBrands);
    this.el.badgeApple.addEventListener('change', syncBrands);
    syncBadgeInputState();
    const syncFooterInputState = () => {
      this.el.footerText.disabled = !this.el.footerEnabled.checked;
    };
    this.el.footerEnabled.addEventListener('change', () => {
      this.overlayPrefs.footer = this.el.footerEnabled.checked;
      syncFooterInputState();
      this.applyOverlayPrefs();
      refresh();
    });
    this.el.footerText.addEventListener('input', () => {
      this.nowPlaying.trackName = this.el.footerText.value || this.trackLabel;
      refresh();
    });
    syncFooterInputState();
    this.el.logoEnabled.addEventListener('change', () => {
      this.overlayPrefs.logo = this.el.logoEnabled.checked;
      this.applyOverlayPrefs();
      refresh();
    });
    this.applyOverlayPrefs();

    this.el.lyricsBtn.addEventListener('click', () => this.el.lyricsInput.click());
    this.el.lyricsInput.addEventListener('change', () => {
      const file = this.el.lyricsInput.files?.[0];
      if (file) void this.loadLyrics(file);
    });
    this.el.lyricsClear.addEventListener('click', () => {
      this.lyricsItem.cues = [];
      this.el.lyricsInput.value = '';
      this.el.lyricsStatus.textContent = '';
      this.el.lyricsClear.hidden = true;
      refresh();
    });
  }

  private async loadLyrics(file: File): Promise<void> {
    try {
      const cues = parseSrt(await file.text());
      if (cues.length === 0) {
        this.el.lyricsStatus.textContent = 'No cues found — is that an SRT file?';
        return;
      }
      this.lyricsItem.cues = cues;
      this.el.lyricsStatus.textContent = `${cues.length} lines · ${file.name}`;
      this.el.lyricsClear.hidden = false;
      this.showToast(`Loaded ${cues.length} lyric lines`);
      this.refreshOverlayPreview();
    } catch {
      this.el.lyricsStatus.textContent = 'Could not read that file.';
    }
  }

  /** Effective item state from the per-feature switches. */
  private applyOverlayPrefs(): void {
    const { badge, footer, logo } = this.overlayPrefs;
    this.titleCard.enabled = true;
    this.lyricsItem.enabled = true;
    this.listenBadge.enabled = badge;
    this.nowPlaying.enabled = footer;
    this.monogram.enabled = logo;
    this.endReveal.enabled = logo;
    // The footer text sits beside the monogram (like the original), not on it.
    this.nowPlaying.offsetX = this.monogram.enabled ? 52 : 0;
    this.syncOverlayTimings();
  }

  /**
   * When the end reveal is on, the footer overlays bow out before the finale
   * (like the original's end sequence); otherwise they run the whole track.
   */
  private syncOverlayTimings(): void {
    const duration = this.audio.duration;
    const finaleAt =
      this.overlayPrefs.logo && duration > 30 ? duration - 10 : Number.MAX_SAFE_INTEGER;
    this.nowPlaying.timing.outAt = finaleAt;
    this.monogram.timing.outAt = finaleAt;
    this.listenBadge.timing.outAt = Math.min(60, finaleAt);
  }

  /** Overlays with content that must be burned into exports? */
  private overlaysActive(): boolean {
    return this.overlayLayer.hasActiveItems;
  }

  /** While paused, redraw the still frame so panel edits preview instantly. */
  private refreshOverlayPreview(): void {
    if (this.hasTrack && !this.engine.isRunning && !this.busy) this.engine.renderStill();
  }

  // ---- Export -------------------------------------------------------------

  private bindExport(): void {
    this.el.exportBtn.addEventListener('click', () => this.openExport());
    // During a Fast render this button becomes the cancel control.
    this.el.exportStart.addEventListener('click', () => {
      if (this.busy) {
        this.exportAbort?.abort();
        return;
      }
      void this.startExport();
    });

    // Quality segmented control.
    for (const seg of this.el.exportPanel.querySelectorAll<HTMLButtonElement>('.seg')) {
      seg.addEventListener('click', () =>
        this.selectQuality(seg.dataset.quality as 'high' | 'quick'),
      );
    }
    // Real-time recording is the default — it captures exactly what you see.
    // "Fast render" (offline WebCodecs) is offered only where supported.
    if (!offlineExportSupported()) {
      const high = this.el.exportPanel.querySelector<HTMLElement>('.seg[data-quality="high"]');
      high?.setAttribute('hidden', '');
    }
    this.selectQuality('quick');
  }

  private selectQuality(quality: 'high' | 'quick'): void {
    if (this.isExportBusy()) return;
    this.exportQuality = quality;
    this.el.exportPanel.querySelectorAll<HTMLButtonElement>('.seg').forEach((seg) => {
      const on = seg.dataset.quality === quality;
      seg.classList.toggle('is-selected', on);
      seg.setAttribute('aria-checked', String(on));
    });
    this.el.exportStart.textContent = quality === 'high' ? 'Render video' : 'Start recording';
  }

  private isExportBusy(): boolean {
    return this.recording || this.busy;
  }

  private openExport(): void {
    if (!this.hasTrack) return;
    this.exportDialog.open();
  }

  private startExport(): Promise<void> | void {
    if (this.isExportBusy()) return;
    if (this.exportQuality === 'high' && offlineExportSupported()) {
      return this.startOfflineExport();
    }
    return this.startRealtimeRecording();
  }

  private async startOfflineExport(): Promise<void> {
    const buffer = this.audio.getBuffer();
    if (!buffer) return;

    // Stop playback AND the live render loop before entering offline mode, so
    // the deterministic renderer + encoder get the GPU entirely to themselves
    // (renderFrame() is driven manually — no competing rAF loop).
    this.audio.pause();
    this.reflectPlaying();
    this.syncLoop();
    this.busy = true;
    this.exportAbort = new AbortController();
    // The canvas is the encoder's render target, so frames MUST be drawn into
    // it — but the fast-forward isn't playback, so don't show it. Dim the
    // stage; the dialog's progress is the feedback.
    this.engine.setStageDimmed(true);
    // The start button becomes the escape hatch while rendering.
    this.el.exportStart.disabled = false;
    this.el.exportStart.textContent = 'Cancel';
    this.setExportStatus('Preparing…', 'recording');

    const renderer = new OfflineRenderer(this.engine, buffer, {
      fps: 60, // match the live 60fps look exactly
      signal: this.exportAbort.signal,
      onProgress: (f) => this.setExportStatus(`Rendering… ${Math.round(f * 100)}%`, 'recording'),
      // Burn titles/lyrics into the render when they're active.
      overlayCanvas: this.overlaysActive() ? this.overlayLayer.canvas : undefined,
    });

    try {
      const { blob, filename } = await renderer.render(this.trackLabel);
      downloadBlob(blob, filename);
      const mb = (blob.size / (1024 * 1024)).toFixed(1);
      this.setExportStatus(`Saved ${filename} (${mb} MB).`, 'done');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        this.setExportStatus('Render cancelled.', 'idle');
      } else {
        console.error('[export] offline render failed', err);
        this.setExportStatus('Render failed — try the Record option instead.', 'idle');
      }
    } finally {
      this.busy = false;
      this.exportAbort = null;
      this.engine.setStageDimmed(false);
      this.selectQuality(this.exportQuality); // restores the start button label
      this.syncLoop(); // restore the paused still-frame state
    }
  }

  private async startRealtimeRecording(): Promise<void> {
    // Pin resolution first so the capture source's dimensions are stable.
    this.engine.setAdaptiveQuality(false);

    // With titles/lyrics active, capture the composited canvas (burn-in);
    // otherwise capture the WebGL canvas directly — zero extra cost.
    const withOverlays = this.overlaysActive();
    let captureSource = this.engine.canvas;
    if (withOverlays) {
      this.compositor.setSizeFrom(this.engine.canvas);
      this.engine.setCompositeTarget(this.compositor);
      captureSource = this.compositor.canvas;
    }

    const recorder = new Recorder(captureSource, this.audio.getRecordingStream(), { fps: 60 });
    if (!recorder.supported) {
      this.engine.setCompositeTarget(null);
      this.engine.setAdaptiveQuality(true);
      this.setExportStatus('Recording is not supported in this browser.', 'idle');
      return;
    }
    this.recorder = recorder;
    recorder.onComplete = (blob, filename) => {
      downloadBlob(blob, filename);
      const mb = (blob.size / (1024 * 1024)).toFixed(1);
      this.showToast(`Saved ${filename} (${mb} MB)`);
      this.setExportStatus(`Saved ${filename} (${mb} MB).`, 'done');
    };

    try {
      this.audio.seek(0);
      await this.audio.play();
    } catch (err) {
      // Playback was blocked — abort cleanly instead of recording silence.
      console.error('[export] could not start playback for recording', err);
      this.engine.setCompositeTarget(null);
      this.engine.setAdaptiveQuality(true);
      this.recorder = null;
      this.setExportStatus('Playback was blocked — press play, then try again.', 'idle');
      return;
    }
    this.reflectPlaying();
    recorder.start(this.trackLabel);
    this.recording = true;
    this.syncLoop(); // loop follows the recording, not just playback

    // The dialog closes — recording is "what you see", so let them see it.
    // The recording state lives in the transport: the play button becomes a
    // pulsing red stop-and-save control; seeking locks (it's a live take).
    this.exportDialog.close(true, this.el.playBtn);
    this.el.playBtn.classList.add('is-recording');
    this.el.playBtn.setAttribute('aria-label', 'Stop recording and save');
    this.el.transport.classList.add('is-recording');
    this.el.scrubber.disabled = true;
    this.el.exportBtn.disabled = true;
    this.setExportStatus('Recording…', 'recording');
  }

  private stopRecording(): void {
    if (!this.recording) return;
    this.recording = false;
    this.recorder?.stop(); // triggers onComplete → download + toast
    this.recorder = null;
    this.engine.setCompositeTarget(null);
    this.engine.setAdaptiveQuality(true);

    // Restore the transport to normal playback state (audio keeps playing).
    this.el.playBtn.classList.remove('is-recording');
    this.el.transport.classList.remove('is-recording');
    this.el.scrubber.disabled = false;
    this.el.exportBtn.disabled = false;
    this.reflectPlaying();
    this.setExportStatus('Finishing file…', 'done');
    this.syncLoop(); // if playback also stopped, the loop stops with it
  }

  private showToast(text: string): void {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.el.toast.classList.remove('is-visible'), 4200);
  }

  private setExportStatus(text: string, state: 'idle' | 'recording' | 'done'): void {
    this.el.exportStatus.textContent = text;
    this.el.recDot.dataset.state = state;
  }

  // ---- Keyboard ----------------------------------------------------------

  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      if (!this.hasTrack) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        // preventDefault also stops Space from re-activating a focused button.
        e.preventDefault();
        void this.togglePlayback();
      }
    });
  }

  private setStatus(text: string): void {
    this.el.status.textContent = text;
  }
}

function byId<T extends Element = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[NYHMAS] missing element #${id}`);
  return el as unknown as T;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function cleanName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '').slice(0, 40);
}
