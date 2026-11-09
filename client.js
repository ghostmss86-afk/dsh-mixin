window.__ModuleLoader__.load({
  id: 'dsh-plugin-skin-studio',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    let createPortal = null;
    try { createPortal = require('react-dom').createPortal; } catch (error) { createPortal = null; }
    const { useEffect, useRef, useState, useSyncExternalStore } = React;

    const STORAGE_KEY = 'dsh.skin-studio.v1';
    // How long the app stays visible after the last input while a wallpaper
    // video plays. 5s felt like the interface was disappearing on its own;
    // 23s is long enough to read a paragraph without being interrupted.
    const CINEMA_IDLE_MS = 23000;
    function mediaBase() {
      if (typeof window === 'undefined') return '';
      return typeof window.__skinMediaOrigin === 'string' ? window.__skinMediaOrigin : '';
    }
    function mediaPath(path) {
      let value = String(path || '');
      if (!value) return value;
      // A stored URL can carry the origin of a previous launch (dsh web picks a
      // new port every time). Keep only the path so the current origin wins.
      const stale = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(\/.*)$/i.exec(value);
      if (stale) value = stale[1];
      if (!value.startsWith('/')) return value;
      return mediaBase() + value;
    }
    // Only same-origin media routes can feed the sidecar <audio> element. Older
    // builds could persist a file:// path here (the "audio codec is natively
    // supported" reply); an http page can never load it, and its mere presence
    // muted the <video> — which is exactly the "picture moves, no sound" bug.
    function usableAudioUrl(value) {
      const url = String(value || '');
      if (!url) return '';
      if (/^file:/i.test(url)) return '';
      return url;
    }

    // ---------- display-mode shortcuts ----------
    // Two user-mapped hotkeys: one locks the pure view (no interface on top of
    // the wallpaper), the other locks the normal view. Each key locks *its
    // own* mode and unlocks it again on a second press; while one mode is
    // locked the other key is inert, so a stray press cannot flip the screen
    // without the user asking for exactly that.
    const MODE_NONE = 'none';
    const MODE_PURE = 'pure';
    const MODE_NORMAL = 'normal';
    const MODE_KEY_MAX = 40;

    function normalizeModeKey(value) {
      const key = typeof value === 'string' ? value.trim() : '';
      return key.length > 2 && key.length <= MODE_KEY_MAX ? key : '';
    }

    function eventKeyName(event) {
      const key = String(event && event.key ? event.key : '');
      if (!key || key === 'Unidentified' || key === 'Dead' || key === 'Process') return '';
      if (key === ' ' || key === 'Spacebar') return 'Space';
      return key.length === 1 ? key.toUpperCase() : key;
    }

    // Returns '' for anything we must not claim: a bare letter (it would eat
    // ordinary typing), a lone modifier, or an unidentified key.
    function comboFromEvent(event) {
      const key = eventKeyName(event);
      if (!key) return '';
      if (key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift') return '';
      if (!event.ctrlKey && !event.metaKey && !event.altKey) return '';
      const parts = [];
      if (event.ctrlKey) parts.push('Ctrl');
      if (event.metaKey) parts.push('Meta');
      if (event.altKey) parts.push('Alt');
      if (event.shiftKey) parts.push('Shift');
      parts.push(key);
      return parts.join('+');
    }

    function isMacLike() {
      if (typeof navigator === 'undefined') return false;
      const platform = String(navigator.platform || navigator.userAgent || '');
      return /Mac|iPhone|iPad/i.test(platform);
    }

    function comboLabel(combo) {
      const value = String(combo || '');
      if (!value) return '';
      const mac = isMacLike();
      const parts = value.split('+');
      if (!mac) return parts.map((part) => (part === 'Meta' ? 'Win' : part)).join('+');
      return parts.map((part) => {
        if (part === 'Meta') return '\u2318';
        if (part === 'Ctrl') return '\u2303';
        if (part === 'Alt') return '\u2325';
        if (part === 'Shift') return '\u21e7';
        return part;
      }).join('');
    }
    // Inputs whose focus does NOT mean "the user is typing a message".
    const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden']);

    // True when the caret is in something the user types into. Pure mode must
    // never swallow the screen while that is the case: the user is writing and
    // looking at the conversation above the composer to compare.
    function isTextEntryFocused() {
      if (typeof document === 'undefined') return false;
      let node = document.activeElement;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node.nodeType === 1) {
          const tag = String(node.tagName || '').toUpperCase();
          if (tag === 'INPUT') {
            const type = String(node.getAttribute('type') || 'text').toLowerCase();
            if (!NON_TEXT_INPUTS.has(type)) return true;
          }
          if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
          if (node.isContentEditable) return true;
          if (String(node.getAttribute('role') || '').toLowerCase() === 'textbox') return true;
          if (node.hasAttribute && node.hasAttribute('data-lexical-editor')) return true;
        }
        node = node.parentElement;
      }
      return false;
    }

    // The keystroke's own target is the most reliable signal: focus can be
    // restored asynchronously (Lexical does exactly that), while the event
    // target is where the character was actually going to land. Shadow DOM
    // retargets events, so composedPath() is consulted as well.
    function caretInTextField(event) {
      if (isTextEntryFocused()) return true;
      if (!event || typeof event !== 'object') return false;
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      const candidates = [event.target, event.srcElement].concat(Array.isArray(path) ? path : []);
      for (const node of candidates) {
        if (!node || node.nodeType !== 1) continue;
        const tag = String(node.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (tag === 'INPUT') {
          const type = String(node.getAttribute('type') || 'text').toLowerCase();
          if (!NON_TEXT_INPUTS.has(type)) return true;
        }
        if (node.isContentEditable) return true;
        if (String(node.getAttribute('role') || '').toLowerCase() === 'textbox') return true;
        if (node.hasAttribute && node.hasAttribute('data-lexical-editor')) return true;
        if (node.hasAttribute && node.hasAttribute('data-composer-input')) return true;
      }
      return false;
    }

    // Compact dump used by the persisted debug log. The whole point is that a
    // recurrence can be explained from stored state instead of a screenshot.
    function focusDescriptor() {
      if (typeof document === 'undefined') return 'no-document';
      const node = document.activeElement;
      if (!node) return 'none';
      const tag = String(node.tagName || '').toLowerCase() || 'unknown';
      const type = node.getAttribute && node.getAttribute('type');
      return tag + (type ? '[' + type + ']' : '') + (node.isContentEditable ? '[ce]' : '');
    }

    const DB_NAME = 'dsh-skin-studio';
    const DB_VERSION = 2;
  const PLUGIN_VERSION = '1.0.10';
  // Shown in Settings next to the version, and returned by
  // window.__skinStudioDiag(). A stale build is the #1 reason a fix "comes
  // back": the Web GUI listens on a NEW port on every launch, so a plain page
  // refresh can still be served from the previous build's HTTP cache. Check
  // this stamp before debugging anything else.
  const BUILD = '2026-11-09T22:24';
    const MAX_CUSTOM_SKINS = 12;
    // High guard rails only: these limits are never meant to block real use.
    // Older builds merged IndexedDB records with cached localStorage entries on
    // every reload, which could multiply one photo into hundreds of copies and
    // eventually leave the "add" tile permanently disabled at the old cap.
    const MAX_CUSTOM_WALLPAPERS = 10000;
    const MAX_CUSTOM_VIDEOS = 10000;
    // No practical per-file size cap: the only real ceiling is the browser's
    // IndexedDB storage quota. Keep a very high guard so a corrupted file.size
    // value cannot loop forever.
    const MAX_VIDEO_BYTES = Number.MAX_SAFE_INTEGER;
    const WALLPAPERS_PER_PAGE = 11;
    const WALLPAPER_FILTERS = ['all', 'favorites', 'mine', 'presets'];
    const MAX_DIM = 0.5;
    const DEFAULT_DIM = 0.12;

    const SKIN_PRESETS = [
      { id: 'twilight', nameKey: 'skin.preset.twilight', accent: '#7C5CD6', lightBg: '#F7F4FC', darkBg: '#16121F' },
      { id: 'forest', nameKey: 'skin.preset.forest', accent: '#1F8A70', lightBg: '#F2F8F4', darkBg: '#101A15' },
      { id: 'sunset', nameKey: 'skin.preset.sunset', accent: '#D9662F', lightBg: '#FCF5EF', darkBg: '#1C1410' },
      { id: 'sakura', nameKey: 'skin.preset.sakura', accent: '#D4578B', lightBg: '#FDF4F7', darkBg: '#1D1218' },
      { id: 'ocean', nameKey: 'skin.preset.ocean', accent: '#2F6FDD', lightBg: '#F3F6FC', darkBg: '#0E1420' },
      { id: 'graphite', nameKey: 'skin.preset.graphite', accent: '#5B6472', lightBg: '#F5F6F8', darkBg: '#14161A' },
      { id: 'cyber', nameKey: 'skin.preset.cyber', accent: '#0E9F8C', lightBg: '#F0FAF8', darkBg: '#0A1218' },
      { id: 'latte', nameKey: 'skin.preset.latte', accent: '#A9743F', lightBg: '#FAF6F1', darkBg: '#1A1511' }
    ];

    const WALLPAPER_PRESETS = [
      {
        id: 'aurora',
        nameKey: 'wallpaper.preset.aurora',
        lum: 0.14,
        image: 'linear-gradient(140deg, #0B1220 0%, #16324D 36%, #1F6F6B 70%, #5AC2A8 100%)'
      },
      {
        id: 'sunset',
        nameKey: 'wallpaper.preset.sunset',
        lum: 0.3,
        image: 'linear-gradient(160deg, #2A1638 0%, #7B2E5B 38%, #D45C6A 70%, #F2A65A 100%)'
      },
      {
        id: 'ocean',
        nameKey: 'wallpaper.preset.ocean',
        lum: 0.16,
        image: 'linear-gradient(155deg, #041C32 0%, #064663 44%, #0F7C8F 78%, #5FC5CF 100%)'
      },
      {
        id: 'forest',
        nameKey: 'wallpaper.preset.forest',
        lum: 0.15,
        image: 'linear-gradient(160deg, #0B1F17 0%, #14463A 44%, #2E7D5B 74%, #8CC9A0 100%)'
      },
      {
        id: 'sakura',
        nameKey: 'wallpaper.preset.sakura',
        lum: 0.42,
        image: 'linear-gradient(165deg, #3A1B2E 0%, #7A3556 38%, #D77C96 72%, #F6C9C0 100%)'
      },
      {
        id: 'starry',
        nameKey: 'wallpaper.preset.starry',
        lum: 0.06,
        image: 'radial-gradient(120% 90% at 18% 8%, #1D2A5A 0%, #0B1026 55%, #06070F 100%)'
      },
      {
        id: 'paper',
        nameKey: 'wallpaper.preset.paper',
        lum: 0.9,
        image: 'linear-gradient(160deg, #F6F1E7 0%, #EFE6D8 52%, #E3D6C3 100%)'
      },
      {
        id: 'slate',
        nameKey: 'wallpaper.preset.slate',
        lum: 0.8,
        image: 'linear-gradient(150deg, #EEF1F5 0%, #D7DDE6 52%, #B9C2CF 100%)'
      },
      {
        id: 'neon',
        nameKey: 'wallpaper.preset.neon',
        lum: 0.08,
        image: 'radial-gradient(90% 70% at 82% 18%, rgba(0, 229, 255, 0.42) 0%, rgba(0, 229, 255, 0) 60%), radial-gradient(90% 80% at 18% 82%, rgba(255, 0, 196, 0.34) 0%, rgba(255, 0, 196, 0) 62%), linear-gradient(160deg, #100A24 0%, #0A0616 100%)'
      }
    ];

    const DEFAULT_SKIN = {
      id: 'default',
      isDefault: true,
      hasPalette: false,
      light: {
        base: '#FFFFFF', layer1: '#FFFFFF', layer2: '#F3F4F6', overlay: '#FFFFFF', sidebar: '#F7F7F8',
        brand: '#3D5AFE', label: '#1B1D22', labelSecondary: '#5F6368', border1: '#E6E7EA', border2: '#D4D7DD'
      },
      dark: {
        base: '#1A1C20', layer1: '#22252A', layer2: '#2A2E34', overlay: '#24272D', sidebar: '#16181D',
        brand: '#7AA2FF', label: '#F2F3F5', labelSecondary: '#A7ACB5', border1: '#33373D', border2: '#40454C'
      }
    };

    // ---------- color math ----------

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function hexToRgb(hex) {
      let text = String(hex || '').trim();
      if (text.charAt(0) === '#') text = text.slice(1);
      if (text.length === 3) {
        text = text.charAt(0) + text.charAt(0) + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2);
      }
      if (!/^[0-9a-fA-F]{6}$/.test(text)) return null;
      return {
        r: parseInt(text.slice(0, 2), 16),
        g: parseInt(text.slice(2, 4), 16),
        b: parseInt(text.slice(4, 6), 16)
      };
    }

    function rgbToHex(rgb) {
      const part = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
      return '#' + part(rgb.r) + part(rgb.g) + part(rgb.b);
    }

    function normalizeHex(value, fallback) {
      const rgb = hexToRgb(value);
      return rgb ? rgbToHex(rgb) : fallback;
    }

    function mix(from, to, ratio) {
      const a = hexToRgb(from) || { r: 0, g: 0, b: 0 };
      const b = hexToRgb(to) || { r: 0, g: 0, b: 0 };
      return rgbToHex({
        r: a.r + (b.r - a.r) * ratio,
        g: a.g + (b.g - a.g) * ratio,
        b: a.b + (b.b - a.b) * ratio
      });
    }

    function rgba(hex, alpha) {
      const rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
      return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + clamp(alpha, 0, 1) + ')';
    }

    function luminance(hex) {
      const rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
      const channel = (value) => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
    }

    function isDarkColor(hex) {
      return luminance(hex) < 0.42;
    }

    function contrastRatio(a, b) {
      const la = luminance(a);
      const lb = luminance(b);
      const high = Math.max(la, lb);
      const low = Math.min(la, lb);
      return (high + 0.05) / (low + 0.05);
    }

    function readableLabel(bg) {
      return luminance(bg) > 0.55 ? '#1B1D22' : '#F4F5F7';
    }

    function adaptAccent(accent, bg) {
      let result = accent;
      let guard = 0;
      while (contrastRatio(result, bg) < 2.6 && guard < 6) {
        result = isDarkColor(bg) ? mix(result, '#FFFFFF', 0.22) : mix(result, '#000000', 0.22);
        guard += 1;
      }
      return result;
    }

    function derivePalette(bg, accent) {
      const dark = isDarkColor(bg);
      const label = readableLabel(bg);
      return {
        base: bg,
        brand: adaptAccent(accent, bg),
        label,
        labelSecondary: mix(label, bg, 0.38),
        layer1: dark ? mix(bg, '#FFFFFF', 0.09) : mix(bg, '#FFFFFF', 0.62),
        layer2: dark ? mix(bg, '#FFFFFF', 0.05) : mix(bg, '#000000', 0.045),
        overlay: dark ? mix(bg, '#FFFFFF', 0.1) : mix(bg, '#FFFFFF', 0.85),
        sidebar: dark ? mix(bg, '#000000', 0.18) : mix(bg, '#000000', 0.03),
        border1: mix(bg, label, dark ? 0.16 : 0.14),
        border2: mix(bg, label, dark ? 0.28 : 0.24)
      };
    }

    function deriveSkin(item) {
      return {
        id: item.id,
        isDefault: false,
        hasPalette: true,
        light: derivePalette(item.lightBg, item.accent),
        dark: derivePalette(item.darkBg, item.accent)
      };
    }

    function resolveSkin(state) {
      if (!state.skinId || state.skinId === 'default') return DEFAULT_SKIN;
      const preset = SKIN_PRESETS.find((item) => item.id === state.skinId);
      if (preset) return deriveSkin(preset);
      const custom = state.customSkins.find((item) => item.id === state.skinId);
      if (custom) return deriveSkin(custom);
      return DEFAULT_SKIN;
    }

    function cssUrl(value) {
      const url = String(value || '').replace(/[\r\n]/g, '').replace(/["\\]/g, function (ch) {
        return '\\' + ch;
      });
      return 'url("' + url + '")';
    }

    function resolveWallpaper(state) {
      if (!state.wallpaperId || state.wallpaperId === 'none') return null;
      const preset = WALLPAPER_PRESETS.find((item) => item.id === state.wallpaperId);
      if (preset) {
        return { id: preset.id, nameKey: preset.nameKey, image: preset.image, thumb: preset.image, lum: preset.lum };
      }
      const custom = state.customWallpapers.find((item) => item.id === state.wallpaperId);
      if (custom) {
        const source = custom.fullUrl || custom.url || custom.thumb || custom.full;
        if (!source) return null;
        return {
          id: custom.id,
          name: custom.name,
          image: cssUrl(source),
          thumb: cssUrl(custom.thumb || custom.full || source),
          lum: custom.lum
        };
      }
      return null;
    }

    // The element must have a usable src on its FIRST render. `fullUrl` is a
    // runtime cache (it is deliberately not persisted), so a record restored
    // from disk used to resolve to source:'' until an async helper happened to
    // write fullUrl — and <video src=""> rejects play() with NotSupportedError
    // without ever firing an `error` event. Deriving the route from the path is
    // synchronous, deterministic, and survives a reload.
    function videoRoute(sourcePath) {
      if (!sourcePath) return '';
      return '/api/skin-studio/media/video?path=' + encodeURIComponent(sourcePath);
    }
    function resolveVideo(state) {
      if (!state.videoId || state.videoId === 'none') return null;
      const item = state.customVideos.find((video) => video.id === state.videoId);
      if (!item) return null;
      const source = item.proxyUrl || item.fullUrl || item.url || videoRoute(item.sourcePath) || '';
      return Object.assign({}, item, { source });
    }

    // The veil keeps host text readable on any image: light schemes add a white
    // veil (more for darker images), dark schemes add a dark veil (more for
    // lighter images). The optional "soften" amount stacks on top.
    function veilColor(scheme, dim, lum) {
      const base = typeof lum === 'number' && isFinite(lum) ? clamp(lum, 0, 1) : 0.35;
      const extra = clamp(Number(dim) || 0, 0, MAX_DIM);
      if (scheme === 'dark') {
        const alpha = clamp(0.32 + base * 0.45 + extra * 0.5, 0.25, 0.9);
        return 'rgba(0, 0, 0, ' + alpha.toFixed(2) + ')';
      }
      const alpha = clamp(0.64 - base * 0.46 + extra * 0.35, 0.4, 0.9);
      return 'rgba(255, 255, 255, ' + alpha.toFixed(2) + ')';
    }

    function wallpaperLayers(wallpaper, dim, scheme) {
      const veil = veilColor(scheme, dim, wallpaper.lum);
      return 'linear-gradient(' + veil + ', ' + veil + '), ' + wallpaper.image;
    }

    function bodyCss(wallpaper, dim) {
      return (
        'body{background-image:' + wallpaperLayers(wallpaper, dim, 'light') +
        ' !important;background-size:cover !important;background-position:center center !important;' +
        'background-repeat:no-repeat !important;background-attachment:fixed !important;}' +
        'body[data-ds-dark-theme]{background-image:' + wallpaperLayers(wallpaper, dim, 'dark') +
        ' !important;}'
      );
    }

    function videoBodyCss() {
      // Let the portaled .dsh-skin-video-layer show through every app surface.
      // The theme tokens already make panels translucent while a video backdrop
      // is active, but we also neutralise any opaque background painted by the
      // document shell (#root / body / html) so nothing covers the video.
      return (
        'html,body{background-color:transparent !important;background-image:none !important;}' +
        'body[data-ds-dark-theme]{background-color:transparent !important;background-image:none !important;}' +
        '#root,#app,#__next,[data-dsh-root]{background-color:transparent !important;background-image:none !important;}' +
        // The composer band stays glass-free over a video: any blur or gradient
        // here sits on top of the picture and hides burned-in subtitles.
        '[data-composer-seat]{background:none !important;background-color:transparent !important;border-radius:24px !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;box-shadow:none !important;}' +
        '[data-composer-dock]{background:rgba(255,255,255,.06) !important;background-color:rgba(255,255,255,.06) !important;border:1px solid rgba(255,255,255,.18) !important;box-shadow:0 10px 30px rgba(0,0,0,.10) !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}' +
        '[data-composer-dock] *{background-color:transparent !important;background-image:none !important;}' +
        '[data-composer-card]{background:transparent !important;background-color:transparent !important;border:none !important;box-shadow:none !important;backdrop-filter:none !important;}' +
        'body[data-ds-dark-theme] [data-composer-dock]{background:rgba(14,16,20,.16) !important;background-color:rgba(14,16,20,.16) !important;border-color:rgba(255,255,255,.10) !important;}' +
        'body[data-ds-dark-theme] [data-composer-seat]{background:none !important;background-color:transparent !important;backdrop-filter:none !important;}'
      );
    }

    // ---------- theme tokens ----------

    function buildTokens(state) {
      const skin = resolveSkin(state);
      const wallpaper = resolveWallpaper(state);
      const video = resolveVideo(state);
      const hasBackdrop = Boolean(wallpaper || (video && video.source));
      const tokens = {};
      const add = (name, light, dark) => {
        tokens[name] = { light, dark };
      };

      if (skin.hasPalette) {
        add('--dsw-alias-brand-primary', skin.light.brand, skin.dark.brand);
        add('--dsw-alias-label-primary', skin.light.label, skin.dark.label);
        add('--dsw-alias-label-secondary', skin.light.labelSecondary, skin.dark.labelSecondary);
      }

      if (!hasBackdrop) {
        if (skin.hasPalette) {
          add('--dsw-alias-bg-base', skin.light.base, skin.dark.base);
          add('--dsw-alias-bg-layer-1', skin.light.layer1, skin.dark.layer1);
          add('--dsw-alias-bg-layer-2', skin.light.layer2, skin.dark.layer2);
          add('--dsw-alias-bg-overlay', skin.light.overlay, skin.dark.overlay);
          add('--dsw-specific-sidebar-fill', skin.light.sidebar, skin.dark.sidebar);
          add('--dsw-alias-border-l1', skin.light.border1, skin.dark.border1);
          add('--dsw-alias-border-l2', skin.light.border2, skin.dark.border2);
        }
        return tokens;
      }

      const glass = state.glass !== false;
      add('--dsw-alias-bg-base', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)');
      add(
        '--dsw-alias-bg-layer-1',
        rgba(skin.light.layer1, glass ? 0.38 : 0.97),
        rgba(skin.dark.layer1, glass ? 0.34 : 0.97)
      );
      add(
        '--dsw-alias-bg-layer-2',
        rgba(skin.light.layer2, glass ? 0.3 : 0.97),
        rgba(skin.dark.layer2, glass ? 0.26 : 0.97)
      );
      add(
        '--dsw-alias-bg-overlay',
        rgba(skin.light.overlay, glass ? 0.94 : 0.99),
        rgba(skin.dark.overlay, glass ? 0.94 : 0.99)
      );
      add(
        '--dsw-specific-sidebar-fill',
        glass ? rgba(skin.light.sidebar, 0.55) : skin.light.sidebar,
        glass ? rgba(skin.dark.sidebar, 0.52) : skin.dark.sidebar
      );
      add('--dsw-alias-border-l1', rgba(skin.light.label, 0.11), rgba(skin.dark.label, 0.13));
      add('--dsw-alias-border-l2', rgba(skin.light.label, 0.19), rgba(skin.dark.label, 0.2));
      return tokens;
    }

    // ---------- persistence ----------

    function newId(prefix) {
      return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    }

    function validSkinItem(item) {
      return Boolean(
        item && typeof item.id === 'string' && typeof item.name === 'string' &&
        hexToRgb(item.accent) && hexToRgb(item.lightBg) && hexToRgb(item.darkBg)
      );
    }

    function validWallpaperItem(item) {
      return Boolean(
        item && typeof item.id === 'string' && typeof item.name === 'string' &&
        (typeof item.fullUrl === 'string' || typeof item.url === 'string' || typeof item.thumb === 'string' || typeof item.full === 'string')
      );
    }

    function validVideoItem(item) {
      return Boolean(
        item && typeof item.id === 'string' && typeof item.name === 'string' &&
        (typeof item.mime === 'string' || typeof item.type === 'string') &&
        Number(item.size) >= 0
      );
    }

    // Stable identity for dedupe. Imported items always carry `key`
    // (relative path/name + byte size). Legacy entries that predate `key`
    // fall back to a short fingerprint of the stored thumbnail.
    function wallpaperIdentity(item) {
      if (!item) return '';
      if (item.key) return 'k:' + item.key;
      const thumb = typeof item.thumb === 'string' ? item.thumb : '';
      return 'n:' + (item.name || '') + ':' + thumb.slice(0, 160);
    }

    function videoIdentity(item) {
      if (!item) return '';
      if (item.key) return 'k:' + item.key;
      return 'n:' + (item.name || '') + ':' + (item.size || 0);
    }

    function dedupeBy(list, identity) {
      const seen = new Set();
      const output = [];
      for (const item of list) {
        const key = identity(item) || ('id:' + item.id);
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(item);
      }
      return output;
    }

    function normalizeState(input) {
      const state = Object.assign({}, input);
      return {
        skinId: typeof state.skinId === 'string' ? state.skinId : 'default',
        customSkins: (Array.isArray(state.customSkins) ? state.customSkins : []).filter(validSkinItem).slice(0, MAX_CUSTOM_SKINS),
        wallpaperId: typeof state.wallpaperId === 'string' ? state.wallpaperId : 'none',
        customWallpapers: dedupeBy(
          (Array.isArray(state.customWallpapers) ? state.customWallpapers : []).filter(validWallpaperItem),
          wallpaperIdentity
        ).slice(0, MAX_CUSTOM_WALLPAPERS),
        customVideos: dedupeBy(
          (Array.isArray(state.customVideos) ? state.customVideos : []).filter(validVideoItem),
          videoIdentity
        ).map((item) => (usableAudioUrl(item.audioUrl) ? item : Object.assign({}, item, { audioUrl: null })))
          .slice(0, MAX_CUSTOM_VIDEOS),
        favorites: (Array.isArray(state.favorites) ? state.favorites : [])
          .filter((id) => typeof id === 'string')
          .slice(0, 500),
        wallpaperFilter: WALLPAPER_FILTERS.indexOf(state.wallpaperFilter) >= 0 ? state.wallpaperFilter : 'all',
        dim: clamp(Number(state.dim), 0, MAX_DIM) || 0,
        glass: state.glass !== false,
        quickOpen: Boolean(state.quickOpen),
        videoId: typeof state.videoId === 'string' ? state.videoId : 'none',
        videoFavorites: (Array.isArray(state.videoFavorites) ? state.videoFavorites : []).filter((id) => typeof id === 'string').slice(0, 500),
        videoPlaying: state.videoPlaying !== false,
        // Mute is a session-only preference for a wallpaper. Restoring a
        // persisted mute is exactly how "no sound" gets re-reported after a
        // restart, so a fresh load always starts audible.
        videoMuted: false,
        // Playback volume defaults to maximum: the wallpaper is the point, and a
        // half-volume default read as "no sound" on laptop speakers. Volume
        // that was saved before 1.0.9 (<= 0.5 by default) is lifted once, so an
        // existing profile starts audible too.
        videoVolume: Number(state.videoAudioVersion) < 3
          ? 1
          : (Number.isFinite(Number(state.videoVolume)) ? clamp(Number(state.videoVolume), 0, 1) : 1),
        videoLoop: state.videoLoop !== false,
        videoAudioVersion: 3,
        // 'none' shows the app, 'pure' hides every surface but the wallpaper,
        // 'normal' is the same picture as 'none' but holds the lock. The lock
        // survives a reload on purpose: that is what "locked" means.
        modeLock: state.modeLock === MODE_PURE || state.modeLock === MODE_NORMAL ? state.modeLock : MODE_NONE,
        modeKeys: {
          pure: normalizeModeKey(state.modeKeys && state.modeKeys.pure),
          normal: normalizeModeKey(state.modeKeys && state.modeKeys.normal)
        },
        // Opt-in, and off by default: a wallpaper must never decide on its own
        // that the interface should fade away while the user is reading or
        // typing. The explicit pure-mode hotkey covers the "clean screen" case.
        cinemaAutoHide: state.cinemaAutoHide !== false,
        // Last 20 mode/media events, persisted so a recurrence can be explained
        // from storage instead of a screenshot.
        debugLog: (Array.isArray(state.debugLog) ? state.debugLog : [])
          .filter((entry) => entry && typeof entry === 'object' && typeof entry.event === 'string')
          .slice(-20),
        notice: typeof state.notice === 'string' ? state.notice : null,
        importing: state.importing && typeof state.importing === 'object' ? state.importing : null,
        videoImporting: state.videoImporting && typeof state.videoImporting === 'object' ? state.videoImporting : null,
        storageAvailable: state.storageAvailable === true,
        storageReady: state.storageReady === true,
        wallpapersMigrated: state.wallpapersMigrated === true
      };
    }

    function loadState() {
      const base = normalizeState({ dim: DEFAULT_DIM, glass: true });
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return base;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return base;
        const state = normalizeState(Object.assign({}, base, parsed));
        state.quickOpen = false;
        if (state.skinId !== 'default' &&
          !SKIN_PRESETS.some((item) => item.id === state.skinId) &&
          !state.customSkins.some((item) => item.id === state.skinId)) {
          state.skinId = 'default';
        }
        // Wallpaper ids are validated after the IndexedDB hydration, because
        // the remembered custom ids may live only in IndexedDB.
        return state;
      } catch (error) {
        console.error('[skin-studio] could not read saved state', error);
        return base;
      }
    }

    function pickPersisted(state) {
      const persisted = {
        skinId: state.skinId,
        customSkins: state.customSkins,
        wallpaperId: state.wallpaperId,
        favorites: state.favorites,
        wallpaperFilter: state.wallpaperFilter,
        dim: state.dim,
        glass: state.glass,
        videoId: state.videoId,
        videoFavorites: state.videoFavorites,
        videoPlaying: state.videoPlaying,
        // Never persist the mute flag: restoring it is exactly how "no sound
        // after restart" comes back. Reading already forces false; writing
        // false keeps the stored blob honest for anything else that reads it.
        videoMuted: false,
        videoVolume: state.videoVolume,
        videoLoop: state.videoLoop,
        videoAudioVersion: 3,
        modeLock: state.modeLock || MODE_NONE,
        modeKeys: {
          pure: normalizeModeKey(state.modeKeys && state.modeKeys.pure),
          normal: normalizeModeKey(state.modeKeys && state.modeKeys.normal)
        },
        cinemaAutoHide: state.cinemaAutoHide !== false,
        debugLog: (Array.isArray(state.debugLog) ? state.debugLog : []).slice(-20),
        customVideos: state.customVideos.map((item) => ({
          id: item.id,
          name: item.name,
          mime: item.mime || item.type || 'video/*',
          size: Number(item.size) || 0,
          key: item.key || null,
          createdAt: item.createdAt || 0,
          sourcePath: item.sourcePath || null,
          audioUrl: usableAudioUrl(item.audioUrl) || null
        }))
      };
      // Before the IndexedDB migration completes, keep the legacy data URLs in
      // localStorage so a reload cannot lose them. After that, only metadata
      // and IndexedDB blobs remain.
      if (!state.wallpapersMigrated) {
        persisted.customWallpapers = state.customWallpapers
          .filter((item) => (typeof item.full === 'string' && item.full) || (typeof item.url === 'string' && item.url))
          .map((item) => ({
            id: item.id,
            name: item.name,
            lum: item.lum,
            thumb: item.thumb,
            full: item.full,
            url: item.url
          }));
      }
      return persisted;
    }

    function createStore(initial) {
      let state = initial;
      let saveTimer = null;
      const listeners = new Set();

      const emit = () => {
        listeners.forEach((listener) => {
          try {
            listener();
          } catch (error) {
            console.error('[skin-studio] listener failed', error);
          }
        });
      };

      const save = () => {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pickPersisted(state)));
          return true;
        } catch (error) {
          console.error('[skin-studio] could not save state', error);
          return false;
        }
      };

      const scheduleSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveTimer = null;
          if (!save()) {
            state = Object.assign({}, state, { notice: 'storage' });
            emit();
          }
        }, 600);
      };

      return {
        get: () => state,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        set: (patch, options) => {
          state = normalizeState(Object.assign({}, state, patch));
          if (!options || options.persist !== false) scheduleSave();
          emit();
        },
        touch: () => {
          emit();
        },
        notify: (notice) => {
          state = Object.assign({}, state, { notice });
          emit();
        },
        dismissNotice: () => {
          if (!state.notice) return;
          state = Object.assign({}, state, { notice: null });
          emit();
        },
        dispose: () => {
          if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
            save();
          }
          listeners.clear();
        }
      };
    }

    // ---------- wallpaper storage ----------

    function createStores(db) {
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('videoItems')) db.createObjectStore('videoItems', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('videoBlobs')) db.createObjectStore('videoBlobs');
      // Version 3 originally added a dedicated handle store. We now keep the
      // schema at v2 and store handles inside videoBlobs so opening the DB never
      // needs a version bump (an older window can otherwise block the upgrade
      // forever and make every photo/video import fail).
      if (db.version >= 3 && !db.objectStoreNames.contains('videoHandles')) db.createObjectStore('videoHandles');
    }

    function openWallpaperDb(versionOverride, attempt) {
      return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is unavailable'));
          return;
        }
        const tries = typeof attempt === 'number' ? attempt : 0;
        const version = typeof versionOverride === 'number' ? versionOverride : DB_VERSION;
        let request;
        try {
          request = indexedDB.open(DB_NAME, version);
        } catch (error) {
          reject(error);
          return;
        }
        let settled = false;
        const finish = (fn, arg) => { if (settled) return; settled = true; fn(arg); };
        request.onupgradeneeded = () => { createStores(request.result); };
        request.onsuccess = () => {
          const db = request.result;
          // Never block a newer tab from upgrading: drop our handle the moment
          // another context asks for a version change.
          db.onversionchange = () => {
            try { db.close(); } catch (error) { /* ignore */ }
          };
          finish(resolve, db);
        };
        request.onerror = () => {
          const err = request.error;
          // VersionError: a leftover database exists at a HIGHER version than
          // this build expects (e.g. from an earlier experiment). Rather than
          // leaving storage permanently unavailable, reopen at whatever
          // version actually exists and use its stores as-is.
          if (err && err.name === 'VersionError' && !versionOverride) {
            const probe = indexedDB.open(DB_NAME);
            probe.onsuccess = () => {
              const currentVersion = probe.result.version;
              try { probe.result.close(); } catch (e) { /* ignore */ }
              openWallpaperDb(currentVersion, tries + 1).then(
                (db) => finish(resolve, db),
                (e2) => finish(reject, e2)
              );
            };
            probe.onerror = () => finish(reject, err);
            return;
          }
          finish(reject, err || new Error('IndexedDB open failed'));
        };
        request.onblocked = () => {
          // Another tab holds an old connection. Retry a few times instead of
          // rejecting outright (fixes the "storage never becomes ready" hang
          // that disabled photo upload); give up only after a bounded wait.
          if (tries >= 6) {
            // The upgrade is being held by an older window that will not close.
            // Fall back to the version that actually exists so photo storage
            // (items/blobs) keeps working instead of disabling every upload.
            if (!versionOverride) {
              const probe = indexedDB.open(DB_NAME);
              probe.onsuccess = () => {
                const currentVersion = probe.result.version;
                try { probe.result.close(); } catch (e) { /* ignore */ }
                openWallpaperDb(currentVersion, tries + 1).then(
                  (db) => finish(resolve, db),
                  (e2) => finish(reject, e2)
                );
              };
              probe.onerror = () => finish(reject, new Error('IndexedDB blocked'));
              return;
            }
            finish(reject, new Error('IndexedDB blocked'));
            return;
          }
          setTimeout(() => {
            if (settled) return;
            settled = true;
            openWallpaperDb(versionOverride, tries + 1).then(resolve, reject);
          }, 400);
        };
      });
    }

    async function idbListItems() {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('items', 'readonly');
        const request = tx.objectStore('items').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      });
    }

    async function idbPutItem(item) {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('items', 'readwrite');
        tx.objectStore('items').put(item);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error('IndexedDB write failed'));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error('IndexedDB write aborted'));
        };
      });
    }

    async function idbPutBlob(id, blob) {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(blob, id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error('IndexedDB write failed'));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error('IndexedDB write aborted'));
        };
      });
    }

    async function idbGetBlob(id) {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('blobs', 'readonly');
        const request = tx.objectStore('blobs').get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('IndexedDB read failed'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      });
    }

    async function idbDeleteWallpaper(id) {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['items', 'blobs'], 'readwrite');
        tx.objectStore('items').delete(id);
        tx.objectStore('blobs').delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error('IndexedDB delete failed'));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error('IndexedDB delete aborted'));
        };
      });
    }

    async function idbClearWallpapers() {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['items', 'blobs'], 'readwrite');
        tx.objectStore('items').clear();
        tx.objectStore('blobs').clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error('IndexedDB clear failed'));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error || new Error('IndexedDB clear aborted'));
        };
      });
    }

    async function idbListVideoItems() {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('videoItems', 'readonly');
        const request = tx.objectStore('videoItems').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error('IndexedDB video read failed'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      });
    }

    async function idbPutVideoItem(item) {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('videoItems', 'readwrite');
        tx.objectStore('videoItems').put(item);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB video write failed')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB video write aborted')); };
      });
    }

    async function idbPutVideoBlob(id, blob) {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('videoBlobs', 'readwrite');
        tx.objectStore('videoBlobs').put(blob, id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB video write failed')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB video write aborted')); };
      });
    }

    async function idbGetVideoBlob(id) {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('videoBlobs', 'readonly');
        const request = tx.objectStore('videoBlobs').get(id);
        request.onsuccess = () => {
          const value = request.result || null;
          resolve(value && typeof value.getFile !== 'function' ? value : null);
        };
        request.onerror = () => reject(request.error || new Error('IndexedDB video read failed'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      });
    }

    // Persist a FileSystemFileHandle (structured-cloneable, tiny — no bytes are
    // copied). This lets a full-size movie stream natively from disk instead of
    // being materialised into IndexedDB.
    function videoHandleStoreName(db) {
      return db.objectStoreNames.contains('videoHandles') ? 'videoHandles' : 'videoBlobs';
    }

    async function idbPutVideoHandle(id, handle) {
      const db = await openWallpaperDb();
      const storeName = videoHandleStoreName(db);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(handle, id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB video handle write failed')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB video handle write aborted')); };
      });
    }

    async function idbGetVideoHandle(id) {
      const db = await openWallpaperDb();
      const storeName = videoHandleStoreName(db);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(id);
        request.onsuccess = () => {
          const value = request.result || null;
          resolve(value && typeof value.getFile === 'function' ? value : null);
        };
        request.onerror = () => reject(request.error || new Error('IndexedDB video handle read failed'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      });
    }

    function videoStoreNames(db) {
      const names = ['videoItems', 'videoBlobs'];
      if (db.objectStoreNames.contains('videoHandles')) names.push('videoHandles');
      return names;
    }

    async function idbDeleteVideo(id) {
      const db = await openWallpaperDb();
      const names = videoStoreNames(db);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(names, 'readwrite');
        tx.objectStore('videoItems').delete(id);
        tx.objectStore('videoBlobs').delete(id);
        if (names.indexOf('videoHandles') !== -1) tx.objectStore('videoHandles').delete(id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB video delete failed')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB video delete aborted')); };
      });
    }

    async function idbDeleteVideoBlob(id) {
      const db = await openWallpaperDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('videoBlobs', 'readwrite');
        tx.objectStore('videoBlobs').delete(id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB blob delete failed')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB blob delete aborted')); };
      });
    }

    async function idbClearVideos() {
      const db = await openWallpaperDb();
      const names = videoStoreNames(db);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(names, 'readwrite');
        tx.objectStore('videoItems').clear();
        tx.objectStore('videoBlobs').clear();
        if (names.indexOf('videoHandles') !== -1) tx.objectStore('videoHandles').clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB video clear failed')); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB video clear aborted')); };
      });
    }

    // ---------- image import ----------

    function isImageFile(file) {
      if (!file) return false;
      if (typeof file.type === 'string' && /^image\//.test(file.type)) return true;
      return /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(file.name || '');
    }

    function isVideoFile(file) {
      if (!file) return false;
      if (typeof file.type === 'string' && /^video\//.test(file.type)) return true;
      // Accept any common container; decoding still depends on the browser's
      // codec support (chromium plays H.264/VP8/VP9/AV1, not every ProRes/H.265).
      return /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|mpe?g|m2ts|ts|flv|wmv|3gp)$/i.test(file.name || '');
    }

    function videoFileKey(file) {
      return (file.webkitRelativePath || file.name || '') + ':' + (file.size || 0) + ':' + (file.lastModified || 0);
    }

    function videoDisplayName(name) {
      return String(name || 'video').replace(/\.[^.]+$/, '').trim().slice(0, 60) || 'video';
    }

    function formatBytes(value) {
      const bytes = Math.max(0, Number(value) || 0);
      if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
      return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    async function dataUrlToBlob(dataUrl) {      const text = String(dataUrl || '');
      if (!text) throw new Error('empty data URL');
      if (typeof fetch === 'function') {
        const response = await fetch(text);
        return response.blob();
      }
      const comma = text.indexOf(',');
      if (comma < 0) throw new Error('invalid data URL');
      const header = text.slice(0, comma);
      const body = text.slice(comma + 1);
      const mime = (header.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return new Blob([bytes], { type: mime });
    }

    function decodeImageSource(file) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const fail = (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        };
        const fallback = () => {
          const url = URL.createObjectURL(file);
          const image = new Image();
          image.onload = () => finish({
            source: image,
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
            dispose: () => URL.revokeObjectURL(url)
          });
          image.onerror = () => {
            URL.revokeObjectURL(url);
            fail(new Error('image decode failed'));
          };
          image.src = url;
        };
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(file).then((bitmap) => finish({
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            dispose: () => {
              if (bitmap.close) bitmap.close();
            }
          })).catch(fallback);
        } else {
          fallback();
        }
      });
    }

    function drawCanvas(source, maxSide) {
      const width = source.width || source.naturalWidth;
      const height = source.height || source.naturalHeight;
      if (!width || !height) throw new Error('empty image');
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas unavailable');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas;
    }

    function canvasToBlob(canvas, quality) {
      return new Promise((resolve, reject) => {
        const accept = (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('image encode failed'));
        };
        if (typeof canvas.toBlob !== 'function') {
          try {
            const dataUrl = canvas.toDataURL('image/webp', quality);
            fetch(dataUrl).then((response) => response.blob()).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
          return;
        }
        canvas.toBlob((blob) => {
          if (blob) {
            accept(blob);
            return;
          }
          canvas.toBlob((fallback) => accept(fallback), 'image/jpeg', quality);
        }, 'image/webp', quality);
      });
    }

    function canvasToDataUrl(canvas, quality) {
      let output = '';
      try {
        output = canvas.toDataURL('image/webp', quality);
      } catch (error) {
        output = '';
      }
      if (!output || output === 'data:,') output = canvas.toDataURL('image/jpeg', quality);
      return output;
    }

    function averageLuminance(image) {
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) return 0.35;
      try {
        context.drawImage(image, 0, 0, size, size);
      } catch (error) {
        return 0.35;
      }
      let data;
      try {
        data = context.getImageData(0, 0, size, size).data;
      } catch (error) {
        return 0.35;
      }
      const channel = (value) => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      let sum = 0;
      let count = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] < 26) continue;
        sum += 0.2126 * channel(data[index]) + 0.7152 * channel(data[index + 1]) + 0.0722 * channel(data[index + 2]);
        count += 1;
      }
      return count ? clamp(sum / count, 0, 1) : 0.35;
    }

    async function buildWallpaperAsset(file) {
      const decoded = await decodeImageSource(file);
      try {
        const full = await canvasToBlob(drawCanvas(decoded.source, 2400), 0.86);
        const thumb = canvasToDataUrl(drawCanvas(decoded.source, 560), 0.72);
        const lum = averageLuminance(decoded.source);
        const base = (file.name || 'wallpaper').replace(/\.[^.]+$/, '').trim().slice(0, 60) || 'wallpaper';
        return {
          full,
          thumb,
          lum,
          name: base,
          key: (file.webkitRelativePath || file.name || '') + ':' + (file.size || 0)
        };
      } finally {
        if (decoded.dispose) decoded.dispose();
      }
    }

    // ---------- text ----------

    const EN_TEXT = {
      'nav.label': 'Skins & wallpapers',
      'page.desc': 'Recolor the interface and set a chat wallpaper. Changes apply instantly and are remembered for this browser.',
      'preview.label': 'Live preview of the selected skin and wallpaper',
      'section.skin': 'Skin',
      'section.skin.desc': 'Choose light or dark for the whole app, then pick a color mood or build one from an accent and two backgrounds.',
      'theme.mode': 'Appearance',
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'theme.system': 'System',
      'theme.mode.desc': 'Switches the entire interface between light and dark. “System” follows your computer’s appearance setting.',
      'section.wallpaper': 'Wallpaper',
      'section.wallpaper.desc': 'Pick a gradient, upload a photo, or paste an image link. The chat area turns translucent over it.',
      'section.options': 'Wallpaper options',
      'option.dim': 'Soften wallpaper',
      'option.dim.desc': 'Adds a light veil so text stays comfortable on any image.',
      'option.glass': 'Translucent panels',
      'option.glass.desc': 'Lets the wallpaper show through chat cards and the sidebar.',
      'skin.default': 'Default',
      'skin.preset.twilight': 'Twilight',
      'skin.preset.forest': 'Forest',
      'skin.preset.sunset': 'Sunset',
      'skin.preset.sakura': 'Sakura',
      'skin.preset.ocean': 'Ocean',
      'skin.preset.graphite': 'Graphite',
      'skin.preset.cyber': 'Cyber',
      'skin.preset.latte': 'Latte',
      'skin.custom': 'Custom skin',
      'skin.customDesc': 'Pick an accent plus a light background and a dark background.',
      'skin.accent': 'Accent',
      'skin.lightBg': 'Light background',
      'skin.darkBg': 'Dark background',
      'skin.name': 'Name',
      'skin.namePlaceholder': 'My skin',
      'skin.save': 'Save skin',
      'skin.delete': 'Delete skin',
      'skin.untitled': 'My skin',
      'skin.limit': 'You can keep up to 12 custom skins.',
      'wallpaper.none': 'None',
      'wallpaper.preset.aurora': 'Aurora',
      'wallpaper.preset.sunset': 'Sunset glow',
      'wallpaper.preset.ocean': 'Deep ocean',
      'wallpaper.preset.forest': 'Forest mist',
      'wallpaper.preset.sakura': 'Sakura',
      'wallpaper.preset.starry': 'Starry night',
      'wallpaper.preset.paper': 'Paper',
      'wallpaper.preset.slate': 'Slate',
      'wallpaper.preset.neon': 'Neon',
      'wallpaper.add': 'Add',
      'wallpaper.addFiles': 'Add images (multi-select)',
      'wallpaper.addFolder': 'Add folder',
      'wallpaper.addHint': 'The add tile stays at the front of every page. Pick several images or a whole folder; drop images and folders here too. Hover a photo for its delete button, or click the circle to select several.',
      'wallpaper.filter.all': 'All',
      'wallpaper.filter.favorites': 'Favorites',
      'wallpaper.filter.mine': 'My photos',
      'wallpaper.filter.presets': 'Gradients',
      'wallpaper.empty': 'No wallpapers here yet.',
      'wallpaper.emptyFavorites': 'No favorites yet. Use the star on a wallpaper to add one.',
      'wallpaper.emptyMine': 'No photos yet. Use the add tile at the top left.',
      'wallpaper.favorite': 'Favorite',
      'wallpaper.select': 'Select photo',
      'wallpaper.deselect': 'Deselect photo',
      'wallpaper.selected': 'Selected',
      'wallpaper.selectAll': 'Select all',
      'wallpaper.deselectAll': 'Deselect all',
      'wallpaper.deleteSelected': 'Delete selected',
      'wallpaper.deleteSelectedShort': 'Delete',
      'wallpaper.deleteManyConfirm': 'Delete the selected photos? This cannot be undone.',
      'wallpaper.cancel': 'Cancel',
      'wallpaper.unfavorite': 'Remove from favorites',
      'wallpaper.prev': 'Previous page',
      'wallpaper.next': 'Next page',
      'wallpaper.swipeHint': 'Tip: swipe left or right on a trackpad to flip pages.',
      'wallpaper.swipeShort': 'Swipe sideways to flip.',
      'wallpaper.importing': 'Adding {done}/{total}…',
      'wallpaper.preparing': 'Preparing…',
      'wallpaper.clear': 'Clear custom wallpapers',
      'wallpaper.clearConfirm': 'Delete all custom wallpapers? This cannot be undone.',
      'wallpaper.partial': 'Some images could not be read and were skipped.',
      'wallpaper.duplicates': 'Those images are already in your wallpapers.',
      'wallpaper.storageUnavailable': 'Local wallpaper storage is unavailable in this browser.',
      'wallpaper.url': 'Image link',
      'wallpaper.urlPlaceholder': 'https://…',
      'wallpaper.addUrl': 'Add link',
      'wallpaper.delete': 'Delete wallpaper',
      'wallpaper.untitled': 'Wallpaper',
      'wallpaper.limit': 'You have reached the custom wallpaper limit.',
      'quick.label': 'Switch skin and wallpaper',
      'quick.title': 'Skins & wallpapers',
      'quick.random': 'Shuffle',
      'quick.close': 'Close',
      'quick.hint': 'More options: Settings → Skins & wallpapers.',
      'quick.wallpaper': 'Wallpaper',
      'quick.skin': 'Skin',
      'section.modes': 'Display mode',
      'section.modes.desc': 'Hide the whole interface and leave only the wallpaper. Map two shortcuts; each one locks and unlocks its own mode.',
      'mode.pure': 'Pure mode',
      'mode.pure.desc': 'No interface at all — wallpaper and video only.',
      'mode.normal': 'Normal mode',
      'mode.normal.desc': 'Keep the full DeepSeek Harness interface on top of the wallpaper.',
      'mode.unset': 'Click, then press a combination',
      'mode.recording': 'Press a combination…',
      'mode.needModifier': 'Add Ctrl, ⌘ or Alt — a bare key would break typing.',
      'mode.pureHint': 'Pure mode · press Esc twice to come back',
      'video.clockHint': 'Click to play or pause · F8',
      'section.vault': 'Key vault',
      'vault.open': 'Open key vault',
      'vault.desc': 'The vault chip moved out of the composer row so the playback clock can use that spot.',
      'vault.missing': 'The key vault plugin is not installed in this profile.',
      'mode.conflict': 'That combination already belongs to the other mode.',
      'mode.clear': 'Clear shortcut',
      'mode.hint': 'First press locks the mode, the second press unlocks it. While one mode is locked the other shortcut is ignored. In pure mode, Esc twice is the emergency exit.',
      'mode.now': 'Now:',
      'mode.autoHide': 'Auto-hide the interface',
      'mode.autoHide.desc': 'Fades the app 5 seconds after the last input while a video plays. Off by default; it never hides while you are typing.',
      'mode.on': 'On',
      'mode.off': 'Off',
      'mode.state.pure': 'pure (locked)',
      'mode.state.normal': 'normal (locked)',
      'mode.state.none': 'normal',
      'mode.enterPure': 'Enter pure mode',
      'mode.exit': 'Back to normal',
      'notice.modeTyping': 'Cursor is in the input box — the screen will not hide. Move the caret away or press Esc, then use the shortcut.',
      'notice.modeExit': 'Left pure mode.',
      'notice.modeBlockedPure': 'Pure mode is locked — press its own shortcut to leave it.',
      'notice.modeBlockedNormal': 'Normal mode is locked — press its own shortcut to release it.',
      'reset': 'Reset to default',
      'reset.confirm': 'Reset the skin, wallpaper, and options to their defaults? Your custom items are kept.',
      'notice.storage': 'Browser storage is full; the change applies to this session only.',
      'notice.image': 'That image could not be read. Try another file.',
      'notice.url': 'Enter a valid http(s) image link.',
      'notice.skinLimit': 'You can keep up to 12 custom skins.',
      'notice.wallpaperLimit': 'You have reached the custom wallpaper limit.',
      'section.video': 'Video wallpaper',
      'section.video.desc': 'Use any local video (any size, any length) as the full-screen Harness background. It streams straight from disk, not copied into storage. Add several at once or a whole folder and they play as a playlist; the browser asks for one click before it allows sound.',
      'video.none': 'No video',
      'video.add': 'Add video',
      'video.addFiles': 'Add local video',
      'video.addFolder': 'Add a folder of videos',
      'video.prev': 'Previous video',
      'video.next': 'Next video',
      'video.playlist': 'Playlist',
      'video.relink': 'Relink the original file',
      'video.relinkHint': 'This video was added without a file path, so the player cannot prepare its audio track. Click the link button at the bottom-left of the card and point it at the original file once — after that it plays with sound.',
      'video.relinked': 'Original file linked. Preparing a playable audio track…',
      'video.relinkedAuto': 'Found the original file on disk and linked it. Audio is being prepared…',
      'video.pathMissing': 'Some videos have no file path, so their audio track may not play. Use the link button at the bottom-left of the card to point at the original file once.',
      'video.relinkFailed': 'Could not find the original file. Please pick it in the dialog.',
      'common.yes': 'yes',
      'common.no': 'no',
      'video.diag': 'Diagnostics — original file: {path} · audio track: {audio} · video muted: {muted} · picture: {video} · sound: {sound}',
      'video.diagCopy': 'Copy diagnostics',
      'video.deleteManyConfirm': 'Delete the selected videos?',
      'video.addHint': 'Videos are referenced from their original files, so there is no size limit. Use ＋ for a multi-selection, the folder button for a whole directory (sorted by name), or drop files and folders onto the tile.',
      'video.play': 'Play video',
      'video.pause': 'Pause video',
      'video.mute': 'Mute video',
      'video.unmute': 'Unmute video',
      'video.loop': 'Loop video',
      'video.volume': 'Volume',
      'video.progress': 'Playback progress',
      'video.delete': 'Delete video',
      'video.clear': 'Remove all videos',
      'video.clearConfirm': 'Remove all saved videos? This cannot be undone.',
      'video.empty': 'No local videos yet — tap ＋ to add one.',
      'video.importing': 'Adding {done}/{total}…',
      'video.limit': 'You have reached the local video limit.',
      'video.tooLarge': 'That video is too large to store.',
      'video.invalid': 'That video could not be saved. If the file is very large, the browser storage may be full.',
      'video.partial': 'Some videos could not be saved and were skipped.',
      'video.deleted': 'Video removed.',
      'video.quota': 'Not enough browser storage for this video. Remove some videos or pick a smaller file.',
      'video.playbackError': 'This video format cannot be played by the browser. Try an MP4 (H.264) or WebM file.',
      'video.proxyReady': 'This HEVC video now has a seekable H.264 copy. Dragging the progress bar works.',
      'video.audioUnsupported': 'This movie uses an audio codec the player cannot decode, and a compatible audio track could not be prepared.',
      'video.autoplayBlocked': 'Browsers block autoplay with sound. Click anywhere on the page (or press play) to start it.',
      'video.reselect': 'This video needs to be re-selected to grant file access. Click ＋ and pick the same file again.',
      'notice.videoStorage': 'Local video storage is unavailable in this browser.'
    };

    const ZH_TEXT = {
      'nav.label': '皮肤与壁纸',
      'page.desc': '给界面换一套配色，再铺一张聊天壁纸。改动即时生效，并会记住在当前浏览器里。',
      'preview.label': '当前皮肤与壁纸的实时预览',
      'section.skin': '皮肤',
      'section.skin.desc': '先选白天或夜间，再挑一种配色氛围，或用主色和两个背景色自己做一个。',
      'theme.mode': '外观模式',
      'theme.light': '白天',
      'theme.dark': '夜间',
      'theme.system': '跟随系统',
      'theme.mode.desc': '整个界面在白天与夜间之间切换；“跟随系统”跟随电脑的外观设置。',
      'section.wallpaper': '壁纸',
      'section.wallpaper.desc': '选一张渐变、上传图片或粘贴图片链接；聊天区域会变成半透明，让壁纸透出来。',
      'section.options': '壁纸选项',
      'option.dim': '柔化壁纸',
      'option.dim.desc': '在壁纸上叠加柔光，任何图片上文字都更舒服。',
      'option.glass': '半透明面板',
      'option.glass.desc': '让聊天卡片和侧栏透出壁纸。',
      'skin.default': '默认',
      'skin.preset.twilight': '暮光紫',
      'skin.preset.forest': '森林青',
      'skin.preset.sunset': '暖阳橘',
      'skin.preset.sakura': '樱花粉',
      'skin.preset.ocean': '深海蓝',
      'skin.preset.graphite': '极简灰',
      'skin.preset.cyber': '赛博青',
      'skin.preset.latte': '拿铁棕',
      'skin.custom': '自定义皮肤',
      'skin.customDesc': '选一个主色，再分别选浅色和深色背景。',
      'skin.accent': '主色',
      'skin.lightBg': '浅色背景',
      'skin.darkBg': '深色背景',
      'skin.name': '名称',
      'skin.namePlaceholder': '我的皮肤',
      'skin.save': '保存皮肤',
      'skin.delete': '删除皮肤',
      'skin.untitled': '我的皮肤',
      'skin.limit': '最多保留 12 个自定义皮肤。',
      'wallpaper.none': '无',
      'wallpaper.preset.aurora': '极光',
      'wallpaper.preset.sunset': '日落',
      'wallpaper.preset.ocean': '深海',
      'wallpaper.preset.forest': '森林雾',
      'wallpaper.preset.sakura': '樱花',
      'wallpaper.preset.starry': '星夜',
      'wallpaper.preset.paper': '纸感',
      'wallpaper.preset.slate': '磨砂灰',
      'wallpaper.preset.neon': '霓虹',
      'wallpaper.add': '添加',
      'wallpaper.addFiles': '添加图片（可多选）',
      'wallpaper.addFolder': '添加文件夹',
      'wallpaper.addHint': '添加格子固定在每页最前面；可多选图片或选择整个文件夹，也可以直接把图片和文件夹拖到这里。悬停照片可单张删除，点左上角圆圈可多选。',
      'wallpaper.filter.all': '全部',
      'wallpaper.filter.favorites': '收藏',
      'wallpaper.filter.mine': '我的照片',
      'wallpaper.filter.presets': '渐变',
      'wallpaper.empty': '这个分类还没有壁纸。',
      'wallpaper.emptyFavorites': '还没有收藏。点壁纸左侧的星标即可收藏。',
      'wallpaper.emptyMine': '还没有添加照片。点左上角的添加格子即可导入。',
      'wallpaper.favorite': '收藏',
      'wallpaper.select': '选择照片',
      'wallpaper.deselect': '取消选择',
      'wallpaper.selected': '已选',
      'wallpaper.selectAll': '全选',
      'wallpaper.deselectAll': '取消全选',
      'wallpaper.deleteSelected': '删除所选',
      'wallpaper.deleteSelectedShort': '删除',
      'wallpaper.deleteManyConfirm': '要删除选中的照片吗？此操作不可撤销。',
      'wallpaper.cancel': '取消',
      'wallpaper.unfavorite': '取消收藏',
      'wallpaper.prev': '上一页',
      'wallpaper.next': '下一页',
      'wallpaper.swipeHint': '小提示：在触控板上左右滑动即可翻页。',
      'wallpaper.swipeShort': '左右滑动翻页',
      'wallpaper.importing': '正在添加 {done}/{total}…',
      'wallpaper.preparing': '正在准备…',
      'wallpaper.clear': '清空自定义壁纸',
      'wallpaper.clearConfirm': '要删除全部自定义壁纸吗？此操作不可撤销。',
      'wallpaper.partial': '部分图片无法读取，已跳过。',
      'wallpaper.duplicates': '这些图片已经添加过了。',
      'wallpaper.storageUnavailable': '当前浏览器无法使用本地壁纸存储。',
      'wallpaper.url': '图片链接',
      'wallpaper.urlPlaceholder': 'https://…',
      'wallpaper.addUrl': '添加链接',
      'wallpaper.delete': '删除壁纸',
      'wallpaper.untitled': '壁纸',
      'wallpaper.limit': '已达到自定义壁纸数量上限。',
      'quick.label': '切换皮肤与壁纸',
      'quick.title': '皮肤与壁纸',
      'quick.random': '随机换装',
      'quick.close': '关闭',
      'quick.hint': '更多选项：设置 → 皮肤与壁纸。',
      'quick.wallpaper': '壁纸',
      'quick.skin': '皮肤',
      'section.modes': '显示模式',
      'section.modes.desc': '把界面整体隐藏，只留壁纸。映射两个快捷键，各自锁定、各自解除。',
      'mode.pure': '纯净模式',
      'mode.pure.desc': '不显示任何界面，只剩壁纸与视频。',
      'mode.normal': '正常模式',
      'mode.normal.desc': '在壁纸之上显示完整的 DeepSeek Harness 界面。',
      'mode.unset': '点击后按下组合键',
      'mode.recording': '请按下组合键…',
      'mode.needModifier': '至少要有 Ctrl / ⌘ / Alt 之一，否则会抢走正常打字。',
      'mode.pureHint': '纯净模式 · 连按两次 Esc 退出',
      'video.clockHint': '点一下播放/暂停 · F8',
      'section.vault': '密码库',
      'vault.open': '打开密码库',
      'vault.desc': '密码库的胶囊从输入框那一行移到这里，空出的位置用来显示播放时间。',
      'vault.missing': '当前 profile 里没有安装密码库插件。',
      'mode.conflict': '这个组合已经被另一种模式占用。',
      'mode.clear': '清除快捷键',
      'mode.hint': '第一次按锁定该模式，再按一次解除锁定。锁定期间另一个快捷键不生效。在纯净模式下，连按两次 Esc 是应急出口。',
      'mode.now': '当前：',
      'mode.autoHide': '界面自动隐藏（沉浸）',
      'mode.autoHide.desc': '播放视频时，停止操作 5 秒后隐藏界面。默认关闭；输入文字时永不隐藏。',
      'mode.on': '已开启',
      'mode.off': '已关闭',
      'mode.state.pure': '纯净（已锁定）',
      'mode.state.normal': '正常（已锁定）',
      'mode.state.none': '正常',
      'mode.enterPure': '进入纯净模式',
      'mode.exit': '回到正常界面',
      'notice.modeTyping': '光标在输入框里，画面不会隐藏。先移开光标或按 Esc，再按快捷键。',
      'notice.modeExit': '已退出纯净模式。',
      'notice.modeBlockedPure': '纯净模式已锁定，请用它自己的快捷键解除。',
      'notice.modeBlockedNormal': '正常模式已锁定，请用它自己的快捷键解除。',
      'reset': '恢复默认',
      'reset.confirm': '要把皮肤、壁纸和选项恢复默认吗？自定义内容会保留。',
      'notice.storage': '浏览器存储空间已满，刚才的改动只在本次会话生效。',
      'notice.image': '这张图片读取失败，请换一张试试。',
      'notice.url': '请输入有效的 http(s) 图片链接。',
      'notice.skinLimit': '最多保留 12 个自定义皮肤。',
      'notice.wallpaperLimit': '已达到自定义壁纸数量上限。',
      'section.video': '视频壁纸',
      'section.video.desc': '用任意本地视频（不限大小、不限时长）做全屏 Harness 背景，直接从磁盘流式播放，不复制进存储。可以一次多选或直接导入整个文件夹，它们会排队播放；浏览器需要你先点一下页面才允许出声。',
      'video.none': '关闭视频',
      'video.add': '添加视频',
      'video.addFiles': '添加本地视频',
      'video.addFolder': '添加视频文件夹',
      'video.prev': '上一个视频',
      'video.next': '下一个视频',
      'video.playlist': '播放列表',
      'video.relink': '重新关联原文件',
      'video.relinkHint': '这个视频导入时没有记录文件路径，播放器无法为它准备音轨。点卡片左下角的链接按钮，手动指一次原文件，之后播放就有声音了。',
      'video.relinked': '已关联原文件，正在准备可播放的音轨…',
      'video.relinkedAuto': '已在磁盘上找回原文件并自动关联，正在准备音轨…',
      'video.pathMissing': '有视频没有文件路径，音轨可能无法播放。点卡片左下角的链接按钮指定一次原文件即可。',
      'video.relinkFailed': '没找到原文件，请在弹窗里手动选择一次。',
      'common.yes': '有',
      'common.no': '无',
      'video.diag': '自检 —— 原文件：{path}｜音轨：{audio}｜画面静音：{muted}｜画面：{video}｜声音：{sound}',
      'video.diagCopy': '复制自检信息',
      'video.deleteManyConfirm': '要删除选中的视频吗？',
      'video.addHint': '视频直接引用原文件，没有大小限制。用 ＋ 一次多选，点右上角文件夹按钮导入整个目录（按文件名排序），也可以把文件或文件夹直接拖到磁贴上。',
      'video.play': '播放视频',
      'video.pause': '暂停视频',
      'video.mute': '静音',
      'video.unmute': '打开声音',
      'video.loop': '循环播放',
      'video.volume': '音量',
      'video.progress': '播放进度',
      'video.delete': '删除视频',
      'video.clear': '清空视频',
      'video.clearConfirm': '要删除保存的全部视频吗？此操作不可撤销。',
      'video.empty': '还没有本地视频，点 ＋ 添加一个。',
      'video.importing': '正在添加 {done}/{total}…',
      'video.limit': '已达到本地视频数量上限。',
      'video.tooLarge': '这个视频太大，无法保存。',
      'video.invalid': '这个视频保存失败。如果文件很大，可能是浏览器存储空间已满。',
      'video.partial': '部分视频保存失败，已跳过。',
      'video.deleted': '视频已删除。',
      'video.quota': '浏览器存储空间不足，先删掉一些视频或换个小一点的文件。',
      'video.playbackError': '这个视频格式浏览器无法播放，换成 MP4（H.264）或 WebM 试试。',
      'video.proxyReady': '这个 HEVC 视频已生成可拖动的 H.264 副本，现在可以任意拖动进度。',
      'video.audioUnsupported': '这个视频的音频编码无法直接播放，兼容音轨也没能准备好。',
      'video.autoplayBlocked': '浏览器拦截了带声音的自动播放。在页面任意处点一下（或点播放）即可开始。',
      'video.reselect': '这个视频需要重新选择一次以授权读取文件。点 ＋ 再选一次同一个文件即可。',
      'notice.videoStorage': '当前浏览器无法使用本地视频存储。'
    };

    // ---------- icons ----------

    function IconPalette(props) {
      const size = (props && props.size) || 18;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('path', { d: 'M12 3.2a8.8 8.8 0 1 0 0 17.6h1.1a2.2 2.2 0 0 0 0-4.4h-1a1.8 1.8 0 0 1 0-3.6h2.6a5.8 5.8 0 0 0 5.8-5.8V7A3.8 3.8 0 0 0 16.7 3.2Z' }),
        h('circle', { cx: 7.4, cy: 9.4, r: 1.15, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 9.7, cy: 6.3, r: 1.15, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 13.4, cy: 6.3, r: 1.15, fill: 'currentColor', stroke: 'none' })
      );
    }

    function IconCheck(props) {
      const size = (props && props.size) || 14;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      }, h('path', { d: 'M5 12.4 9.3 16.7 19.2 6.8' }));
    }

    function IconClose(props) {
      const size = (props && props.size) || 14;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('path', { d: 'M6 6l12 12' }),
        h('path', { d: 'M18 6 6 18' })
      );
    }

    function IconShuffle(props) {
      const size = (props && props.size) || 14;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('path', { d: 'M4 6h3.4c1.2 0 2.3.6 3 1.6l3.3 4.8c.7 1 1.8 1.6 3 1.6H20' }),
        h('path', { d: 'M17 4l3 3-3 3' }),
        h('path', { d: 'M4 18h3.4c1.2 0 2.3-.6 3-1.6l1-1.4' }),
        h('path', { d: 'M17 14l3 3-3 3' })
      );
    }

    function IconSun(props) {
      const size = (props && props.size) || 14;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('circle', { cx: 12, cy: 12, r: 4.2 }),
        h('path', { d: 'M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6' })
      );
    }

    function IconMoon(props) {
      const size = (props && props.size) || 14;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      }, h('path', { d: 'M20.6 14.4A8.6 8.6 0 0 1 9.6 3.4a8.6 8.6 0 1 0 11 11Z' }));
    }

    function IconMonitor(props) {
      const size = (props && props.size) || 14;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('rect', { x: 3, y: 4.5, width: 18, height: 12, rx: 2 }),
        h('path', { d: 'M9 20h6M12 16.5V20' })
      );
    }

    function IconUpload(props) {
      const size = (props && props.size) || 14;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('path', { d: 'M12 16V4' }),
        h('path', { d: 'M7.5 8.5 12 4l4.5 4.5' }),
        h('path', { d: 'M5 17v2.5h14V17' })
      );
    }

    function IconPlay(props) {
      const size = (props && props.size) || 14;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor',
        'aria-hidden': true, focusable: 'false'
      }, h('path', { d: 'M8 5v14l11-7z' }));
    }

    function IconPause(props) {
      const size = (props && props.size) || 14;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'currentColor',
        'aria-hidden': true, focusable: 'false'
      },
        h('rect', { x: 7, y: 5, width: 3.5, height: 14, rx: 1 }),
        h('rect', { x: 13.5, y: 5, width: 3.5, height: 14, rx: 1 })
      );
    }

    function IconVolume(props) {
      const size = (props && props.size) || 14;
      const muted = Boolean(props && props.muted);
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('path', { d: 'M4 9.5h3.2L12 5.5v13l-4.8-4H4z', fill: 'currentColor', stroke: 'none' }),
        muted
          ? h('path', { d: 'M16 9l5 6M21 9l-5 6' })
          : h('path', { d: 'M16 8.5a5 5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12' })
      );
    }

    function IconTrash(props) {
      const size = (props && props.size) || 14;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('path', { d: 'M4 7h16' }),
        h('path', { d: 'M9.5 7V4.8h5V7' }),
        h('path', { d: 'M6.8 7 7.7 20h8.6l.9-13' })
      );
    }

    function IconPlus(props) {
      const size = (props && props.size) || 18;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.9, strokeLinecap: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('path', { d: 'M12 5v14' }),
        h('path', { d: 'M5 12h14' })
      );
    }

    function IconFolderPlus(props) {
      const size = (props && props.size) || 12;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('path', { d: 'M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h6.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2Z' }),
        h('path', { d: 'M12 11v5' }),
        h('path', { d: 'M9.5 13.5h5' })
      );
    }

    function IconStar(props) {
      const size = (props && props.size) || 12;
      const filled = Boolean(props && props.filled);
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: filled ? 'currentColor' : 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      }, h('path', { d: 'M12 3.4l2.65 5.37 5.93.86-4.29 4.18 1.01 5.9L12 16.93l-5.3 2.78 1.01-5.9-4.29-4.18 5.93-.86Z' }));
    }

    function IconLink(props) {
      const size = (props && props.size) || 13;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      },
        h('path', { d: 'M10.6 13.4a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66l-1.41 1.41' }),
        h('path', { d: 'M13.4 10.6a4 4 0 0 0-5.66 0L4.9 13.4a4 4 0 0 0 5.66 5.66l1.41-1.41' })
      );
    }

    function IconChevron(props) {
      const size = (props && props.size) || 14;
      const dir = props && props.dir === 'right' ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7';
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false'
      }, h('path', { d: dir }));
    }

    const STYLE_CSS = `
.dsh-skin-page{display:flex;flex-direction:column;gap:22px;width:100%;max-width:760px;padding:4px 0 44px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55;}
.dsh-skin-page *,.dsh-skin-quick *{box-sizing:border-box;}
.dsh-skin-version{display:inline-block;margin:0 0 12px;padding:2px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-secondary);font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;}
.dsh-skin-lede{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;}
.dsh-skin-notice{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;}
.dsh-skin-notice-x{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:15px;line-height:1;padding:2px 4px;border-radius:6px;}
.dsh-skin-notice-x:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);}
.dsh-skin-preview{position:relative;height:174px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background-size:cover;background-position:center;overflow:hidden;}
.dsh-skin-preview-side{position:absolute;inset:0 auto 0 0;width:25%;display:flex;flex-direction:column;gap:9px;padding:18px 0 0 14px;}
.dsh-skin-preview-dot{width:22px;height:6px;border-radius:999px;}
.dsh-skin-preview-dot.is-soft{width:30px;height:5px;opacity:.72;}
.dsh-skin-preview-main{position:absolute;left:29%;right:14px;top:20px;bottom:46px;display:flex;flex-direction:column;justify-content:center;gap:12px;}
.dsh-skin-preview-bubble{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:12px;width:64%;}
.dsh-skin-preview-bubble.is-assistant{align-self:flex-start;}
.dsh-skin-preview-bubble.is-user{align-self:flex-end;border-bottom-right-radius:4px;}
.dsh-skin-line{display:block;height:5px;border-radius:999px;}
.dsh-skin-preview-composer{position:absolute;left:29%;right:14px;bottom:14px;height:20px;border-radius:8px;border-style:solid;border-width:1px;}
.dsh-skin-section{display:flex;flex-direction:column;gap:10px;}
.dsh-skin-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.dsh-skin-h2{margin:0;font-size:14px;font-weight:600;}
.dsh-skin-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;}
.dsh-skin-hint-warn{color:#ffbe50;}
.dsh-skin-diag{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dsh-skin-mini-btn{padding:2px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;cursor:pointer;}
.dsh-skin-mini-btn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary);}
.dsh-skin-mode-row{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);}
.dsh-skin-mode-copy{display:flex;flex-direction:column;gap:2px;min-width:180px;flex:1;}
.dsh-skin-mode-label{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);}
.dsh-skin-modes{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);}
.dsh-skin-mode{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;line-height:1;cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease;}
.dsh-skin-mode:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);}
.dsh-skin-mode.is-active{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);font-weight:600;}
.dsh-skin-modes.is-compact{padding:1px;border-radius:8px;}
.dsh-skin-modes.is-compact .dsh-skin-mode{height:21px;padding:0 6px;font-size:10.5px;gap:3px;border-radius:6px;}
.dsh-skin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px;}
.dsh-skin-wall-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;}
.dsh-skin-item{position:relative;min-width:0;}
.dsh-skin-card{position:relative;display:flex;flex-direction:column;gap:8px;width:100%;padding:8px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;cursor:pointer;}
.dsh-skin-card:hover{border-color:var(--dsw-alias-border-l2);}
.dsh-skin-card.is-active{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary) inset;}
.dsh-skin-swatch{display:flex;height:56px;border-radius:8px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);}
.dsh-skin-swatch-side{width:30%;}
.dsh-skin-swatch-main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:5px;padding:0 10px;}
.dsh-skin-swatch-chip{display:block;height:7px;width:62%;border-radius:999px;}
.dsh-skin-swatch-chip.is-soft{width:40%;opacity:.92;}
.dsh-skin-card-name{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-skin-check{position:absolute;top:6px;right:6px;display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-brand-primary);color:#fff;}
.dsh-skin-del{position:absolute;top:6px;left:6px;display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;pointer-events:none;transition:opacity .12s ease;}
.dsh-skin-item:hover .dsh-skin-del,.dsh-skin-del:focus-visible{opacity:1;pointer-events:auto;}
.dsh-skin-del:hover{color:var(--dsw-alias-state-error-primary);}
.dsh-skin-photo-del{position:absolute;top:4px;right:4px;z-index:3;display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;pointer-events:none;transition:opacity .12s ease,color .12s ease,border-color .12s ease;}
.dsh-skin-item:hover .dsh-skin-photo-del,.dsh-skin-wall-cell:hover .dsh-skin-photo-del,.dsh-skin-photo-del:focus-visible{opacity:1;pointer-events:auto;}
.dsh-skin-photo-del:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);}
.dsh-skin-photo-del:disabled{opacity:.35;cursor:default;pointer-events:none;}
.dsh-skin-select{position:absolute;top:4px;left:4px;z-index:3;display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);color:transparent;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .12s ease,background .12s ease,border-color .12s ease,color .12s ease;}
.dsh-skin-item:hover .dsh-skin-select,.dsh-skin-wall-cell:hover .dsh-skin-select,.dsh-skin-select:focus-visible,.dsh-skin-select.is-selected{opacity:1;pointer-events:auto;}
.dsh-skin-select:hover{border-color:var(--dsw-alias-brand-primary);}
.dsh-skin-select.is-selected{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff;}
.dsh-skin-wall-grid.is-selecting .dsh-skin-select,.dsh-skin-walls.is-selecting .dsh-skin-select{opacity:1;pointer-events:auto;}
.dsh-skin-wall-grid.is-selecting .dsh-skin-photo-del,.dsh-skin-walls.is-selecting .dsh-skin-photo-del{opacity:0;visibility:hidden;pointer-events:none;}
.dsh-skin-wall-grid.is-selecting .dsh-skin-fav,.dsh-skin-walls.is-selecting .dsh-skin-fav{opacity:0;visibility:hidden;pointer-events:none;}
.dsh-skin-wall-card{position:relative;display:flex;flex-direction:column;gap:6px;width:100%;padding:6px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;cursor:pointer;}
.dsh-skin-wall-card:hover{border-color:var(--dsw-alias-brand-primary);}
.dsh-skin-wall-card.is-active{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary) inset;}
.dsh-skin-wall-card.is-selected{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary) inset;background:var(--dsw-alias-bg-layer-1);}
.dsh-skin-wall-thumb{position:relative;display:block;height:72px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background-color:var(--dsw-alias-bg-layer-2);background-size:cover;background-position:center;overflow:hidden;}
.dsh-skin-wall-thumb.is-none,.dsh-skin-wall-mini.is-none{background-image:linear-gradient(135deg,transparent 46%,var(--dsw-alias-border-l2) 46%,var(--dsw-alias-border-l2) 54%,transparent 54%);}
.dsh-skin-badge{position:absolute;top:6px;right:6px;display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--dsw-alias-brand-primary);color:#fff;}
.dsh-skin-wall-thumb .dsh-skin-badge{top:auto;right:6px;bottom:6px;}
.dsh-skin-wall-mini .dsh-skin-badge{top:auto;right:4px;bottom:4px;width:16px;height:16px;}
.dsh-skin-wall-name{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-skin-section-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;}
.dsh-skin-wall-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
.dsh-skin-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.dsh-skin-filter{height:24px;padding:0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:10.5px;line-height:1;cursor:pointer;transition:background .12s ease,color .12s ease,border-color .12s ease;}
.dsh-skin-filter:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}
.dsh-skin-filter.is-active{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff;}
.dsh-skin-pager{display:flex;align-items:center;gap:2px;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;}
.dsh-skin-page-btn{display:flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}
.dsh-skin-page-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dsh-skin-page-btn:disabled{opacity:.32;cursor:default;background:transparent;}
.dsh-skin-page-num{min-width:38px;text-align:center;color:var(--dsw-alias-label-secondary);}
.dsh-skin-select-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid var(--dsw-alias-brand-primary);border-radius:10px;background:var(--dsw-alias-bg-layer-1);}
.dsh-skin-select-count{font-size:11px;font-weight:600;color:var(--dsw-alias-brand-primary);white-space:nowrap;}
.dsh-skin-select-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;}
.dsh-skin-select-link,.dsh-skin-select-cancel{padding:2px 4px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1.4;cursor:pointer;white-space:nowrap;}
.dsh-skin-select-link:hover,.dsh-skin-select-cancel:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dsh-skin-select-link:disabled{opacity:.4;cursor:default;background:transparent;}
.dsh-skin-select-bar.is-quick{padding:5px 6px;gap:4px;border-radius:8px;}
.dsh-skin-select-bar.is-quick .dsh-skin-select-count{font-size:10.5px;}
.dsh-skin-select-bar.is-quick .dsh-skin-select-actions{gap:3px;}
.dsh-skin-select-bar.is-quick .dsh-skin-btn{height:24px;padding:0 7px;font-size:10.5px;}
.dsh-skin-select-bar.is-quick .dsh-skin-select-link,.dsh-skin-select-bar.is-quick .dsh-skin-select-cancel{font-size:10.5px;padding:2px 3px;}
.dsh-skin-wall-stage{position:relative;touch-action:pan-y;}
.dsh-skin-wall-page{animation-duration:.18s;animation-timing-function:ease-out;}
.dsh-skin-empty{grid-column:1/-1;padding:10px 2px 2px;}
.dsh-skin-swipe-hint{font-size:10px;margin:-2px 0 0;}
.dsh-skin-progress{margin:0;font-size:12px;color:var(--dsw-alias-brand-primary);}
.dsh-skin-add-item{min-height:52px;}
.dsh-skin-add-main{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;height:100%;min-height:52px;padding:0;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1.2;cursor:pointer;}
.dsh-skin-add-main:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);}
.dsh-skin-add-main:disabled{opacity:.6;cursor:default;}
.dsh-skin-add-item.is-dragging .dsh-skin-add-main{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);}
.dsh-skin-add-label{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-skin-add-folder{position:absolute;top:4px;right:4px;z-index:1;display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);cursor:pointer;}
.dsh-skin-add-folder:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}
.dsh-skin-add-folder:disabled{opacity:.5;cursor:default;}
.dsh-skin-wall-grid .dsh-skin-add-main{min-height:96px;}
.dsh-skin-custom{display:flex;flex-direction:column;gap:10px;}
.dsh-skin-editor{display:flex;flex-direction:column;gap:12px;padding:12px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}
.dsh-skin-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;}
.dsh-skin-field{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);}
.dsh-skin-field>span{flex:none;min-width:74px;}
.dsh-skin-color{width:30px;height:28px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;cursor:pointer;}
.dsh-skin-hex{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,monospace);font-size:11px;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.02em;}
.dsh-skin-input{flex:1;min-width:0;height:28px;padding:0 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:12px;}
.dsh-skin-input::placeholder{color:var(--dsw-alias-label-secondary);}
.dsh-skin-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.dsh-skin-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;}
.dsh-skin-btn:hover{background:var(--dsw-alias-bg-layer-2);}
.dsh-skin-btn:disabled{opacity:.5;cursor:default;}
.dsh-skin-btn.is-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff;}
.dsh-skin-btn.is-danger{background:var(--dsw-alias-state-error-primary);border-color:transparent;color:#fff;}
.dsh-skin-btn.is-danger:hover{filter:brightness(.92);}
.dsh-skin-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.dsh-skin-row .dsh-skin-input{flex:1 1 220px;}
.dsh-skin-options{display:flex;flex-direction:column;gap:14px;padding:12px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}
.dsh-skin-option{display:flex;align-items:center;justify-content:space-between;gap:16px;}
.dsh-skin-option-text{display:flex;flex-direction:column;gap:2px;min-width:0;}
.dsh-skin-option-title{font-size:12px;font-weight:500;}
.dsh-skin-option-desc{font-size:11px;color:var(--dsw-alias-label-secondary);}
.dsh-skin-keys{display:flex;flex-direction:column;gap:8px;margin-top:8px;}
.dsh-skin-key-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-l2);}
.dsh-skin-key-row.is-recording{border-color:var(--dsw-alias-label-primary);box-shadow:0 0 0 2px rgba(64,128,255,.22);}
.dsh-skin-key-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;}
.dsh-skin-key-btn{min-width:150px;justify-content:center;font-variant-numeric:tabular-nums;}
.dsh-skin-key-clear{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;}
.dsh-skin-mode-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;}
.dsh-skin-mode-state{font-size:12px;color:var(--dsw-alias-label-secondary);margin:8px 0 0;}
/* Pure mode: every body child but the portaled wallpaper layer disappears.
   The <style> tags live inside #root and still apply while #root is hidden. */
html[data-dsh-skin-mode="pure"] body > :not(.dsh-skin-video-layer):not(.dsh-skin-pure-hint){display:none !important;}
.dsh-skin-pure-hint{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:2147483001;padding:8px 16px;border-radius:999px;background:rgba(18,18,22,.72);color:#fff;font-size:12px;line-height:1.4;letter-spacing:.02em;pointer-events:none;animation:dsh-skin-hint-in .22s ease-out;}
@keyframes dsh-skin-hint-in{from{opacity:0;transform:translate(-50%,6px);}to{opacity:1;transform:translate(-50%,0);}}
html[data-dsh-skin-mode="pure"],html[data-dsh-skin-mode="pure"] body{overflow:hidden !important;}
.dsh-skin-slider{display:flex;align-items:center;gap:10px;flex:none;}
.dsh-skin-range{width:168px;accent-color:var(--dsw-alias-brand-primary);}
.dsh-skin-value{min-width:36px;text-align:right;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;}
.dsh-skin-switch{position:relative;flex:none;width:34px;height:20px;padding:0;border:none;border-radius:999px;background:var(--dsw-alias-state-idle-primary);cursor:pointer;transition:background .15s ease;}
.dsh-skin-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary);}
.dsh-skin-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb,var(--dsw-alias-bg-layer-1));transition:transform .15s ease;}
.dsh-skin-switch[aria-checked="true"]::after{transform:translateX(14px);}
.dsh-skin-reset{display:flex;justify-content:flex-start;padding-top:2px;}
.dsh-skin-action{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}
.dsh-skin-action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dsh-skin-backdrop{position:fixed;inset:0;z-index:30;background:transparent;pointer-events:auto;}
.dsh-skin-quick{position:fixed;z-index:31;left:16px;bottom:76px;display:flex;flex-direction:column;gap:14px;width:340px;max-height:min(560px,calc(100vh - 120px));overflow:auto;padding:14px;border-radius:16px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel,0 12px 40px rgba(0,0,0,.2));pointer-events:auto;font-size:13px;}
.dsh-skin-quick:focus{outline:none;}
.dsh-skin-quick-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.dsh-skin-quick-title{font-size:13px;font-weight:600;}
.dsh-skin-quick-actions{display:flex;align-items:center;gap:6px;}
.dsh-skin-quick-close{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}
.dsh-skin-quick-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);}
.dsh-skin-quick-section{display:flex;flex-direction:column;gap:8px;}
.dsh-skin-quick-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.dsh-skin-quick-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);}
.dsh-skin-walls{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
.dsh-skin-wall-cell{position:relative;min-width:0;}
.dsh-skin-wall-mini{position:relative;width:100%;height:52px;padding:0;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background-color:var(--dsw-alias-bg-layer-2);background-size:cover;background-position:center;cursor:pointer;}
.dsh-skin-wall-cell:hover .dsh-skin-wall-mini{border-color:var(--dsw-alias-brand-primary);}
.dsh-skin-wall-mini.is-active{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.dsh-skin-wall-mini.is-selected{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.dsh-skin-fav{position:absolute;top:28px;left:4px;right:auto;z-index:2;display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;pointer-events:none;transition:opacity .12s ease,color .12s ease,border-color .12s ease;}
.dsh-skin-fav.is-on{opacity:1;pointer-events:auto;color:#E0A100;border-color:rgba(224,161,0,.55);}
.dsh-skin-fav:hover{color:#E0A100;border-color:rgba(224,161,0,.55);}
.dsh-skin-item:hover .dsh-skin-fav,.dsh-skin-wall-cell:hover .dsh-skin-fav,.dsh-skin-fav:focus-visible{opacity:1;pointer-events:auto;}
.dsh-skin-wall-grid .dsh-skin-fav{opacity:.5;pointer-events:auto;}
.dsh-skin-wall-grid .dsh-skin-fav:hover,.dsh-skin-wall-grid .dsh-skin-fav.is-on{opacity:1;}
.dsh-skin-wall-grid.is-selecting .dsh-skin-fav,.dsh-skin-walls.is-selecting .dsh-skin-fav,.dsh-skin-wall-grid.is-selecting .dsh-skin-photo-del,.dsh-skin-walls.is-selecting .dsh-skin-photo-del{opacity:0;visibility:hidden;pointer-events:none;}
.dsh-skin-dots{display:flex;flex-wrap:wrap;gap:8px;}
.dsh-skin-dot{width:24px;height:24px;padding:0;border:2px solid transparent;border-radius:50%;box-shadow:0 0 0 1px var(--dsw-alias-border-l2) inset;cursor:pointer;}
.dsh-skin-dot.is-active{border-color:var(--dsw-alias-bg-overlay);box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);}
.dsh-skin-quick-row{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--dsw-alias-label-secondary);}
.dsh-skin-quick-row input[type="range"]{flex:1;accent-color:var(--dsw-alias-brand-primary);}
.dsh-skin-quick-foot{padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary);}
.dsh-skin-page button:focus-visible,.dsh-skin-quick button:focus-visible,.dsh-skin-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;}
.dsh-skin-video-layer{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;background:#000;}
.dsh-skin-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border:0;pointer-events:none;}
.dsh-skin-video-veil{position:absolute;inset:0;pointer-events:none;background:var(--dsh-skin-video-veil,transparent);}
.dsh-skin-videos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.dsh-skin-video-item{position:relative;min-width:0;}
.dsh-skin-video-card{position:relative;display:flex;flex-direction:column;width:100%;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);cursor:pointer;text-align:left;}
.dsh-skin-video-card.is-active{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.dsh-skin-video-thumb{position:relative;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden;}
.dsh-skin-video-thumb video{width:100%;height:100%;object-fit:cover;pointer-events:none;}
.dsh-skin-video-meta{display:flex;flex-direction:column;gap:2px;padding:8px 10px;min-width:0;}
.dsh-skin-video-name{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dsh-skin-video-sub{font-size:11px;color:var(--dsw-alias-label-secondary);}
.dsh-skin-video-del{position:absolute;top:6px;right:6px;z-index:2;display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .12s ease;}
.dsh-skin-video-item:hover .dsh-skin-video-del,.dsh-skin-video-del:focus-visible{opacity:1;pointer-events:auto;}
.dsh-skin-video-fav{position:absolute;top:6px;left:6px;z-index:2;display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:rgba(0,0,0,.55);color:rgba(255,255,255,.82);cursor:pointer;opacity:0;pointer-events:none;transition:opacity .12s ease;}
.dsh-skin-video-item:hover .dsh-skin-video-fav,.dsh-skin-video-fav:focus-visible,.dsh-skin-video-fav.is-on{opacity:1;pointer-events:auto;}
.dsh-skin-video-fav.is-on{color:#ffd166;}
/* A video imported without a path can play picture but never sound (its audio
   codec may be E-AC-3/DTS, which needs a host-side ffmpeg sidecar). This is a
   repair affordance, so it stays visible instead of appearing on hover only. */
.dsh-skin-video-relink{position:absolute;left:6px;bottom:6px;z-index:2;display:flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:1px solid rgba(255,190,80,.75);border-radius:50%;background:rgba(0,0,0,.62);color:#ffbe50;cursor:pointer;}
.dsh-skin-video-relink:hover{background:rgba(255,190,80,.24);color:#fff;}
.dsh-skin-video-relink:focus-visible{outline:2px solid #ffbe50;outline-offset:1px;}
.dsh-skin-video-add-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;border:1.5px dashed var(--dsw-alias-border-l1);border-radius:10px;min-height:96px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;}
.dsh-skin-video-add.is-dragging .dsh-skin-video-add-item{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);}
.dsh-skin-video-add .dsh-skin-add-folder{top:6px;right:6px;}
.dsh-skin-video-add-item:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);}
.dsh-skin-video-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);}
.dsh-skin-video-controls.is-compact{flex-direction:row;align-items:center;flex-wrap:wrap;gap:6px;}
.dsh-skin-video-controls.is-compact .dsh-skin-video-toggle{padding:5px 8px;font-size:11px;}
.dsh-skin-video-controls.is-compact .dsh-skin-video-ctl-row{flex:1 0 100%;}
.dsh-skin-video-controls.is-compact .dsh-skin-btn{flex:1 0 100%;justify-content:center;}
.dsh-skin-video-ctl-row{display:flex;align-items:center;gap:8px;}
.dsh-skin-video-ctl-row input[type="range"]{flex:1;accent-color:var(--dsw-alias-brand-primary);}
.dsh-skin-video-toggle{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer;}
.dsh-skin-video-toggle.is-on{background:var(--dsw-alias-brand-primary);color:#fff;border-color:transparent;}
.dsh-skin-video-empty{font-size:12px;color:var(--dsw-alias-label-secondary);padding:8px 0;}
.dsh-skin-quick-videos{display:flex;flex-wrap:wrap;gap:8px;}
.dsh-skin-quick-vadd-wrap{position:relative;flex:none;display:flex;}
.dsh-skin-quick-vadd-wrap.is-dragging .dsh-skin-quick-vadd{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-brand-primary);}
.dsh-skin-quick-vadd-folder{position:absolute;top:-5px;right:-6px;z-index:2;display:flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;}
.dsh-skin-quick-vadd-folder:hover{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}
.dsh-skin-quick-vadd-folder:disabled{opacity:.45;cursor:not-allowed;}
.dsh-skin-quick-vadd{display:flex;align-items:center;justify-content:center;width:56px;height:40px;padding:0;border:1.5px dashed var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;}
.dsh-skin-quick-vadd:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);}
.dsh-skin-quick-vadd:disabled{opacity:.5;cursor:not-allowed;}
.dsh-skin-quick-vthumb{position:relative;width:56px;height:40px;padding:0;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;background:#000;cursor:pointer;flex:none;}
.dsh-skin-quick-vthumb video{width:100%;height:100%;object-fit:cover;pointer-events:none;display:block;}
.dsh-skin-quick-vitem{position:relative;flex:none;}
.dsh-skin-quick-vfav,.dsh-skin-quick-vdel{position:absolute;top:-4px;z-index:2;display:flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:rgba(0,0,0,.7);color:#fff;cursor:pointer;opacity:0;pointer-events:none;}
.dsh-skin-quick-vfav{left:-4px;}
.dsh-skin-quick-vdel{right:-4px;}
.dsh-skin-quick-vitem:hover .dsh-skin-quick-vfav,.dsh-skin-quick-vitem:hover .dsh-skin-quick-vdel,.dsh-skin-quick-vfav.is-on{opacity:1;pointer-events:auto;}
.dsh-skin-quick-vfav.is-on{color:#ffd166;}
.dsh-skin-quick-vthumb.is-active{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;}
.dsh-skin-quick-vthumb.is-none{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);display:flex;align-items:center;justify-content:center;}
.dsh-skin-quick-vph{display:block;width:100%;height:100%;background:var(--dsw-alias-bg-layer-1);}
.dsh-skin-quick-vcheck{position:absolute;right:2px;bottom:2px;display:flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-brand-primary);color:#fff;}
/* One third of the viewport, pinned right: the picture keeps the rest. */
.dsh-skin-seekbar{position:fixed;right:18px;bottom:calc(var(--dsh-composer-height,152px) + 26px);z-index:32;display:flex;flex-direction:column;gap:2px;width:min(33vw,520px);max-width:calc(100vw - 36px);padding:6px 12px;border:none;border-radius:999px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.55));color:#fff;pointer-events:none;opacity:0;transition:opacity .18s ease;font-size:12px;box-shadow:none;}
.dsh-skin-seekbar[data-visible="true"]{opacity:1;pointer-events:auto;}
.dsh-skin-clock{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border:none;border-radius:999px;background:rgba(255,255,255,.10);color:rgba(255,255,255,.92);font:inherit;font-size:11px;font-variant-numeric:tabular-nums;letter-spacing:.02em;cursor:pointer;white-space:nowrap;}
.dsh-skin-clock:hover{background:rgba(255,255,255,.2);}
.dsh-skin-clock-time{font-variant-numeric:tabular-nums;}
/* The vault chip moved into settings; its slot in the dock is the clock now. */
body.dsh-skin-video-active .bv-chip{display:none !important;}
.dsh-skin-player-row{position:relative;display:flex;align-items:center;gap:10px;min-width:0;}
.dsh-skin-player-nav{position:absolute;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:1px;padding:1px 3px;border-radius:999px;background:rgba(255,255,255,.12);}
.dsh-skin-player-nav .dsh-skin-player-btn{width:24px;height:24px;border-radius:50%;}
.dsh-skin-player-count{min-width:46px;text-align:center;font-size:11px;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.9);white-space:nowrap;}
.dsh-skin-player-btn:disabled{opacity:.32;cursor:default;background:transparent;}
@media (max-width:560px){.dsh-skin-player-nav{position:static;transform:none;}}
.dsh-skin-player-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:6px;background:transparent;color:#fff;cursor:pointer;flex:none;}
.dsh-skin-player-btn:hover{background:rgba(255,255,255,.18);}
.dsh-skin-player-time{font-variant-numeric:tabular-nums;color:rgba(255,255,255,.86);flex:none;min-width:34px;text-align:center;font-size:11px;}
.dsh-skin-player-seek-wrap{position:relative;width:100%;min-width:0;height:18px;display:flex;align-items:center;}
.dsh-skin-player-seek{width:100%;min-width:0;height:18px;margin:0;background:transparent;accent-color:#00aeec;cursor:pointer;-webkit-appearance:none;appearance:none;}
.dsh-skin-player-seek::-webkit-slider-runnable-track{height:3px;border-radius:999px;background:rgba(255,255,255,.36);}
.dsh-skin-player-seek::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;margin-top:-4.5px;border-radius:50%;background:#00aeec;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);}
.dsh-skin-player-seek:focus-visible{outline:2px solid #00aeec;outline-offset:2px;}
.dsh-skin-player-hud{position:absolute;right:18px;top:-26px;padding:3px 9px;border-radius:6px;background:rgba(0,0,0,.66);color:#fff;font-size:11px;font-variant-numeric:tabular-nums;pointer-events:none;}
.dsh-skin-player-spacer{flex:1;min-width:8px;}
.dsh-skin-video-audio{position:absolute;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;}
#root,[data-dsh-root]{transition:opacity .38s cubic-bezier(.22,.61,.36,1),transform .38s cubic-bezier(.22,.61,.36,1);}
body.dsh-skin-cinema #root,body.dsh-skin-cinema [data-dsh-root]{opacity:0 !important;transform:translateY(14px) scale(.994);pointer-events:none !important;}
body.dsh-skin-video-active #root,body.dsh-skin-video-active [data-dsh-root]{transition:opacity .38s ease,transform .38s ease;}
body.dsh-skin-cinema .dsh-skin-seekbar{opacity:0 !important;pointer-events:none !important;}
@media (max-width:520px){.dsh-skin-quick{left:12px;right:12px;width:auto;bottom:72px;}}
@media (hover:none){.dsh-skin-del,.dsh-skin-fav,.dsh-skin-photo-del,.dsh-skin-select{opacity:1;pointer-events:auto;}}
@media (prefers-reduced-motion:no-preference){
  .dsh-skin-quick{animation:dsh-skin-pop .16s ease-out;}
  .dsh-skin-wall-page{animation-name:dsh-skin-page-in;}
}
@keyframes dsh-skin-pop{from{opacity:0;transform:translateY(6px) scale(.985);}to{opacity:1;transform:none;}}
@keyframes dsh-skin-page-in{from{opacity:.55;transform:translateX(10px);}to{opacity:1;transform:none;}}
`;

    function useStore(store) {
      return useSyncExternalStore(store.subscribe, store.get, store.get);
    }

    function noticeText(code, t) {
      const keys = {
        storage: 'notice.storage',
        image: 'notice.image',
        url: 'notice.url',
        skinLimit: 'notice.skinLimit',
        wallpaperLimit: 'notice.wallpaperLimit',
        partial: 'wallpaper.partial',
        duplicates: 'wallpaper.duplicates',
        storageUnavailable: 'wallpaper.storageUnavailable',
        videoStorage: 'notice.videoStorage',
        videoInvalid: 'video.invalid',
        videoLimit: 'video.limit',
        videoTooLarge: 'video.tooLarge',
        videoQuota: 'video.quota',
        videoPlaybackError: 'video.playbackError',
        vaultMissing: 'vault.missing',
        videoProxyReady: 'video.proxyReady',
        videoAudioUnsupported: 'video.audioUnsupported',
        videoAutoplayBlocked: 'video.autoplayBlocked',
        videoReselect: 'video.reselect',
        videoPartial: 'video.partial',
        videoRelinked: 'video.relinked',
        videoRelinkFailed: 'video.relinkFailed',
        modeTyping: 'notice.modeTyping',
        modeExit: 'notice.modeExit',
        modeBlockedPure: 'notice.modeBlockedPure',
        modeBlockedNormal: 'notice.modeBlockedNormal'
      };
      return t(keys[code] || 'notice.storage');
    }

    return {
      inject: ['slots', 'theme', 'locale'],

      apply(ctx) {
        let disposeEn = null;
        let disposeZh = null;
        try {
          disposeEn = ctx.locale.register('skin-studio', 'en', EN_TEXT);
          disposeZh = ctx.locale.register('skin-studio', 'zh', ZH_TEXT);
        } catch (error) {
          console.error('[skin-studio] locale registration failed', error);
        }
        const t = ctx.locale.bind('skin-studio');

        const store = createStore(loadState());
        // Media stays SAME-ORIGIN: under the desktop shell the page is served
        // from dsh-app://app, and that path is forwarded to the host with the
        // session cookie attached. Rewriting it to http://127.0.0.1:PORT would
        // strip that cookie and turn playback into a 401 — the cure would be
        // worse than the disease. Only stale absolute URLs are normalised back
        // to a path (see mediaPath).
        const fullUrlCache = new Map();
        const videoUrlCache = new Map();
        // In-memory FileSystemFileHandle cache (id -> handle). Handles let a
        // full-size movie stream natively from disk with no byte copy.
        const videoHandleCache = new Map();
        // Shared handle to the live background <video> so the floating player
        // bar can read/set progress. Set by VideoBackground's ref callback.
        const videoElementRef = { current: null };
        // Set while the settings recorder is capturing, so the global hotkeys
        // cannot swallow the very combination the user is trying to map.
        const modeRecording = { current: false };
        // A ready proxy replaces the <video> src, which rewinds the element to
        // 0:00. Remember where playback was so the swap cannot "jump back".
        let resumeAt = 0;
        // How many times a sidecar URL 404'd for one record; see the <audio>
        // onError handler.
        const audioRetry = new Map();

        // Append one diagnostic event to the persisted ring buffer. Every path
        // that can hide the interface or stop the picture writes here first, so
        // a recurrence leaves evidence on disk instead of a screenshot.
        function recordDebug(event, data) {
          try {
            const current = store.get();
            const entry = { at: Date.now(), event, focus: focusDescriptor() };
            if (data) entry.data = data;
            const log = (Array.isArray(current.debugLog) ? current.debugLog : []).slice(-19);
            log.push(entry);
            store.set({ debugLog: log });
          } catch (error) { /* diagnostics must never break the feature */ }
        }

        // Diagnostics. Run `__skinStudioDiag()` in the renderer console to read
        // the real media state (muted / paused / volume / readyState / sidecar)
        // instead of guessing from the UI. Check this first when a video is
        // silent; it also prints the build stamp, so a stale bundle is obvious.
        function skinStudioDiag() {
          const pick = (selector) => (typeof document !== 'undefined' && typeof document.querySelector === 'function' ? document.querySelector(selector) : null);
          const read = (media) => (media ? {
            src: String(media.currentSrc || media.src || '').slice(0, 180),
            paused: Boolean(media.paused),
            muted: Boolean(media.muted),
            volume: Number(media.volume),
            currentTime: Number(media.currentTime),
            duration: Number(media.duration),
            readyState: Number(media.readyState),
            networkState: Number(media.networkState),
            error: media.error ? String(media.error.code) + ':' + String(media.error.message || '') : null
          } : null);
          const node = pick('video.dsh-skin-video');
          const audio = pick('audio.dsh-skin-video-audio');
          let videoId = null;
          try { videoId = store.get().videoId; } catch (error) { /* ignore */ }
          const sidecarPlaying = Boolean(audio && !audio.paused && !audio.muted);
          let activeItem = null;
          try {
            const currentState = store.get();
            const found = currentState.videoId && currentState.videoId !== 'none'
              ? currentState.customVideos.find((item) => item.id === currentState.videoId)
              : null;
            if (found) {
              activeItem = {
                id: found.id,
                name: found.name,
                size: Number(found.size) || 0,
                sourcePath: found.sourcePath || null,
                audioUrl: found.audioUrl || null,
                proxyUrl: found.proxyUrl || null,
                fullUrl: String(found.fullUrl || '').slice(0, 180)
              };
            }
          } catch (error) { /* ignore */ }
          return {
            build: BUILD,
            version: PLUGIN_VERSION,
            videoId,
            item: activeItem,
            video: read(node),
            sidecar: read(audio),
            verdict: !node ? 'no <video> element'
              : (node.muted && !sidecarPlaying) ? 'MUTED with no audible sidecar'
                : node.paused ? 'paused (playback blocked or toggled off)' : 'playing'
          };
        }
        if (typeof window !== 'undefined') window.__skinStudioDiag = skinStudioDiag;

        // Double-click the empty strip above the chat (or the control bar) to
        // watch the backdrop full screen. Bound on the document because the
        // backdrop layer itself is pointer-events:none, so the top strip is
        // usually the app shell, not our element.
        const TOP_BAND_PX = 150;
        function backdropVideo() {
          if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return null;
          return document.querySelector('video.dsh-skin-video');
        }
        function toggleFullscreenPlayback() {
          const node = backdropVideo();
          if (!node) return false;
          const doc = typeof document !== 'undefined' ? document : null;
          if (!doc) return false;
          if (doc.fullscreenElement) {
            const exit = doc.exitFullscreen || (doc.webkitExitFullscreen);
            if (exit) { try { const p = exit.call(doc); if (p && p.catch) p.catch(() => {}); } catch (error) { /* ignore */ } }
            return true;
          }
          const request = node.requestFullscreen || node.webkitRequestFullscreen;
          if (request) {
            try {
              const p = request.call(node, { navigationUI: 'hide' });
              if (p && p.then) p.then(() => { try { node.play && node.play().catch(() => {}); } catch (error) { /* ignore */ } }).catch(() => {});
              else { try { node.play && node.play().catch(() => {}); } catch (error) { /* ignore */ } }
            } catch (error) { /* ignore */ }
            return true;
          }
          return false;
        }
        const onBackdropDblClick = (event) => {
          if (disposed || !event) return;
          const target = event.target;
          if (target && typeof target.closest === 'function' &&
            target.closest('button,input,textarea,select,a,[contenteditable="true"],[role="button"],[role="slider"]')) return;
          const fullscreenNow = Boolean(typeof document !== 'undefined' && document.fullscreenElement);
          const inTopBand = Number(event.clientY) <= TOP_BAND_PX;
          const inPlayer = Boolean(target && typeof target.closest === 'function' && target.closest('.dsh-skin-player, .dsh-skin-seekbar, .dsh-skin-clock'));
          if (!fullscreenNow && !inTopBand && !inPlayer) return;
          if (!toggleFullscreenPlayback()) return;
          event.preventDefault();
          event.stopPropagation();
        };
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('dblclick', onBackdropDblClick, true);
        }
        let disposed = false;
        let themeLayer = null;
        let lastTokenKey = null;

        const subscribeLocale = (callback) => ctx.locale.subscribe(callback);
        const readLocale = () => ctx.locale.getSnapshot();
        const subscribeTheme = (callback) => ctx.on('theme/change', callback);
        const readTheme = () => ctx.theme.getTheme();

        function useLocale() {
          useSyncExternalStore(subscribeLocale, readLocale, readLocale);
        }

        function useScheme() {
          const snapshot = useSyncExternalStore(subscribeTheme, readTheme, readTheme);
          return snapshot && snapshot.active && snapshot.active.colorScheme === 'dark' ? 'dark' : 'light';
        }

        const readThemePreference = () => {
          try {
            const snapshot = ctx.theme.getTheme();
            return snapshot && typeof snapshot.preference === 'string' ? snapshot.preference : 'system';
          } catch (error) {
            return 'system';
          }
        };

        function useThemePreference() {
          return useSyncExternalStore(subscribeTheme, readThemePreference, readThemePreference);
        }

        function setThemePreference(id) {
          try {
            ctx.theme.setTheme(id);
          } catch (error) {
            console.error('[skin-studio] could not switch appearance mode', error);
          }
        }

        const applyVisuals = () => {
          let tokens;
          try {
            tokens = buildTokens(store.get());
          } catch (error) {
            console.error('[skin-studio] could not build theme tokens', error);
            return;
          }
          if (!Object.keys(tokens).length) {
            lastTokenKey = null;
            if (themeLayer) {
              try {
                themeLayer();
              } catch (error) {
                console.error('[skin-studio] theme cleanup failed', error);
              }
              themeLayer = null;
            }
            return;
          }
          let tokenKey = null;
          try {
            tokenKey = JSON.stringify(tokens);
          } catch (error) {
            tokenKey = null;
          }
          // State changes such as import progress do not alter the palette.
          // Re-registering an identical layer would publish a theme change for
          // every imported file, so skip that noise.
          if (tokenKey && tokenKey === lastTokenKey && themeLayer) return;
          try {
            themeLayer = ctx.theme.overrideTokens('skin-studio', tokens);
            lastTokenKey = tokenKey;
          } catch (error) {
            console.error('[skin-studio] theme override failed', error);
          }
        };

        ctx.effect(() => {
          const unsubscribe = store.subscribe(applyVisuals);
          applyVisuals();
          return () => {
            disposed = true;
            try { document.removeEventListener('dblclick', onBackdropDblClick, true); } catch (error) { /* ignore */ }
            unsubscribe();
            store.dispose();
            fullUrlCache.forEach((url) => {
              try {
                URL.revokeObjectURL(url);
              } catch (error) {
                /* ignore */
              }
            });
            fullUrlCache.clear();
            videoUrlCache.forEach((url) => {
              try {
                URL.revokeObjectURL(url);
              } catch (error) {
                /* ignore */
              }
            });
            videoUrlCache.clear();
            if (themeLayer) {
              try {
                themeLayer();
              } catch (error) {
                console.error('[skin-studio] theme cleanup failed', error);
              }
              themeLayer = null;
            }
            if (disposeEn) disposeEn();
            if (disposeZh) disposeZh();
          };
        });

        // ---------- wallpaper library ----------

        const isPresetWallpaper = (id) => WALLPAPER_PRESETS.some((preset) => preset.id === id);
        const findCustomWallpaper = (id) => store.get().customWallpapers.find((item) => item.id === id);

        function mergeWallpaperItem(id, patch) {
          const current = store.get();
          if (!current.customWallpapers.some((item) => item.id === id)) return;
          store.set({
            customWallpapers: current.customWallpapers.map((item) => (
              item.id === id ? Object.assign({}, item, patch) : item
            ))
          }, { persist: false });
        }

        function revokeFullUrl(id) {
          const url = fullUrlCache.get(id);
          if (!url) return;
          fullUrlCache.delete(id);
          try {
            URL.revokeObjectURL(url);
          } catch (error) {
            /* ignore */
          }
        }

        async function ensureFullUrl(id) {
          if (!id || isPresetWallpaper(id) || fullUrlCache.has(id)) return;
          const item = findCustomWallpaper(id);
          if (!item) return;
          let blob = null;
          try {
            blob = await idbGetBlob(id);
          } catch (error) {
            console.error('[skin-studio] could not read wallpaper image', error);
          }
          if (!blob || disposed) return;
          const url = URL.createObjectURL(blob);
          if (disposed || !findCustomWallpaper(id)) {
            URL.revokeObjectURL(url);
            return;
          }
          fullUrlCache.set(id, url);
          mergeWallpaperItem(id, { fullUrl: url });
        }

        function selectWallpaper(id) {
          store.set({ wallpaperId: id });
          if (id && id !== 'none' && !isPresetWallpaper(id)) ensureFullUrl(id);
        }

        function toggleFavorite(id) {
          const current = store.get();
          const has = current.favorites.indexOf(id) >= 0;
          store.set({
            favorites: has
              ? current.favorites.filter((favorite) => favorite !== id)
              : current.favorites.concat(id)
          });
        }

        async function deleteCustomWallpapers(ids) {
          const current = store.get();
          const wanted = new Set((ids || []).filter(Boolean));
          const removed = current.customWallpapers.filter((item) => wanted.has(item.id));
          if (!removed.length) return;
          const removedIds = new Set(removed.map((item) => item.id));
          removed.forEach((item) => revokeFullUrl(item.id));
          store.set({
            customWallpapers: current.customWallpapers.filter((item) => !removedIds.has(item.id)),
            favorites: current.favorites.filter((favorite) => !removedIds.has(favorite)),
            wallpaperId: removedIds.has(current.wallpaperId) ? 'none' : current.wallpaperId
          }, { persist: true });
          try {
            await Promise.all(removed.map((item) => idbDeleteWallpaper(item.id)));
          } catch (error) {
            console.error('[skin-studio] could not delete wallpapers', error);
            store.notify('storage');
          }
        }

        function deleteCustomWallpaper(id) {
          return deleteCustomWallpapers([id]);
        }

        async function clearCustomWallpapers() {
          const current = store.get();
          if (!current.customWallpapers.length || current.importing) return;
          const confirmed = typeof window.confirm === 'function' ? window.confirm(t('wallpaper.clearConfirm')) : true;
          if (!confirmed) return;
          current.customWallpapers.forEach((item) => revokeFullUrl(item.id));
          const customIds = new Set(current.customWallpapers.map((item) => item.id));
          store.set({
            customWallpapers: [],
            favorites: current.favorites.filter((id) => !customIds.has(id)),
            wallpaperFilter: 'all',
            wallpaperId: 'none',
            importing: null
          }, { persist: true });
          try {
            await idbClearWallpapers();
          } catch (error) {
            console.error('[skin-studio] could not clear wallpapers', error);
            store.notify('storage');
          }
        }

        async function importWallpaperFiles(fileList) {
          if (disposed) return;
          const files = Array.from(fileList || []).filter(isImageFile);
          if (!files.length) {
            store.notify('image');
            return;
          }
          const current = store.get();
          // If a previous hydration failed to open IndexedDB (blocked / version
          // conflict), try once more now instead of refusing the import — the
          // conflicting connection may have gone away.
          if (!current.storageAvailable) {
            try {
              await idbListItems();
              store.set({ storageAvailable: true, storageReady: true }, { persist: false });
            } catch (error) {
              console.error('[skin-studio] storage still unavailable at import', error);
              store.notify('storageUnavailable');
              return;
            }
          }
          if (current.importing) return;
          const room = MAX_CUSTOM_WALLPAPERS - current.customWallpapers.length;
          if (room <= 0) {
            store.notify('wallpaperLimit');
            return;
          }
          const seen = new Set(current.customWallpapers.map((item) => item.key).filter(Boolean));
          const candidates = [];
          files.sort((a, b) => String(a.webkitRelativePath || a.name || '').localeCompare(String(b.webkitRelativePath || b.name || '')));
          for (const file of files) {
            const key = (file.webkitRelativePath || file.name || '') + ':' + (file.size || 0);
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push(file);
          }
          if (!candidates.length) {
            store.notify('duplicates');
            return;
          }
          const batch = candidates.slice(0, room);
          if (candidates.length > room) store.notify('wallpaperLimit');
          store.set({ importing: { total: batch.length, done: 0, failed: 0 } }, { persist: false });
          const queue = batch.slice();
          let firstId = null;

          const bump = (failed) => {
            const now = store.get();
            if (!now.importing) return;
            store.set({
              importing: {
                total: batch.length,
                done: now.importing.done + 1,
                failed: now.importing.failed + (failed ? 1 : 0)
              }
            }, { persist: false });
          };

          const worker = async () => {
            while (queue.length && !disposed) {
              const file = queue.shift();
              try {
                const asset = await buildWallpaperAsset(file);
                const id = newId('wall');
                const record = {
                  id,
                  name: asset.name,
                  lum: asset.lum,
                  thumb: asset.thumb,
                  key: asset.key,
                  createdAt: Date.now()
                };
                try {
                  await idbPutItem(record);
                  await idbPutBlob(id, asset.full);
                } catch (error) {
                  try {
                    await idbDeleteWallpaper(id);
                  } catch (cleanupError) {
                    /* ignore */
                  }
                  throw error;
                }
                const item = {
                  id,
                  name: asset.name,
                  lum: asset.lum,
                  thumb: asset.thumb,
                  key: asset.key
                };
                if (firstId === null) {
                  const url = URL.createObjectURL(asset.full);
                  fullUrlCache.set(id, url);
                  item.fullUrl = url;
                  firstId = id;
                }
                const now = store.get();
                store.set({ customWallpapers: now.customWallpapers.concat(item) }, { persist: false });
                if (firstId === id) store.set({ wallpaperId: id }, { persist: true });
                bump(false);
              } catch (error) {
                console.error('[skin-studio] wallpaper import failed', error);
                bump(true);
              }
            }
          };

          await Promise.all(Array.from({ length: Math.min(3, batch.length) }, worker));
          if (disposed) return;
          const finalState = store.get();
          const imported = finalState.importing
            ? finalState.importing.done - finalState.importing.failed
            : 0;
          store.set(imported > 0
            ? { importing: null, wallpaperFilter: 'mine' }
            : { importing: null }, { persist: imported > 0 });
          if (finalState.importing && finalState.importing.failed >= batch.length) {
            store.notify('image');
          } else if (finalState.importing && finalState.importing.failed > 0) {
            store.notify('partial');
          }
        }

        function entryFiles(entry) {
          return new Promise((resolve, reject) => {
            if (!entry) {
              resolve([]);
              return;
            }
            if (entry.isFile) {
              entry.file((file) => resolve([file]), (error) => reject(error));
              return;
            }
            if (!entry.isDirectory) {
              resolve([]);
              return;
            }
            const reader = entry.createReader();
            const collected = [];
            const readBatch = () => {
              reader.readEntries(async (batch) => {
                if (!batch.length) {
                  const nested = await Promise.all(collected.map(entryFiles));
                  resolve(nested.flat());
                  return;
                }
                collected.push.apply(collected, batch);
                readBatch();
              }, reject);
            };
            readBatch();
          });
        }

        async function filesFromDataTransfer(dataTransfer) {
          const items = dataTransfer && dataTransfer.items ? Array.from(dataTransfer.items) : [];
          const entries = [];
          for (const item of items) {
            if (item.kind !== 'file') continue;
            const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
            if (entry) entries.push(entry);
          }
          if (!entries.length) {
            return dataTransfer && dataTransfer.files ? Array.from(dataTransfer.files) : [];
          }
          const nested = await Promise.all(entries.map(entryFiles));
          return nested.flat();
        }

        async function hydrateWallpapers() {
          let dbItems = [];
          let available = false;
          try {
            dbItems = await idbListItems();
            available = true;
            // Older builds could append the same file over and over. Collapse
            // duplicates here (keep the newest copy) and remove the extra
            // records from IndexedDB so the gallery does not fill up with
            // hundreds of identical photos.
            const newest = new Map();
            for (const record of dbItems) {
              const key = wallpaperIdentity(record);
              const previous = newest.get(key);
              if (!previous || (Number(record.createdAt) || 0) >= (Number(previous.createdAt) || 0)) {
                newest.set(key, record);
              }
            }
            const keepIds = new Set(Array.from(newest.values()).map((record) => record.id));
            const staleIds = dbItems.filter((record) => !keepIds.has(record.id)).map((record) => record.id);
            dbItems = Array.from(newest.values());
            staleIds.forEach((id) => {
              idbDeleteWallpaper(id).catch((error) => {
                console.warn('[skin-studio] could not remove duplicate wallpaper', error);
              });
            });
          } catch (error) {
            console.error('[skin-studio] IndexedDB unavailable', error);
          }
          if (disposed) return;
          const current = store.get();
          const legacy = current.customWallpapers.filter((item) => typeof item.full === 'string' && item.full);
          let migrationFailed = false;
          if (available) {
            for (const item of legacy) {
              if (dbItems.some((record) => record.id === item.id)) continue;
              try {
                if (typeof item.full === 'string' && /^data:/i.test(item.full)) {
                  const fullBlob = await dataUrlToBlob(item.full);
                  const record = {
                    id: item.id,
                    name: item.name,
                    lum: typeof item.lum === 'number' ? item.lum : 0.35,
                    thumb: item.thumb || item.full,
                    key: item.key || null,
                    createdAt: Date.now()
                  };
                  await idbPutItem(record);
                  await idbPutBlob(item.id, fullBlob);
                  dbItems.push(record);
                } else if (typeof item.full === 'string' && /^https?:/i.test(item.full)) {
                  const record = {
                    id: item.id,
                    name: item.name,
                    lum: typeof item.lum === 'number' ? item.lum : 0.35,
                    url: item.full,
                    key: item.key || null,
                    createdAt: Date.now()
                  };
                  await idbPutItem(record);
                  dbItems.push(record);
                } else if (typeof item.url === 'string') {
                  await idbPutItem({
                    id: item.id,
                    name: item.name,
                    lum: item.lum,
                    url: item.url,
                    key: item.key || null,
                    createdAt: Date.now()
                  });
                  dbItems.push({ id: item.id, name: item.name, lum: item.lum, url: item.url, key: item.key });
                }
              } catch (error) {
                migrationFailed = true;
                console.error('[skin-studio] could not migrate wallpaper', error);
              }
            }
          }
          if (disposed) return;
          const items = dbItems.map((record) => ({
            id: record.id,
            name: record.name,
            lum: record.lum,
            thumb: record.thumb,
            url: record.url,
            key: record.key
          }));
          const storedKeys = new Set(items.map((record) => wallpaperIdentity(record)));
          const keepLegacy = dedupeBy(
            current.customWallpapers.filter((item) => !items.some((record) => record.id === item.id) && !storedKeys.has(wallpaperIdentity(item))),
            wallpaperIdentity
          );
          const nextWallpapers = items.concat(keepLegacy);
          store.set({
            customWallpapers: nextWallpapers,
            storageAvailable: available,
            storageReady: true,
            wallpapersMigrated: available && !migrationFailed && keepLegacy.length === 0
          }, { persist: false });
          const activeId = store.get().wallpaperId;
          if (activeId !== 'none' && !isPresetWallpaper(activeId) && !nextWallpapers.some((item) => item.id === activeId)) {
            store.set({ wallpaperId: 'none' }, { persist: true });
          } else if (activeId !== 'none') {
            ensureFullUrl(activeId);
          }
          store.set({}, { persist: true });
        }

        hydrateWallpapers().catch((error) => {
          console.error('[skin-studio] wallpaper hydration failed', error);
        });

        // ---------- video library ----------

        const findCustomVideo = (id) => store.get().customVideos.find((item) => item.id === id);

        function mergeVideoItem(id, patch) {
          const current = store.get();
          if (!current.customVideos.some((item) => item.id === id)) return;
          store.set({
            customVideos: current.customVideos.map((item) => (
              item.id === id ? Object.assign({}, item, patch) : item
            ))
          }, { persist: false });
        }

        function revokeVideoUrl(id) {
          const url = videoUrlCache.get(id);
          if (!url) return;
          videoUrlCache.delete(id);
          try {
            URL.revokeObjectURL(url);
          } catch (error) {
            /* ignore */
          }
        }

        async function ensureVideoUrl(id) {
          if (!id || id === 'none' || videoUrlCache.has(id)) return;
          const item = findCustomVideo(id);
          if (!item) return;
          if (item.url) return;
          if (item.fullUrl && item.sourcePath) return;

          // A path imported through <input type=file> in Electron can be
          // streamed by the host plugin; this also gives us a real path for
          // the ffmpeg audio sidecar.
          if (item.sourcePath) {
            const url = '/api/skin-studio/media/video?path=' + encodeURIComponent(item.sourcePath);
            videoUrlCache.set(id, url);
            mergeVideoItem(id, { fullUrl: url });
            store.set({}, { persist: false });
            return;
          }

          // Prefer a stored FileSystemFileHandle: stream the original file
          // directly from disk (works for multi-GB movies, no byte copy).
          try {
            let handle = videoHandleCache.get(id) || null;
            if (!handle) {
              handle = await idbGetVideoHandle(id);
              if (handle) videoHandleCache.set(id, handle);
            }
            if (handle) {
              if (typeof handle.queryPermission === 'function') {
                let perm = await handle.queryPermission({ mode: 'read' });
                if (perm !== 'granted' && typeof handle.requestPermission === 'function') {
                  try { perm = await handle.requestPermission({ mode: 'read' }); } catch (e) { perm = 'denied'; }
                }
                if (perm !== 'granted') {
                  store.notify('videoReselect');
                  return;
                }
              }
              const file = await handle.getFile();
              if (disposed || !findCustomVideo(id)) return;
              const url = URL.createObjectURL(file);
              if (disposed || !findCustomVideo(id)) { URL.revokeObjectURL(url); return; }
              videoUrlCache.set(id, url);
              mergeVideoItem(id, { fullUrl: url, sourcePath: file.path || item.sourcePath || null });
              store.set({}, { persist: false });
              return;
            }
          } catch (error) {
            console.error('[skin-studio] could not open video handle', error);
          }

          // Fallback: small blobs stored inside IndexedDB.
          let blob = null;
          try {
            blob = await idbGetVideoBlob(id);
          } catch (error) {
            console.error('[skin-studio] could not read video', error);
          }
          if (!blob || disposed) return;
          const url = URL.createObjectURL(blob);
          if (disposed || !findCustomVideo(id)) {
            URL.revokeObjectURL(url);
            return;
          }
          videoUrlCache.set(id, url);
          mergeVideoItem(id, { fullUrl: url });
          store.set({}, { persist: false });
        }

        const audioPrepareCache = new Map();
        const proxyPrepareCache = new Map();

        async function prepareVideoAudio(item) {
          if (!item || !item.id) return '';
          const known = usableAudioUrl(item.audioUrl);
          if (known) return known;
          if (audioPrepareCache.has(item.id)) return audioPrepareCache.get(item.id);
          const task = (async () => {
            if (!item.sourcePath) return '';
            try {
              const endpoint = mediaPath('/api/skin-studio/media/prepare?path=' + encodeURIComponent(item.sourcePath));
              const response = await fetch(endpoint, { method: 'GET', cache: 'no-store' });
              if (!response.ok) throw new Error('HTTP ' + response.status);
              const data = await response.json();
              // data.url is the ffmpeg-built AAC sidecar. When it is empty the
              // audio codec is natively supported (or there is no audio track)
              // and the <video> element must stay unmuted to play it itself.
              const audioUrl = usableAudioUrl(data && data.url);
              if (audioUrl) {
                mergeVideoItem(item.id, { audioUrl });
                store.set({}, { persist: true });
                return audioUrl;
              }
              if (item.audioUrl) {
                mergeVideoItem(item.id, { audioUrl: null });
                store.set({}, { persist: true });
              }
              return '';
            } catch (error) {
              console.warn('[skin-studio] audio sidecar unavailable', error && error.message);
              store.notify('videoAudioUnsupported');
              return '';
            } finally {
              audioPrepareCache.delete(item.id);
            }
          })();
          audioPrepareCache.set(item.id, task);
          return task;
        }

        async function prepareVideoProxy(item) {
          if (!item || !item.id || !item.sourcePath || item.proxyUrl) return;
          if (proxyPrepareCache.has(item.id)) return proxyPrepareCache.get(item.id);
          const task = (async () => {
            const poll = async () => {
              const response = await fetch(mediaPath('/api/skin-studio/media/proxy?path=' + encodeURIComponent(item.sourcePath)), { cache: 'no-store' });
              if (!response.ok) throw new Error('HTTP ' + response.status);
              const data = await response.json();
              if (data && data.ready && data.needed && data.url) {
                const live = videoElementRef.current;
                resumeAt = live && Number.isFinite(live.currentTime) ? live.currentTime : 0;
                mergeVideoItem(item.id, { proxyUrl: data.url, audioUrl: null, videoMuted: false });
                store.set({}, { persist: true });
                store.notify('videoProxyReady');
                return;
              }
              if (data && data.ready && !data.needed) return;
              setTimeout(() => { poll().catch(() => {}); }, 5000);
            };
            await poll();
          })().catch((error) => console.warn('[skin-studio] proxy prepare failed', error && error.message)).finally(() => proxyPrepareCache.delete(item.id));
          proxyPrepareCache.set(item.id, task);
          return task;
        }

        async function selectVideo(id) {
          if (id && id !== 'none') {
            await ensureVideoUrl(id);
            const item = findCustomVideo(id);
            if (item) prepareVideoAudio(item);
            store.set({ videoId: id, videoMuted: false, videoAudioVersion: 3 });
          } else {
            store.set({ videoId: 'none' });
          }
        }

        // Folder imports land within the same millisecond, so createdAt alone
        // gives an unstable playlist order; fall back to natural name order so
        // S01E02 always follows S01E01.
        function comparePlaylist(a, b) {
          const byTime = (Number(a && a.createdAt) || 0) - (Number(b && b.createdAt) || 0);
          if (byTime !== 0) return byTime;
          return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), undefined, { numeric: true, sensitivity: 'base' });
        }

        async function stepVideo(delta) {
          const list = store.get().customVideos.slice().sort(comparePlaylist);
          if (!list.length) return;
          const current = list.findIndex((item) => item.id === store.get().videoId);
          const next = list[(current + delta + list.length) % list.length];
          if (next) {
            await selectVideo(next.id);
            store.set({ videoPlaying: true });
          }
        }

        function toggleVideoFavorite(id) {
          if (!id) return;
          const current = store.get().videoFavorites || [];
          const next = current.indexOf(id) >= 0 ? current.filter((item) => item !== id) : current.concat(id);
          store.set({ videoFavorites: next });
        }

        async function deleteCustomVideos(ids) {
          const current = store.get();
          const wanted = new Set((ids || []).filter(Boolean));
          const removed = current.customVideos.filter((item) => wanted.has(item.id));
          if (!removed.length) return;
          const removedIds = new Set(removed.map((item) => item.id));
          removed.forEach((item) => revokeVideoUrl(item.id));
          store.set({
            customVideos: current.customVideos.filter((item) => !removedIds.has(item.id)),
            videoId: removedIds.has(current.videoId) ? 'none' : current.videoId,
            videoImporting: null
          }, { persist: true });
          try {
            await Promise.all(removed.map((item) => idbDeleteVideo(item.id)));
          } catch (error) {
            console.error('[skin-studio] could not delete videos', error);
            store.notify('videoStorage');
          }
        }

        function deleteCustomVideo(id) {
          return deleteCustomVideos([id]);
        }

        async function clearCustomVideos() {
          const current = store.get();
          if (!current.customVideos.length || current.videoImporting) return;
          const confirmed = typeof window.confirm === 'function' ? window.confirm(t('video.clearConfirm')) : true;
          if (!confirmed) return;
          current.customVideos.forEach((item) => revokeVideoUrl(item.id));
          store.set({
            customVideos: [],
            videoId: 'none',
            videoImporting: null
          }, { persist: true });
          try {
            await idbClearVideos();
          } catch (error) {
            console.error('[skin-studio] could not clear videos', error);
            store.notify('videoStorage');
          }
        }

        async function importVideoPath(info) {
          if (disposed || !info || !info.path) return;
          const current = store.get();
          if (current.videoImporting) return;
          const name = videoDisplayName(info.name || info.path.split('/').pop() || 'video');
          const size = Number(info.size) || 0;
          const existing = current.customVideos.find((item) => item.name === name && Number(item.size) === size);
          if (existing) {
            const url = '/api/skin-studio/media/video?path=' + encodeURIComponent(info.path);
            videoUrlCache.set(existing.id, url);
            const patch = {
              sourcePath: info.path,
              key: 'path:' + info.path,
              hasHandle: false,
              fullUrl: url
            };
            mergeVideoItem(existing.id, patch);
            try {
              await idbPutVideoItem(Object.assign({}, existing, patch));
            } catch (error) {
              console.error('[skin-studio] video path upgrade failed', error);
            }
            store.set({ videoId: existing.id, videoPlaying: true, videoMuted: false, videoAudioVersion: 3 }, { persist: true });
            if (findCustomVideo(existing.id)) prewarmAudio([existing.id]);
            return;
          }
          if (current.customVideos.length >= MAX_CUSTOM_VIDEOS) {
            store.notify('videoLimit');
            return;
          }
          const id = newId('vid');
          const record = {
            id,
            name,
            mime: 'video/mp4',
            size,
            key: 'path:' + info.path,
            hasHandle: false,
            sourcePath: info.path,
            createdAt: Date.now()
          };
          try {
            await idbPutVideoItem(record);
          } catch (error) {
            console.error('[skin-studio] video path import failed', error);
            store.notify('videoInvalid');
            return;
          }
          if (disposed) return;
          const url = '/api/skin-studio/media/video?path=' + encodeURIComponent(info.path);
          videoUrlCache.set(id, url);
          const item = Object.assign({}, record, { fullUrl: url });
          const now = store.get();
          store.set({
            customVideos: now.customVideos.concat(item),
            videoId: id,
            videoPlaying: true,
            videoMuted: false,
            videoAudioVersion: 3
          }, { persist: true });
          prewarmAudio([id]);
        }

        /**
         * Point an existing (blob-backed) video record at a real file path.
         *
         * A path is what unlocks the host side: streaming with Range support,
         * ffprobe on the audio codec, and the ffmpeg AAC sidecar for codecs
         * Chromium cannot decode (E-AC-3, DTS, TrueHD). Without it such a video
         * shows a picture and no sound, which is exactly the reported bug.
         */
        async function bindVideoPath(id, filePath, name, size, options) {
          if (disposed || !id || !filePath) return false;
          const base = findCustomVideo(id);
          if (!base) return false;
          // Relinking swaps the <video> src (blob -> host stream), which resets
          // playback to 0:00; remember where we were and restore it on
          // loadedmetadata.
          if (store.get().videoId === id) {
            const live = videoElementRef.current;
            resumeAt = live && Number.isFinite(live.currentTime) ? live.currentTime : 0;
          }
          const url = '/api/skin-studio/media/video?path=' + encodeURIComponent(filePath);
          const patch = {
            sourcePath: filePath,
            key: 'path:' + filePath,
            hasHandle: false,
            mime: base.mime || 'video/mp4',
            size: Number(size) || Number(base.size) || 0,
            name: name || base.name,
            audioUrl: null,
            proxyUrl: null,
            fullUrl: url
          };
          videoUrlCache.set(id, url);
          mergeVideoItem(id, patch);
          try {
            await idbPutVideoItem(Object.assign({}, base, patch));
          } catch (error) {
            console.warn('[skin-studio] video path persist failed', error && error.message);
          }
          // The blob is now redundant: dropping it frees the multi-GB copy.
          try { await idbDeleteVideoBlob(id); } catch (error) { /* ignore */ }
          store.set({ videoId: id, videoPlaying: true, videoMuted: false, videoAudioVersion: 3 }, { persist: true });
          const fresh = findCustomVideo(id);
          // Queue instead of firing directly: a repair sweep can relink a whole
          // season at once, and sixteen parallel ffmpeg jobs would starve the
          // machine. The queue runs them one at a time. Startup repair passes
          // opt out (`audio: false`): transcoding 16 episodes just because the
          // app opened is not something the user asked for — the playing video
          // still prepares itself through the VideoBackground effect.
          if (fresh && !(options && options.audio === false)) prewarmAudio([id]);
          return true;
        }

        // Ask the host to locate this exact file on disk (name + size).
        // Used *before* a blob is written: the path is what the host needs to
        // probe the audio codec and, for E-AC-3/DTS, build the AAC sidecar.
        // Blob-only records have no path and are therefore silent forever.
        async function lookupVideoPath(fileName, size) {
          if (disposed || !fileName) return null;
          try {
            const endpoint = mediaPath('/api/skin-studio/media/relink?name=' + encodeURIComponent(fileName) +
              '&size=' + encodeURIComponent(String(Number(size) || 0)));
            const response = await fetch(endpoint, { cache: 'no-store' });
            if (!response.ok) return null;
            const data = await response.json();
            if (!data || !data.ok || !data.path) return null;
            return data;
          } catch (error) {
            console.warn('[skin-studio] path lookup failed', error && error.message);
            return null;
          }
        }

        // One-at-a-time repair pass for records that are still blob-backed.
        // Sequential on purpose: a 12-episode drop would otherwise fire twelve
        // concurrent filesystem sweeps.
        async function healMissingPaths(ids, options) {
          const queue = Array.from(new Set(ids || []));
          let healed = 0;
          for (const id of queue) {
            if (disposed) return healed;
            const item = findCustomVideo(id);
            if (!item || item.sourcePath) continue;
            if (await recoverVideoPath(item, options)) healed += 1;
          }
          if (healed && !(options && options.silent)) store.notify('videoRelinkedAuto');
          return healed;
        }

        async function recoverVideoPath(item, options) {
          if (disposed || !item || !item.id || item.sourcePath || !item.name) return false;
          try {
            const endpoint = mediaPath('/api/skin-studio/media/relink?name=' + encodeURIComponent(item.name) +
              '&size=' + encodeURIComponent(String(item.size || 0)));
            const response = await fetch(endpoint, { cache: 'no-store' });
            if (!response.ok) return false;
            const data = await response.json();
            if (!data || !data.ok || !data.path) return false;
            console.info('[skin-studio] relinked video to', data.path);
            return await bindVideoPath(item.id, data.path, data.name || item.name, data.size || item.size, options);
          } catch (error) {
            console.warn('[skin-studio] relink lookup failed', error && error.message);
            return false;
          }
        }

        // Manual fix for anything the automatic lookup misses: pick the file.
        async function relinkVideo(item) {
          if (!item || !item.id) return;
          if (item.sourcePath) return;
          let info = null;
          try {
            const response = await fetch(mediaPath('/api/skin-studio/media/pick'), { cache: 'no-store' });
            if (response.ok) {
              const data = await response.json();
              if (data && data.canceled) return;
              if (data && data.ok && data.path) info = data;
            }
          } catch (error) {
            console.warn('[skin-studio] relink picker unavailable', error && error.message);
          }
          if (!info) {
            store.notify('videoRelinkFailed');
            return;
          }
          const bound = await bindVideoPath(item.id, info.path, info.name || item.name, info.size || item.size);
          if (bound) store.notify('videoRelinked');
        }

        async function importVideoFolder() {
          // Returns 'ok' | 'canceled' | 'unavailable' so the caller can decide
          // whether to fall back to a <input webkitdirectory> picker (browsers
          // without the host's native folder dialog).
          if (disposed) return 'unavailable';
          try {
            const response = await fetch(mediaPath('/api/skin-studio/media/pick-folder'), { cache: 'no-store' });
            if (!response.ok) return 'unavailable';
            const data = await response.json();
            if (data && data.canceled) return 'canceled';
            if (!data || !data.ok || !Array.isArray(data.files)) return 'unavailable';
            if (!data.files.length) {
              store.notify('videoInvalid');
              return 'ok';
            }
            const files = data.files.slice(0, MAX_CUSTOM_VIDEOS);
            const before = new Set(store.get().customVideos.map((item) => item.id));
            for (const info of files) {
              await importVideoPath(info);
            }
            // Warm the AAC sidecars one by one in the background. A whole
            // season is ~40s per episode; doing it now is what makes
            // "import the folder, then just keep pressing next" work without
            // a silent episode every time the playlist advances.
            const added = store.get().customVideos.filter((item) => !before.has(item.id)).map((item) => item.id);
            if (added.length) prewarmAudio(added);
            return 'ok';
          } catch (error) {
            console.warn('[skin-studio] video folder import failed', error && error.message);
            return 'unavailable';
          }
        }

        // Serial background audio preparation. The host answers /prepare with
        // a cached sidecar size after the first call, so re-running this on a
        // warm cache is nearly free.
        const prewarmQueue = [];
        let prewarmRunning = false;
        async function prewarmAudio(ids) {
          Array.from(ids || []).forEach((id) => { if (id) prewarmQueue.push(id); });
          if (prewarmRunning) return;
          prewarmRunning = true;
          try {
            while (prewarmQueue.length && !disposed) {
              const id = prewarmQueue.shift();
              const item = findCustomVideo(id);
              if (!item || !item.sourcePath || usableAudioUrl(item.audioUrl)) continue;
              await prepareVideoAudio(item);
            }
          } catch (error) {
            console.warn('[skin-studio] audio prewarm stopped', error && error.message);
          } finally {
            prewarmRunning = false;
          }
        }

        async function importVideoFiles(fileList, handleList) {
          if (disposed) return;
          const rawFiles = Array.from(fileList || []);
          const handles = Array.from(handleList || []);
          // Pair each file with a handle when the caller supplied them (via
          // showOpenFilePicker). Files without a handle fall back to blob storage.
          const entries = rawFiles
            .map((file, index) => ({ file, handle: handles[index] || null }))
            .filter((entry) => entry.file && isVideoFile(entry.file));
          if (!entries.length) {
            store.notify('videoInvalid');
            return;
          }
          const current = store.get();
          // Don't hard-block on a possibly-stale storage flag; the write below
          // will fail loudly (and notify) only if IndexedDB is truly unusable.
          if (current.videoImporting) return;
          const room = MAX_CUSTOM_VIDEOS - current.customVideos.length;
          if (room <= 0) {
            store.notify('videoLimit');
            return;
          }
          const seen = new Set(current.customVideos.map((item) => item.key).filter(Boolean));
          const existingByKey = new Map(current.customVideos.filter((item) => item.key).map((item) => [item.key, item]));
          const candidates = [];
          for (const entry of entries) {
            const file = entry.file;
            if ((file.size || 0) > MAX_VIDEO_BYTES) {
              store.notify('videoTooLarge');
              continue;
            }
            const key = videoFileKey(file);
            const sourcePath = (typeof file.path === 'string' && file.path) || null;
            if (seen.has(key)) {
              const existing = existingByKey.get(key);
              // Re-adding the same file upgrades an older handle/blob record
              // with the real path, enabling host streaming and the audio
              // sidecar without duplicating the library entry.
              if (existing && sourcePath && !existing.sourcePath) {
                mergeVideoItem(existing.id, { sourcePath, key });
                store.set({}, { persist: true });
                const updated = findCustomVideo(existing.id);
                if (updated) prepareVideoAudio(updated);
              }
              continue;
            }
            seen.add(key);
            candidates.push(entry);
          }
          if (!candidates.length) {
            store.notify('videoInvalid');
            return;
          }
          const batch = candidates.slice(0, room);
          if (candidates.length > room) store.notify('videoLimit');
          // Resolve the on-disk path for every drop that arrived without one
          // (drag & drop, <input>, webkitdirectory). Bounded concurrency: each
          // lookup is a `find` over the media folders, so four at a time keeps
          // a 12-episode drop under ~1.5s without hammering the disk.
          const resolvedPaths = new Map();
          const needsLookup = batch.filter((entry) => !(typeof entry.file.path === 'string' && entry.file.path));
          let cursor = 0;
          const workers = Array.from({ length: Math.min(4, needsLookup.length) }, async () => {
            while (cursor < needsLookup.length) {
              const entry = needsLookup[cursor];
              cursor += 1;
              const hit = await lookupVideoPath(entry.file.name, entry.file.size);
              if (hit && hit.path) resolvedPaths.set(videoFileKey(entry.file), hit.path);
            }
          });
          if (workers.length) await Promise.all(workers);
          store.set({ videoImporting: { total: batch.length, done: 0, failed: 0 } }, { persist: false });
          let firstId = null;
          const importedIds = [];
          let failed = 0;
          let lastVideoError = null;
          for (const entry of batch) {
            if (disposed) break;
            const file = entry.file;
            try {
              const id = newId('vid');
              const mime = file.type || 'video/mp4';
              // Prefer the real path: drag-and-drop, <input type=file> and
              // webkitdirectory all hand us a File without one (Electron 32+
              // removed File.path), and a path is what unlocks host streaming
              // plus the AAC sidecar for E-AC-3/DTS audio.
              const sourcePath = (typeof file.path === 'string' && file.path) ||
                resolvedPaths.get(videoFileKey(file)) || null;
              const record = {
                id,
                name: videoDisplayName(file.name),
                mime,
                size: file.size || 0,
                key: videoFileKey(file),
                hasHandle: Boolean(entry.handle) && !sourcePath,
                sourcePath,
                createdAt: Date.now()
              };
              try {
                await idbPutVideoItem(record);
                if (sourcePath) {
                  // Electron gives us the real path; store metadata only and
                  // let the host stream the bytes from disk (no 14 GB copy).
                } else if (entry.handle) {
                  // Store only the handle — a few hundred bytes — and stream
                  // the original file from disk later. No 1 GB blob copy.
                  await idbPutVideoHandle(id, entry.handle);
                  videoHandleCache.set(id, entry.handle);
                } else {
                  await idbPutVideoBlob(id, file);
                }
              } catch (error) {
                try {
                  await idbDeleteVideo(id);
                } catch (cleanupError) {
                  /* ignore */
                }
                throw error;
              }
              const item = {
                id,
                name: record.name,
                mime: record.mime,
                size: record.size,
                key: record.key,
                hasHandle: record.hasHandle,
                sourcePath: record.sourcePath
              };
              importedIds.push(id);
              if (firstId === null) {
                // Path import streams through the host route; browser/handle
                // imports still use an object URL straight from the File.
                const url = sourcePath
                  ? '/api/skin-studio/media/video?path=' + encodeURIComponent(sourcePath)
                  : URL.createObjectURL(file);
                videoUrlCache.set(id, url);
                item.fullUrl = url;
                firstId = id;
              }
              const now = store.get();
              store.set({
                customVideos: now.customVideos.concat(item),
                videoImporting: {
                  total: batch.length,
                  done: (now.videoImporting ? now.videoImporting.done : 0) + 1,
                  failed: (now.videoImporting ? now.videoImporting.failed : 0) + (failed ? 1 : 0)
                }
              }, { persist: false });
              if (firstId === id) {
                store.set({ videoId: id, videoPlaying: true, videoMuted: false }, { persist: true });
                const firstItem = findCustomVideo(id);
                if (firstItem) prepareVideoAudio(firstItem);
              }
            } catch (error) {
              failed += 1;
              lastVideoError = error;
              console.error('[skin-studio] video import failed', error);
              const now = store.get();
              store.set({
                videoImporting: {
                  total: batch.length,
                  done: (now.videoImporting ? now.videoImporting.done : 0) + 1,
                  failed
                }
              }, { persist: false });
            }
          }
          if (!disposed) {
            // Always clear the busy flag, even if a store.set above threw —
            // otherwise the add button could stay disabled forever.
            try {
              store.set({ videoImporting: null }, { persist: true });
            } catch (clearError) {
              store.set({ videoImporting: null }, { persist: false });
            }
            if (failed && failed === batch.length) {
              const errName = lastVideoError && lastVideoError.name;
              const storage = errName === 'QuotaExceededError' ||
                errName === 'InvalidStateError' ||
                errName === 'NotSupportedError' ||
                /quota/i.test(String(lastVideoError && lastVideoError.message || ''));
              store.notify(storage ? 'videoQuota' : 'videoInvalid');
            } else if (failed) store.notify('videoPartial');
          }
          // Anything the up-front lookup missed (file outside the usual media
          // folders, renamed after import) gets a second chance once the batch
          // has settled, so a drop never leaves an unreachable silent record.
          if (!disposed) {
            healMissingPaths(importedIds).then((healed) => {
              if (disposed) return;
              const still = importedIds.filter((id) => {
                const item = findCustomVideo(id);
                return item && !item.sourcePath;
              });
              if (still.length) store.notify('videoPathMissing');
              else if (healed) store.notify('videoRelinkedAuto');
            }).catch(() => {});
          }
        }

        // Pick videos through the File System Access API when available so we
        // can persist file handles (streams from disk, any size). Falls back to
        // a plain <input> in browsers without the API.
        // Open a file picker for videos. The native <input type=file> is the
        // universal, always-works path; when the File System Access API is
        // available we additionally grab a persistent handle so the original
        // file can stream from disk (any size). We NEVER let a hanging/throwing
        // showOpenFilePicker swallow the click — if it fails fast we fall back
        // to the input, and the input is also wired directly as a safety net.
        async function pickAndImportVideos(fallbackInput) {
          const inputEl = fallbackInput && fallbackInput.current;
          // In Electron the <input type=file> File exposes its real path,
          // which we need for host streaming and the ffmpeg audio sidecar.
          // The File System Access handle hides that path, so prefer the
          // native input in Electron and keep the handle picker for browsers.
          const isElectron = typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || '');
          if (isElectron) {
            // Ask the host for a real POSIX path list: one dialog, many videos.
            // Streaming and ffmpeg probing both need paths, and Electron's
            // <input type=file> hides them, so this is the preferred path.
            let hostPickerMissing = false;
            try {
              const response = await fetch(mediaPath('/api/skin-studio/media/pick-many'), { method: 'GET', cache: 'no-store' });
              if (response.status === 404) {
                // Older host without the multi-select route: skip the
                // single-file /pick and fall through to the native <input>,
                // which still allows choosing several files at once.
                hostPickerMissing = true;
              } else if (response.ok) {
                const data = await response.json();
                if (data && data.ok && Array.isArray(data.files) && data.files.length) {
                  for (const info of data.files) {
                    await importVideoPath(info);
                  }
                  return;
                }
                if (data && data.canceled) return;
                hostPickerMissing = true;
              }
            } catch (error) {
              console.warn('[skin-studio] host multi picker unavailable', error && error.message);
            }
            if (!hostPickerMissing) {
              try {
                const response = await fetch(mediaPath('/api/skin-studio/media/pick'), { method: 'GET', cache: 'no-store' });
                if (response.ok) {
                  const data = await response.json();
                  if (data && data.ok && data.path) {
                    await importVideoPath(data);
                    return;
                  }
                  if (data && data.canceled) return;
                }
              } catch (error) {
                console.warn('[skin-studio] host video picker unavailable', error && error.message);
              }
            }
          }
          if (isElectron && inputEl) {
            try { inputEl.click(); return; } catch (error) { console.warn('[skin-studio] video input open failed', error); }
          }
          const canPicker = typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
          if (canPicker) {
            let settled = false;
            try {
              const handles = await window.showOpenFilePicker({
                multiple: true,
                types: [{
                  description: 'Video',
                  accept: { 'video/*': ['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.ogg', '.mkv', '.avi', '.mpg', '.mpeg', '.ts', '.m2ts', '.flv', '.wmv', '.3gp'] }
                }]
              });
              settled = true;
              if (!handles || !handles.length) return;
              const files = await Promise.all(handles.map((handle) => handle.getFile()));
              await importVideoFiles(files, handles);
              return;
            } catch (error) {
              settled = true;
              if (error && (error.name === 'AbortError' || /abort/i.test(String(error.message || '')))) return;
              console.warn('[skin-studio] file picker failed, using input fallback', error);
            }
            if (settled) {
              // Picker ran but failed for a non-abort reason: try the input.
            }
          }
          if (inputEl) {
            try {
              inputEl.click();
            } catch (error) {
              console.error('[skin-studio] video input open failed', error);
            }
          } else {
            store.notify('videoReselect');
          }
        }

        async function hydrateVideos() {
          // Clear any videoImporting flag left over from a previous crashed
          // import so it can never leave the add button looking disabled.
          if (store.get().videoImporting) store.set({ videoImporting: null }, { persist: false });
          let dbItems = [];
          let available = false;
          try {
            dbItems = await idbListVideoItems();
            available = true;
            const newest = new Map();
            for (const record of dbItems) {
              const key = videoIdentity(record);
              const previous = newest.get(key);
              if (!previous || (Number(record.createdAt) || 0) >= (Number(previous.createdAt) || 0)) {
                newest.set(key, record);
              }
            }
            const keepIds = new Set(Array.from(newest.values()).map((record) => record.id));
            const staleIds = dbItems.filter((record) => !keepIds.has(record.id)).map((record) => record.id);
            dbItems = Array.from(newest.values());
            staleIds.forEach((id) => {
              idbDeleteVideo(id).catch((error) => {
                console.warn('[skin-studio] could not remove duplicate video', error);
              });
            });
          } catch (error) {
            console.error('[skin-studio] video IndexedDB unavailable', error);
          }
          if (disposed) return;
          // Guards against a race where an import wrote newer records while the
          // asynchronous hydration read was still in flight: merge DB records
          // with anything already in memory instead of clobbering it.
          const current = store.get();
          const byId = new Map();
          dbItems.forEach((record) => {
            byId.set(record.id, {
              id: record.id,
              name: record.name,
              mime: record.mime || record.type,
              size: record.size,
              url: record.url,
              key: record.key,
              hasHandle: record.hasHandle,
              sourcePath: record.sourcePath || null,
              audioUrl: usableAudioUrl(record.audioUrl) || null
            });
          });
          current.customVideos.forEach((item) => {
            if (!byId.has(item.id)) byId.set(item.id, item);
          });
          const items = dedupeBy(Array.from(byId.values()), videoIdentity);
          store.set({ customVideos: items }, { persist: false });
          const activeId = store.get().videoId;
          if (activeId !== 'none' && !items.some((item) => item.id === activeId)) {
            store.set({ videoId: 'none' }, { persist: true });
          } else if (activeId !== 'none') {
            await ensureVideoUrl(activeId);
            const active = findCustomVideo(activeId);
            if (active) prepareVideoAudio(active);
          }
          store.set({}, { persist: true });
          // Self-heal records created before the plugin knew how to keep a file
          // path (Electron 32 dropped File.path, so those became IndexedDB
          // blobs). Without a path the host cannot build an AAC sidecar and a
          // movie with E-AC-3/DTS audio plays with a picture and no sound.
          // Runs once per page load, bounded, and never blocks the UI.
          if (!relinkSweepStarted) {
            relinkSweepStarted = true;
            const pathless = items.filter((item) => !item.sourcePath && item.name);
            if (pathless.length) {
              (async () => {
                const healed = await healMissingPaths(pathless.map((item) => item.id), { silent: true, audio: false });
                if (!healed) return;
                store.notify('videoRelinked');
                const activeId2 = store.get().videoId;
                if (activeId2 !== 'none') {
                  const again = findCustomVideo(activeId2);
                  if (again) prepareVideoAudio(again);
                }
              })().catch((error) => {
                console.warn('[skin-studio] video relink sweep failed', error && error.message);
              });
            }
          }
        }

        let relinkSweepStarted = false;
        // Send the same snapshot to the host so the state of a silent video can
        // be read from disk (tmpdir/dsh-skin-studio-audio/diag.json) without a
        // console. Fire after hydration and whenever the tab becomes visible.
        const reportDiagnostics = () => {
          try {
            const body = JSON.stringify(skinStudioDiag());
            fetch(mediaPath('/api/skin-studio/media/report'), {
              method: 'POST', cache: 'no-store',
              headers: { 'content-type': 'application/json' },
              body
            }).catch(() => {});
          } catch (error) { /* ignore */ }
        };
        setTimeout(reportDiagnostics, 5000);
        setTimeout(reportDiagnostics, 25000);
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('visibilitychange', () => { if (!document.hidden) reportDiagnostics(); });
        }
        hydrateVideos().catch((error) => {
          console.error('[skin-studio] video hydration failed', error);
        });

        // ---------- shared view helpers ----------

        const skinCards = (state) => [{ id: 'default', name: t('skin.default'), skin: DEFAULT_SKIN }]
          .concat(SKIN_PRESETS.map((preset) => ({ id: preset.id, name: t(preset.nameKey), skin: deriveSkin(preset) })))
          .concat(state.customSkins.map((item) => ({ id: item.id, name: item.name, skin: deriveSkin(item), custom: true })));

        function wallpaperCatalog(state) {
          const none = { id: 'none', name: t('wallpaper.none'), image: null };
          const presets = WALLPAPER_PRESETS.map((preset) => ({
            id: preset.id, name: t(preset.nameKey), image: preset.image, thumb: preset.image
          }));
          const custom = state.customWallpapers.slice().reverse().map((item) => {
            const thumb = cssUrl(item.thumb || item.url || item.full);
            return {
              id: item.id,
              name: item.name,
              image: thumb,
              thumb,
              custom: true
            };
          });
          return { none, presets, custom, all: [none].concat(custom, presets) };
        }

        function filterWallpapers(catalog, state) {
          if (state.wallpaperFilter === 'favorites') {
            return catalog.all.filter((card) => card.id !== 'none' && state.favorites.indexOf(card.id) !== -1);
          }
          if (state.wallpaperFilter === 'mine') return catalog.custom;
          if (state.wallpaperFilter === 'presets') return catalog.presets;
          return catalog.all;
        }

        function emptyKeyForFilter(filter) {
          if (filter === 'favorites') return 'wallpaper.emptyFavorites';
          if (filter === 'mine') return 'wallpaper.emptyMine';
          return 'wallpaper.empty';
        }

        function useWallpaperPager(count, filter) {
          const [page, setPage] = useState(0);
          const pageCount = Math.max(1, Math.ceil(count / WALLPAPERS_PER_PAGE));
          useEffect(() => {
            setPage(0);
          }, [filter]);
          useEffect(() => {
            setPage((value) => Math.min(value, pageCount - 1));
          }, [pageCount]);
          const go = (direction) => {
            setPage((value) => Math.min(Math.max(0, value + direction), pageCount - 1));
          };
          return { page: Math.min(page, pageCount - 1), pageCount, go };
        }

        function useWallpaperSelection(cards, filter) {
          const [selectedIds, setSelectedIds] = useState([]);
          const [anchorId, setAnchorId] = useState(null);
          const selectableIds = cards.filter((card) => card.custom).map((card) => card.id);
          const selectableKey = selectableIds.join('\u0001');
          const selectedSet = new Set(selectedIds);
          const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(id));

          useEffect(() => {
            setSelectedIds([]);
            setAnchorId(null);
          }, [filter]);

          useEffect(() => {
            setSelectedIds((previous) => {
              const next = previous.filter((id) => selectableIds.indexOf(id) !== -1);
              return next.length === previous.length ? previous : next;
            });
            setAnchorId((previous) => (previous && selectableIds.indexOf(previous) !== -1 ? previous : null));
          }, [selectableKey]);

          const toggleSelection = (id, event) => {
            if (selectableIds.indexOf(id) === -1) return;
            setSelectedIds((previous) => {
              const next = new Set(previous);
              if (event && event.shiftKey && anchorId) {
                const from = selectableIds.indexOf(anchorId);
                const to = selectableIds.indexOf(id);
                if (from >= 0 && to >= 0) {
                  const start = Math.min(from, to);
                  const end = Math.max(from, to);
                  for (let index = start; index <= end; index += 1) next.add(selectableIds[index]);
                  return Array.from(next);
                }
              }
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return Array.from(next);
            });
            if (!event || !event.shiftKey || !anchorId) setAnchorId(id);
          };

          const selectAll = () => {
            if (!selectableIds.length) return;
            setSelectedIds(allSelected ? [] : selectableIds.slice());
            setAnchorId(allSelected ? null : selectableIds[0]);
          };

          const clearSelection = () => {
            setSelectedIds([]);
            setAnchorId(null);
          };

          return {
            selectedIds,
            selectedSet,
            selecting: selectedIds.length > 0,
            allSelected,
            selectableCount: selectableIds.length,
            toggleSelection,
            selectAll,
            clearSelection
          };
        }

        function WallpaperSelectionBar(props) {
          if (!props.count) return null;
          return h('div', {
            className: 'dsh-skin-select-bar' + (props.quick ? ' is-quick' : ''),
            role: 'status'
          },
            h('span', { className: 'dsh-skin-select-count' }, t('wallpaper.selected') + ' ' + props.count),
            h('div', { className: 'dsh-skin-select-actions' },
              h('button', {
                type: 'button', className: 'dsh-skin-select-link',
                disabled: !props.selectableCount || props.busy,
                onClick: props.onSelectAll
              }, t(props.allSelected ? 'wallpaper.deselectAll' : 'wallpaper.selectAll')),
              h('button', {
                type: 'button', className: 'dsh-skin-btn is-danger',
                disabled: props.busy,
                onClick: props.onDelete
              }, t(props.quick ? 'wallpaper.deleteSelectedShort' : 'wallpaper.deleteSelected')),
              h('button', {
                type: 'button', className: 'dsh-skin-select-cancel',
                onClick: props.onCancel
              }, t('wallpaper.cancel'))
            )
          );
        }

        function WallpaperFilters(props) {
          return h('div', { className: 'dsh-skin-filters', role: 'group', 'aria-label': t('quick.wallpaper') },
            WALLPAPER_FILTERS.map((id) => h('button', {
              type: 'button', key: id,
              'aria-pressed': props.active === id ? 'true' : 'false',
              className: 'dsh-skin-filter' + (props.active === id ? ' is-active' : ''),
              onClick: () => props.onChange(id)
            }, t('wallpaper.filter.' + id)))
          );
        }

        function WallpaperPager(props) {
          if (props.pageCount <= 1) return null;
          return h('div', { className: 'dsh-skin-pager', title: t('wallpaper.swipeHint') },
            h('button', {
              type: 'button', className: 'dsh-skin-page-btn', disabled: props.page <= 0,
              'aria-label': t('wallpaper.prev'), title: t('wallpaper.prev'),
              onClick: () => props.go(-1)
            }, h(IconChevron, { dir: 'left', size: 12 })),
            h('span', { className: 'dsh-skin-page-num', 'aria-live': 'polite' },
              (props.page + 1) + ' / ' + props.pageCount),
            h('button', {
              type: 'button', className: 'dsh-skin-page-btn', disabled: props.page >= props.pageCount - 1,
              'aria-label': t('wallpaper.next'), title: t('wallpaper.next'),
              onClick: () => props.go(1)
            }, h(IconChevron, { dir: 'right', size: 12 }))
          );
        }

        function WallpaperStrip(props) {
          const stageRef = useRef(null);
          const touchRef = useRef(null);
          const swallowClickRef = useRef(false);
          const goRef = useRef(props.go);
          goRef.current = props.go;

          useEffect(() => {
            const node = stageRef.current;
            if (!node) return undefined;
            let lastWheelAt = 0;
            const onWheel = (event) => {
              if (event.ctrlKey) return;
              const ax = Math.abs(event.deltaX);
              const ay = Math.abs(event.deltaY);
              if (ax < 20 || ax <= ay) return;
              event.preventDefault();
              if (props.pageCount <= 1) return;
              const now = Date.now();
              if (now - lastWheelAt < 360) return;
              lastWheelAt = now;
              goRef.current(event.deltaX > 0 ? 1 : -1);
            };
            node.addEventListener('wheel', onWheel, { passive: false });
            return () => node.removeEventListener('wheel', onWheel);
          }, [props.pageCount]);

          const onTouchStart = (event) => {
            swallowClickRef.current = false;
            const touch = event.touches && event.touches[0];
            if (touch) touchRef.current = { x: touch.clientX, y: touch.clientY };
          };
          const onTouchEnd = (event) => {
            const start = touchRef.current;
            touchRef.current = null;
            if (!start) return;
            const touch = event.changedTouches && event.changedTouches[0];
            if (!touch) return;
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) {
              swallowClickRef.current = true;
              setTimeout(() => { swallowClickRef.current = false; }, 450);
              goRef.current(dx < 0 ? 1 : -1);
            }
          };
          const onClickCapture = (event) => {
            if (!swallowClickRef.current) return;
            swallowClickRef.current = false;
            event.preventDefault();
            event.stopPropagation();
          };

          const gridClass = props.quick ? 'dsh-skin-walls' : 'dsh-skin-wall-grid';
          return h('div', {
            className: 'dsh-skin-wall-stage',
            ref: stageRef,
            onTouchStart,
            onTouchEnd,
            onClickCapture
          },
            h('div', {
              key: props.filter + ':' + props.page,
              className: gridClass + ' dsh-skin-wall-page' + (props.selecting ? ' is-selecting' : '')
            },
              h(AddWallpaperTile, { key: 'add-wallpaper' }),
              props.cards.map(props.renderCard),
              props.total === 0
                ? h('p', { className: 'dsh-skin-hint dsh-skin-empty' }, t(emptyKeyForFilter(props.filter)))
                : null
            )
          );
        }

        const importingLabel = (importing) => t('wallpaper.importing')
          .replace('{done}', String(importing.done))
          .replace('{total}', String(importing.total));

        function AddWallpaperTile() {
          const state = useStore(store);
          useLocale();
          const [dragging, setDragging] = useState(false);
          const fileRef = useRef(null);
          const folderRef = useRef(null);
          const importing = state.importing;
          const atLimit = state.customWallpapers.length >= MAX_CUSTOM_WALLPAPERS;
          // Never hard-disable on storage readiness/flags: a blocked or slow
          // IndexedDB used to leave storageReady=false and make this button
          // silently unclickable. Only the item limit disables it; a running
          // import shows progress but stays clickable (re-entry guarded below).
          const disabled = atLimit;
          const title = atLimit ? t('wallpaper.limit') : t('wallpaper.addFiles');
          const label = importing ? importingLabel(importing) : t('wallpaper.add');

          const openPicker = (ref) => {
            if (disabled || !ref.current) return;
            ref.current.click();
          };
          const onFiles = (event) => {
            const input = event.target;
            // FileList is live: copy it before clearing the input, otherwise the
            // selection is emptied and nothing gets imported.
            const files = input.files ? Array.from(input.files) : [];
            input.value = '';
            if (files.length) {
              importWallpaperFiles(files).catch((error) => {
                console.error('[skin-studio] wallpaper import failed', error);
                store.notify('image');
              });
            }
          };
          const onDrop = (event) => {
            event.preventDefault();
            setDragging(false);
            if (disabled) return;
            filesFromDataTransfer(event.dataTransfer).then((files) => {
              if (files && files.length) return importWallpaperFiles(files);
              store.notify('image');
              return undefined;
            }).catch((error) => {
              console.error('[skin-studio] drop failed', error);
              store.notify('image');
            });
          };

          return h('div', {
            className: 'dsh-skin-item dsh-skin-add-item' + (dragging ? ' is-dragging' : ''),
            onDragOver: (event) => {
              event.preventDefault();
              if (!disabled) setDragging(true);
            },
            onDragLeave: (event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
            },
            onDrop
          },
            h('button', {
              type: 'button',
              className: 'dsh-skin-add-main',
              disabled,
              title,
              'aria-label': title,
              onClick: () => openPicker(fileRef)
            },
              h(IconPlus, { size: 20 }),
              h('span', { className: 'dsh-skin-add-label' }, label)
            ),
            h('button', {
              type: 'button',
              className: 'dsh-skin-add-folder',
              disabled,
              title: t('wallpaper.addFolder'),
              'aria-label': t('wallpaper.addFolder'),
              onClick: () => openPicker(folderRef)
            }, h(IconFolderPlus, { size: 12 })),
            h('input', {
              ref: fileRef,
              type: 'file',
              accept: 'image/*',
              multiple: true,
              style: { display: 'none' },
              onChange: onFiles
            }),
            h('input', {
              ref: folderRef,
              type: 'file',
              multiple: true,
              webkitdirectory: '',
              directory: '',
              style: { display: 'none' },
              onChange: onFiles
            })
          );
        }

        function Preview() {
          const state = useStore(store);
          useLocale();
          const scheme = useScheme();
          const skin = resolveSkin(state);
          const wallpaper = resolveWallpaper(state);
          const palette = scheme === 'dark' ? skin.dark : skin.light;
          const glass = state.glass !== false;
          const surface = (color) => (wallpaper && glass ? rgba(color, 0.8) : color);
          return h('div', {
            className: 'dsh-skin-preview',
            role: 'img',
            'aria-label': t('preview.label'),
            style: {
              backgroundColor: palette.base,
              backgroundImage: wallpaper ? wallpaperLayers(wallpaper, state.dim, scheme) : 'none'
            }
          },
            h('div', { className: 'dsh-skin-preview-side', style: { backgroundColor: surface(palette.sidebar) } },
              h('span', { className: 'dsh-skin-preview-dot', style: { backgroundColor: palette.brand } }),
              h('span', { className: 'dsh-skin-preview-dot is-soft', style: { backgroundColor: rgba(palette.label, 0.25) } }),
              h('span', { className: 'dsh-skin-preview-dot is-soft', style: { backgroundColor: rgba(palette.label, 0.18) } })
            ),
            h('div', { className: 'dsh-skin-preview-main' },
              h('div', { className: 'dsh-skin-preview-bubble is-assistant', style: { backgroundColor: surface(palette.layer1) } },
                h('span', { className: 'dsh-skin-line', style: { width: '72%', backgroundColor: rgba(palette.label, 0.45) } }),
                h('span', { className: 'dsh-skin-line', style: { width: '52%', backgroundColor: rgba(palette.label, 0.24) } })
              ),
              h('div', { className: 'dsh-skin-preview-bubble is-user', style: { backgroundColor: palette.brand } },
                h('span', { className: 'dsh-skin-line', style: { width: '80%', backgroundColor: 'rgba(255,255,255,.9)' } }),
                h('span', { className: 'dsh-skin-line', style: { width: '46%', backgroundColor: 'rgba(255,255,255,.58)' } })
              )
            ),
            h('div', { className: 'dsh-skin-preview-composer', style: { backgroundColor: surface(palette.layer1), borderColor: rgba(palette.label, 0.16) } })
          );
        }

        function ThemeModeControl(props) {
          useLocale();
          const preference = useThemePreference();
          const compact = Boolean(props && props.compact);
          const modes = [
            { id: 'light', label: 'theme.light', icon: IconSun },
            { id: 'dark', label: 'theme.dark', icon: IconMoon },
            { id: 'system', label: 'theme.system', icon: IconMonitor }
          ];
          return h('div', {
            className: 'dsh-skin-modes' + (compact ? ' is-compact' : ''),
            role: 'group',
            'aria-label': t('theme.mode')
          }, modes.map((mode) => {
            const active = preference === mode.id;
            return h('button', {
              type: 'button',
              key: mode.id,
              className: 'dsh-skin-mode' + (active ? ' is-active' : ''),
              'aria-pressed': active ? 'true' : 'false',
              title: t(mode.label),
              onClick: () => setThemePreference(mode.id)
            }, h(mode.icon, { size: compact ? 12 : 13 }), h('span', null, t(mode.label)));
          }));
        }

        class SkinBoundary extends React.Component {
          constructor(props) {
            super(props);
            this.state = { failed: false };
          }
          static getDerivedStateFromError() { return { failed: true }; }
          componentDidCatch(error) { console.error('[skin-studio] UI component failed', error); }
          render() { return this.state.failed ? null : this.props.children; }
        }

        function guarded(Component) {
          return function SkinGuarded(props) {
            return h(SkinBoundary, null, h(Component, props));
          };
        }

        // ---------- settings section ----------

        function SettingsPage() {
          const state = useStore(store);
          useLocale();
          useScheme();
          const [editorOpen, setEditorOpen] = useState(false);
          const [draft, setDraft] = useState({ name: '', accent: '#7C5CD6', lightBg: '#F7F4FC', darkBg: '#16121F' });
          const [urlValue, setUrlValue] = useState('');

          useEffect(() => {
            if (!state.notice) return undefined;
            const timer = setTimeout(() => store.dismissNotice(), 7000);
            return () => clearTimeout(timer);
          }, [state.notice]);

          const skins = skinCards(state);
          const catalog = wallpaperCatalog(state);
          const filtered = filterWallpapers(catalog, state);
          const pager = useWallpaperPager(filtered.length, state.wallpaperFilter);
          const pageCards = filtered.slice(
            pager.page * WALLPAPERS_PER_PAGE,
            (pager.page + 1) * WALLPAPERS_PER_PAGE
          );
          const activeSkin = skins.find((card) => card.id === state.skinId) || skins[0];
          const activeWallpaper = catalog.all.find((card) => card.id === state.wallpaperId) || catalog.none;
          const selection = useWallpaperSelection(filtered, state.wallpaperFilter);

          const deleteSelectedWallpapers = () => {
            if (!selection.selectedIds.length || state.importing) return;
            if (selection.selectedIds.length > 1 && typeof window.confirm === 'function') {
              const confirmed = window.confirm(t('wallpaper.deleteManyConfirm'));
              if (!confirmed) return;
            }
            deleteCustomWallpapers(selection.selectedIds).then(() => selection.clearSelection());
          };

          const handleWallpaperClick = (card, event) => {
            if (selection.selecting) {
              if (card.custom) selection.toggleSelection(card.id, event);
              return;
            }
            if (event && event.shiftKey && card.custom) {
              selection.toggleSelection(card.id, event);
              return;
            }
            selectWallpaper(card.id);
          };

          const renderWallpaperCard = (card) => {
            const active = state.wallpaperId === card.id;
            const favorite = state.favorites.indexOf(card.id) >= 0;
            const selected = selection.selectedSet.has(card.id);
            return h('div', { className: 'dsh-skin-item', key: card.id },
              h('button', {
                type: 'button',
                className: 'dsh-skin-wall-card' + (active ? ' is-active' : '') + (selected ? ' is-selected' : ''),
                'aria-pressed': active,
                title: card.name,
                onClick: (event) => handleWallpaperClick(card, event)
              },
                h('span', {
                  className: 'dsh-skin-wall-thumb' + (card.image ? '' : ' is-none'),
                  style: card.image ? { backgroundImage: card.thumb || card.image } : null
                }, active ? h('span', { className: 'dsh-skin-badge' }, h(IconCheck, { size: 12 })) : null),
                h('span', { className: 'dsh-skin-wall-name' }, card.name)
              ),
              card.custom
                ? h('button', {
                  type: 'button',
                  className: 'dsh-skin-select' + (selected ? ' is-selected' : ''),
                  title: t(selected ? 'wallpaper.deselect' : 'wallpaper.select'),
                  'aria-label': t(selected ? 'wallpaper.deselect' : 'wallpaper.select'),
                  'aria-pressed': selected,
                  onClick: (event) => { event.stopPropagation(); selection.toggleSelection(card.id, event); }
                }, selected ? h(IconCheck, { size: 12 }) : null)
                : null,
              card.id !== 'none'
                ? h('button', {
                  type: 'button',
                  className: 'dsh-skin-fav' + (favorite ? ' is-on' : ''),
                  title: t(favorite ? 'wallpaper.unfavorite' : 'wallpaper.favorite'),
                  'aria-label': t(favorite ? 'wallpaper.unfavorite' : 'wallpaper.favorite'),
                  'aria-pressed': favorite,
                  onClick: (event) => { event.stopPropagation(); toggleFavorite(card.id); }
                }, h(IconStar, { filled: favorite, size: 12 }))
                : null,
              card.custom
                ? h('button', {
                  type: 'button', className: 'dsh-skin-photo-del', title: t('wallpaper.delete'),
                  'aria-label': t('wallpaper.delete'),
                  disabled: Boolean(state.importing),
                  onClick: (event) => { event.stopPropagation(); deleteCustomWallpaper(card.id); }
                }, h(IconTrash, { size: 12 }))
                : null
            );
          };

          const deleteSkin = (id) => {
            store.set({
              customSkins: state.customSkins.filter((item) => item.id !== id),
              skinId: state.skinId === id ? 'default' : state.skinId
            });
          };

          const saveCustomSkin = () => {
            if (state.customSkins.length >= MAX_CUSTOM_SKINS) {
              store.notify('skinLimit');
              return;
            }
            const item = {
              id: newId('skin'),
              name: (draft.name.trim() || (t('skin.untitled') + ' ' + (state.customSkins.length + 1))).slice(0, 40),
              accent: normalizeHex(draft.accent, '#7C5CD6'),
              lightBg: normalizeHex(draft.lightBg, '#F7F4FC'),
              darkBg: normalizeHex(draft.darkBg, '#16121F')
            };
            store.set({ customSkins: state.customSkins.concat(item), skinId: item.id });
            setDraft(Object.assign({}, draft, { name: '' }));
          };

          const addUrlWallpaper = async () => {
            const raw = urlValue.trim();
            if (!raw) return;
            let parsed;
            try {
              parsed = new URL(raw);
            } catch (error) {
              store.notify('url');
              return;
            }
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              store.notify('url');
              return;
            }
            if (state.customWallpapers.length >= MAX_CUSTOM_WALLPAPERS) {
              store.notify('wallpaperLimit');
              return;
            }
            const item = {
              id: newId('wall'),
              name: (parsed.hostname.replace(/^www\./, '') || t('wallpaper.untitled')).slice(0, 40),
              lum: 0.35,
              url: raw,
              key: 'url:' + raw
            };
            store.set({
              customWallpapers: state.customWallpapers.concat(item),
              wallpaperId: item.id,
              wallpaperFilter: 'mine'
            });
            setUrlValue('');
            if (!state.storageAvailable) {
              store.notify('storageUnavailable');
              return;
            }
            try {
              await idbPutItem({
                id: item.id,
                name: item.name,
                lum: item.lum,
                url: raw,
                key: item.key,
                createdAt: Date.now()
              });
            } catch (error) {
              console.error('[skin-studio] could not save wallpaper link', error);
              store.notify('storage');
            }
          };

          const resetAll = () => {
            const confirmed = typeof window.confirm === 'function' ? window.confirm(t('reset.confirm')) : true;
            if (!confirmed) return;
            // Clear the video backdrop too, otherwise the whole UI stays black
            // / transparent behind an active video when the user asks for a
            // clean default look.
            store.set({
              skinId: 'default',
              wallpaperId: 'none',
              videoId: 'none',
              videoPlaying: true,
              dim: DEFAULT_DIM,
              glass: true
            });
          };

          return h('div', { className: 'dsh-skin-page' },
            h('style', { key: 'styles' }, STYLE_CSS),
            state.notice
              ? h('div', { className: 'dsh-skin-notice', role: 'status', key: 'notice' },
                h('span', null, noticeText(state.notice, t)),
                h('button', {
                  type: 'button', className: 'dsh-skin-notice-x', 'aria-label': t('quick.close'),
                  onClick: store.dismissNotice
                }, '×')
              )
              : null,
            h('p', { className: 'dsh-skin-lede' }, t('page.desc')),
            h('span', { className: 'dsh-skin-version', key: 'version' }, 'Skin Studio v' + PLUGIN_VERSION + ' · build ' + BUILD),
            h(VideoDiagLine, { key: 'video-diag' }),
            h(Preview, { key: 'preview' }),

            h('section', { className: 'dsh-skin-section', key: 'skin' },
              h('div', { className: 'dsh-skin-section-head' },
                h('h2', { className: 'dsh-skin-h2' }, t('section.skin')),
                h('span', { className: 'dsh-skin-hint' }, activeSkin.name)
              ),
              h('p', { className: 'dsh-skin-hint' }, t('section.skin.desc')),
              h('div', { className: 'dsh-skin-mode-row' },
                h('div', { className: 'dsh-skin-mode-copy' },
                  h('span', { className: 'dsh-skin-mode-label' }, t('theme.mode')),
                  h('span', { className: 'dsh-skin-hint' }, t('theme.mode.desc'))
                ),
                h(ThemeModeControl, { key: 'theme-mode' })
              ),
              h('div', { className: 'dsh-skin-grid' }, skins.map((card) => {
                const active = state.skinId === card.id;
                return h('div', { className: 'dsh-skin-item', key: card.id },
                  h('button', {
                    type: 'button',
                    className: 'dsh-skin-card' + (active ? ' is-active' : ''),
                    'aria-pressed': active,
                    title: card.name,
                    onClick: () => store.set({ skinId: card.id })
                  },
                    h('span', { className: 'dsh-skin-swatch', style: { backgroundColor: card.skin.light.base } },
                      h('span', { className: 'dsh-skin-swatch-side', style: { backgroundColor: card.skin.light.sidebar } }),
                      h('span', { className: 'dsh-skin-swatch-main' },
                        h('span', { className: 'dsh-skin-swatch-chip', style: { backgroundColor: card.skin.light.brand } }),
                        h('span', { className: 'dsh-skin-swatch-chip is-soft', style: { backgroundColor: card.skin.light.layer1 } })
                      )
                    ),
                    h('span', { className: 'dsh-skin-card-name' }, card.name),
                    active ? h('span', { className: 'dsh-skin-check' }, h(IconCheck, { size: 12 })) : null
                  ),
                  card.custom
                    ? h('button', {
                      type: 'button', className: 'dsh-skin-del', title: t('skin.delete'),
                      'aria-label': t('skin.delete'),
                      onClick: () => deleteSkin(card.id)
                    }, h(IconTrash, { size: 12 }))
                    : null
                );
              })),
              h('div', { className: 'dsh-skin-custom' },
                h('div', { className: 'dsh-skin-actions' },
                  h('button', {
                    type: 'button',
                    className: 'dsh-skin-btn' + (editorOpen ? ' is-primary' : ''),
                    'aria-expanded': editorOpen,
                    onClick: () => setEditorOpen(!editorOpen)
                  }, (editorOpen ? '− ' : '+ ') + t('skin.custom'))
                ),
                editorOpen
                  ? h('div', { className: 'dsh-skin-editor' },
                    h('p', { className: 'dsh-skin-hint' }, t('skin.customDesc')),
                    h('div', { className: 'dsh-skin-fields' },
                      h('label', { className: 'dsh-skin-field' },
                        h('span', null, t('skin.name')),
                        h('input', {
                          className: 'dsh-skin-input', type: 'text', placeholder: t('skin.namePlaceholder'),
                          value: draft.name, onChange: (event) => setDraft(Object.assign({}, draft, { name: event.target.value }))
                        })
                      ),
                      h('label', { className: 'dsh-skin-field' },
                        h('span', null, t('skin.accent')),
                        h('input', {
                          className: 'dsh-skin-color', type: 'color', value: draft.accent,
                          'aria-label': t('skin.accent'),
                          onChange: (event) => setDraft(Object.assign({}, draft, { accent: event.target.value }))
                        }),
                        h('code', { className: 'dsh-skin-hex' }, draft.accent)
                      ),
                      h('label', { className: 'dsh-skin-field' },
                        h('span', null, t('skin.lightBg')),
                        h('input', {
                          className: 'dsh-skin-color', type: 'color', value: draft.lightBg,
                          'aria-label': t('skin.lightBg'),
                          onChange: (event) => setDraft(Object.assign({}, draft, { lightBg: event.target.value }))
                        }),
                        h('code', { className: 'dsh-skin-hex' }, draft.lightBg)
                      ),
                      h('label', { className: 'dsh-skin-field' },
                        h('span', null, t('skin.darkBg')),
                        h('input', {
                          className: 'dsh-skin-color', type: 'color', value: draft.darkBg,
                          'aria-label': t('skin.darkBg'),
                          onChange: (event) => setDraft(Object.assign({}, draft, { darkBg: event.target.value }))
                        }),
                        h('code', { className: 'dsh-skin-hex' }, draft.darkBg)
                      )
                    ),
                    h('div', { className: 'dsh-skin-actions' },
                      h('button', {
                        type: 'button', className: 'dsh-skin-btn is-primary', onClick: saveCustomSkin,
                        disabled: state.customSkins.length >= MAX_CUSTOM_SKINS
                      }, t('skin.save')),
                      state.customSkins.length >= MAX_CUSTOM_SKINS
                        ? h('span', { className: 'dsh-skin-hint' }, t('skin.limit'))
                        : null
                    )
                  )
                  : null
              )
            ),

            h('section', { className: 'dsh-skin-section', key: 'wallpaper' },
              h('div', { className: 'dsh-skin-section-head' },
                h('h2', { className: 'dsh-skin-h2' }, t('section.wallpaper')),
                h('div', { className: 'dsh-skin-section-actions' },
                  h('span', { className: 'dsh-skin-hint' }, activeWallpaper.name),
                  h('span', { className: 'dsh-skin-hint' },
                    String(state.customWallpapers.length)),
                  state.customWallpapers.length
                    ? h('button', {
                      type: 'button', className: 'dsh-skin-btn', onClick: clearCustomWallpapers,
                      disabled: Boolean(state.importing)
                    }, t('wallpaper.clear'))
                    : null
                )
              ),
              h('p', { className: 'dsh-skin-hint' }, t('section.wallpaper.desc')),
              h('p', { className: 'dsh-skin-hint' }, t('wallpaper.addHint')),
              state.importing
                ? h('p', { className: 'dsh-skin-progress' }, importingLabel(state.importing))
                : null,
              h('div', { className: 'dsh-skin-wall-tools' },
                h(WallpaperFilters, {
                  active: state.wallpaperFilter,
                  onChange: (id) => store.set({ wallpaperFilter: id })
                }),
                h(WallpaperPager, {
                  page: pager.page,
                  pageCount: pager.pageCount,
                  go: pager.go
                })
              ),
              h(WallpaperSelectionBar, {
                count: selection.selectedIds.length,
                allSelected: selection.allSelected,
                selectableCount: selection.selectableCount,
                busy: Boolean(state.importing),
                onSelectAll: selection.selectAll,
                onDelete: deleteSelectedWallpapers,
                onCancel: selection.clearSelection
              }),
              pager.pageCount > 1 && !selection.selecting
                ? h('p', { className: 'dsh-skin-hint' }, t('wallpaper.swipeHint'))
                : null,
              h(WallpaperStrip, {
                cards: pageCards,
                total: filtered.length,
                page: pager.page,
                pageCount: pager.pageCount,
                filter: state.wallpaperFilter,
                go: pager.go,
                quick: false,
                selecting: selection.selecting,
                renderCard: renderWallpaperCard
              }),
              h('div', { className: 'dsh-skin-row' },
                h('span', { className: 'dsh-skin-hint' }, t('wallpaper.url')),
                h('input', {
                  className: 'dsh-skin-input', type: 'url', placeholder: t('wallpaper.urlPlaceholder'),
                  value: urlValue, 'aria-label': t('wallpaper.url'),
                  onChange: (event) => setUrlValue(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addUrlWallpaper();
                    }
                  }
                }),
                h('button', {
                  type: 'button', className: 'dsh-skin-btn', onClick: addUrlWallpaper,
                  disabled: state.customWallpapers.length >= MAX_CUSTOM_WALLPAPERS
                }, t('wallpaper.addUrl'))
              )
            ),

            h(VideoSection, { key: 'video' }),

            h(ModeSection, { key: 'modes' }),

            h(VaultSection, { key: 'vault' }),

            h('section', { className: 'dsh-skin-section', key: 'options' },
              h('h2', { className: 'dsh-skin-h2' }, t('section.options')),
              h('div', { className: 'dsh-skin-options' },
                h('div', { className: 'dsh-skin-option' },
                  h('div', { className: 'dsh-skin-option-text' },
                    h('span', { className: 'dsh-skin-option-title' }, t('option.dim')),
                    h('span', { className: 'dsh-skin-option-desc' }, t('option.dim.desc'))
                  ),
                  h('div', { className: 'dsh-skin-slider' },
                    h('input', {
                      className: 'dsh-skin-range', type: 'range', min: 0, max: MAX_DIM, step: 0.02,
                      value: state.dim, 'aria-label': t('option.dim'),
                      onChange: (event) => store.set({ dim: Number(event.target.value) })
                    }),
                    h('span', { className: 'dsh-skin-value' }, Math.round(state.dim * 100) + '%')
                  )
                ),
                h('div', { className: 'dsh-skin-option' },
                  h('div', { className: 'dsh-skin-option-text' },
                    h('span', { className: 'dsh-skin-option-title' }, t('option.glass')),
                    h('span', { className: 'dsh-skin-option-desc' }, t('option.glass.desc'))
                  ),
                  h('button', {
                    type: 'button', className: 'dsh-skin-switch', role: 'switch',
                    'aria-checked': state.glass ? 'true' : 'false',
                    'aria-label': t('option.glass'),
                    onClick: () => store.set({ glass: !state.glass })
                  })
                )
              )
            ),

            h('div', { className: 'dsh-skin-reset', key: 'reset' },
              h('button', { type: 'button', className: 'dsh-skin-btn', onClick: resetAll }, t('reset'))
            )
          );
        }

        // ---------- sidebar quick action ----------

        function QuickAction() {
          const state = useStore(store);
          useLocale();
          return h('button', {
            type: 'button',
            className: 'dsh-skin-action',
            title: t('quick.label'),
            'aria-label': t('quick.label'),
            'aria-expanded': state.quickOpen ? 'true' : 'false',
            onClick: () => store.set({ quickOpen: !state.quickOpen }, { persist: false })
          }, h(IconPalette, { size: 18 }));
        }

        function QuickPanel() {
          const state = useStore(store);
          useLocale();
          const panelRef = useRef(null);

          useEffect(() => {
            const node = panelRef.current;
            if (node && typeof node.focus === 'function') node.focus();
          }, []);

          useEffect(() => {
            const onKeyDown = (event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                store.set({ quickOpen: false }, { persist: false });
              }
            };
            document.addEventListener('keydown', onKeyDown, true);
            return () => document.removeEventListener('keydown', onKeyDown, true);
          }, []);

          const close = () => store.set({ quickOpen: false }, { persist: false });
          const shuffle = () => {
            const wallpaperPool = WALLPAPER_PRESETS.map((preset) => preset.id).concat(state.customWallpapers.map((item) => item.id));
            const skinPool = SKIN_PRESETS.map((preset) => preset.id).concat(state.customSkins.map((item) => item.id));
            const choose = (ids, current) => {
              if (!ids.length) return current;
              const pool = ids.length > 1 ? ids.filter((id) => id !== current) : ids;
              return pool[Math.floor(Math.random() * pool.length)];
            };
            const wallpaperId = choose(wallpaperPool, state.wallpaperId);
            store.set({ wallpaperId, skinId: choose(skinPool, state.skinId) });
            if (wallpaperId !== 'none' && !isPresetWallpaper(wallpaperId)) ensureFullUrl(wallpaperId);
          };

          const catalog = wallpaperCatalog(state);
          const filtered = filterWallpapers(catalog, state);
          const pager = useWallpaperPager(filtered.length, state.wallpaperFilter);
          const pageCards = filtered.slice(
            pager.page * WALLPAPERS_PER_PAGE,
            (pager.page + 1) * WALLPAPERS_PER_PAGE
          );
          const selection = useWallpaperSelection(filtered, state.wallpaperFilter);

          const deleteSelectedWallpapers = () => {
            if (!selection.selectedIds.length || state.importing) return;
            if (selection.selectedIds.length > 1 && typeof window.confirm === 'function') {
              const confirmed = window.confirm(t('wallpaper.deleteManyConfirm'));
              if (!confirmed) return;
            }
            deleteCustomWallpapers(selection.selectedIds).then(() => selection.clearSelection());
          };

          const handleWallpaperClick = (card, event) => {
            if (selection.selecting) {
              if (card.custom) selection.toggleSelection(card.id, event);
              return;
            }
            if (event && event.shiftKey && card.custom) {
              selection.toggleSelection(card.id, event);
              return;
            }
            selectWallpaper(card.id);
          };

          const renderWallpaperMini = (card) => {
            const active = state.wallpaperId === card.id;
            const favorite = state.favorites.indexOf(card.id) >= 0;
            const selected = selection.selectedSet.has(card.id);
            return h('div', { className: 'dsh-skin-wall-cell', key: card.id },
              h('button', {
                type: 'button',
                className: 'dsh-skin-wall-mini'
                  + (card.image ? '' : ' is-none')
                  + (active ? ' is-active' : '')
                  + (selected ? ' is-selected' : ''),
                style: card.image ? { backgroundImage: card.thumb || card.image } : null,
                title: card.name, 'aria-label': card.name, 'aria-pressed': active,
                onClick: (event) => handleWallpaperClick(card, event)
              }, active ? h('span', { className: 'dsh-skin-badge' }, h(IconCheck, { size: 10 })) : null),
              card.custom
                ? h('button', {
                  type: 'button',
                  className: 'dsh-skin-select' + (selected ? ' is-selected' : ''),
                  title: t(selected ? 'wallpaper.deselect' : 'wallpaper.select'),
                  'aria-label': t(selected ? 'wallpaper.deselect' : 'wallpaper.select'),
                  'aria-pressed': selected,
                  onClick: (event) => { event.stopPropagation(); selection.toggleSelection(card.id, event); }
                }, selected ? h(IconCheck, { size: 10 }) : null)
                : null,
              card.id !== 'none'
                ? h('button', {
                  type: 'button',
                  className: 'dsh-skin-fav' + (favorite ? ' is-on' : ''),
                  title: t(favorite ? 'wallpaper.unfavorite' : 'wallpaper.favorite'),
                  'aria-label': t(favorite ? 'wallpaper.unfavorite' : 'wallpaper.favorite'),
                  'aria-pressed': favorite,
                  onClick: (event) => { event.stopPropagation(); toggleFavorite(card.id); }
                }, h(IconStar, { filled: favorite, size: 11 }))
                : null,
              card.custom
                ? h('button', {
                  type: 'button', className: 'dsh-skin-photo-del', title: t('wallpaper.delete'),
                  'aria-label': t('wallpaper.delete'),
                  disabled: Boolean(state.importing),
                  onClick: (event) => { event.stopPropagation(); deleteCustomWallpaper(card.id); }
                }, h(IconTrash, { size: 10 }))
                : null
            );
          };

          const skins = [{ id: 'default', name: t('skin.default'), color: '#9AA0A6' }]
            .concat(SKIN_PRESETS.map((preset) => ({
              id: preset.id, name: t(preset.nameKey), color: deriveSkin(preset).light.brand
            })))
            .concat(state.customSkins.map((item) => ({
              id: item.id, name: item.name, color: deriveSkin(item).light.brand
            })));

          return h(React.Fragment, null,
            h('div', { className: 'dsh-skin-backdrop', key: 'backdrop', onClick: close, 'aria-hidden': 'true' }),
            h('div', {
              className: 'dsh-skin-quick', key: 'panel', ref: panelRef, role: 'dialog',
              'aria-label': t('quick.title'), tabIndex: -1
            },
              h('style', { key: 'styles' }, STYLE_CSS),
              h('div', { className: 'dsh-skin-quick-head' },
                h('span', { className: 'dsh-skin-quick-title' }, t('quick.title')),
                h('div', { className: 'dsh-skin-quick-actions' },
                  h('button', { type: 'button', className: 'dsh-skin-btn', onClick: shuffle, title: t('quick.random') },
                    h(IconShuffle, { size: 14 }), t('quick.random')),
                  h('button', {
                    type: 'button', className: 'dsh-skin-quick-close', 'aria-label': t('quick.close'),
                    title: t('quick.close'), onClick: close
                  }, h(IconClose, { size: 14 }))
                )
              ),
              state.notice
                ? h('div', { className: 'dsh-skin-notice', role: 'status', key: 'notice' },
                  h('span', null, noticeText(state.notice, t)),
                  h('button', {
                    type: 'button', className: 'dsh-skin-notice-x', 'aria-label': t('quick.close'),
                    onClick: () => store.notify(null)
                  }, '×')
                )
                : null,
              h('div', { className: 'dsh-skin-quick-section' },
                h('div', { className: 'dsh-skin-quick-section-head' },
                  h('span', { className: 'dsh-skin-quick-label' }, t('quick.wallpaper')),
                  h(WallpaperPager, {
                    page: pager.page,
                    pageCount: pager.pageCount,
                    go: pager.go
                  })
                ),
                h(WallpaperFilters, {
                  active: state.wallpaperFilter,
                  onChange: (id) => store.set({ wallpaperFilter: id })
                }),
                h(WallpaperSelectionBar, {
                  count: selection.selectedIds.length,
                  allSelected: selection.allSelected,
                  selectableCount: selection.selectableCount,
                  busy: Boolean(state.importing),
                  quick: true,
                  onSelectAll: selection.selectAll,
                  onDelete: deleteSelectedWallpapers,
                  onCancel: selection.clearSelection
                }),
                pager.pageCount > 1 && !selection.selecting
                  ? h('p', { className: 'dsh-skin-hint dsh-skin-swipe-hint' }, t('wallpaper.swipeShort'))
                  : null,
                h(WallpaperStrip, {
                  cards: pageCards,
                  total: filtered.length,
                  page: pager.page,
                  pageCount: pager.pageCount,
                  filter: state.wallpaperFilter,
                  go: pager.go,
                  quick: true,
                  selecting: selection.selecting,
                  renderCard: renderWallpaperMini
                })
              ),
              h('div', { className: 'dsh-skin-quick-section' },
                h('div', { className: 'dsh-skin-quick-section-head' },
                  h('span', { className: 'dsh-skin-quick-label' }, t('quick.skin')),
                  h(ThemeModeControl, { key: 'quick-theme-mode', compact: true })
                ),
                h('div', { className: 'dsh-skin-dots' }, skins.map((card) => {
                  const active = state.skinId === card.id;
                  return h('button', {
                    type: 'button', key: card.id,
                    className: 'dsh-skin-dot' + (active ? ' is-active' : ''),
                    style: { backgroundColor: card.color },
                    title: card.name, 'aria-label': card.name, 'aria-pressed': active,
                    onClick: () => store.set({ skinId: card.id })
                  });
                }))
              ),
              h('div', { className: 'dsh-skin-quick-section' },
                h('label', { className: 'dsh-skin-quick-row' },
                  h('span', null, t('option.dim')),
                  h('input', {
                    type: 'range', min: 0, max: MAX_DIM, step: 0.02, value: state.dim,
                    'aria-label': t('option.dim'),
                    onChange: (event) => store.set({ dim: Number(event.target.value) })
                  }),
                  h('span', { className: 'dsh-skin-value' }, Math.round(state.dim * 100) + '%')
                )
              ),
              h('div', { className: 'dsh-skin-quick-section' },
                h('span', { className: 'dsh-skin-quick-label' }, t('section.video')),
                h(QuickVideoSection, { key: 'quick-video' })
              ),
              h('div', { className: 'dsh-skin-quick-foot' }, t('quick.hint'))
            )
          );
        }

        // ---------- overlay: wallpaper canvas + quick panel ----------

        function VideoBackground() {
          const state = useStore(store);
          const scheme = useScheme();
          const video = resolveVideo(state);
          const videoRef = useRef(null);
          const audioRef = useRef(null);
          const [failed, setFailed] = useState(false);
          const [sidecarBroken, setSidecarBroken] = useState(false);
          // True while the element is muted only because autoplay-with-sound was
          // refused. Cleared by the first gesture, which turns the sound back on.
          const autoMutedRef = useRef(false);
          // A sidecar only exists for audio codecs Chromium cannot decode. If its
          // URL is unusable (or the element errors out) we must NOT keep the
          // <video> muted — that is the classic "picture plays, no sound" state.
          const sidecarUrl = usableAudioUrl(video && video.audioUrl);
          const hasSidecar = Boolean(video && sidecarUrl && !sidecarBroken);

          useEffect(() => {
            setFailed(false);
            setSidecarBroken(false);
          }, [video && video.source]);

          useEffect(() => {
            if (video && video.sourcePath && !video.audioUrl) {
              prepareVideoAudio(video);
            }
          }, [video && video.id, video && video.sourcePath, video && video.audioUrl]);

          useEffect(() => {
            if (video && video.sourcePath && !video.proxyUrl) {
              prepareVideoProxy(video);
            }
          }, [video && video.id, video && video.sourcePath, video && video.proxyUrl]);

          // SINGLE SOURCE OF TRUTH for sound: the <video> element is audible
          // unless a healthy sidecar exists. Never decide this from a codec
          // table, from "the host said supported", or from a persisted flag --
          // that guess is what makes "picture plays, no sound" come back.
          useEffect(() => {
            const node = videoRef.current;
            videoElementRef.current = node || null;
            if (!node) return;
            const audio = audioRef.current;
            const muted = state.videoMuted === true;
            node.muted = hasSidecar ? true : muted;
            node.loop = state.videoLoop;
            try { node.volume = state.videoVolume; } catch (error) { /* ignore */ }
            if (audio) {
              audio.muted = muted;
              audio.loop = state.videoLoop;
              try { audio.volume = state.videoVolume; } catch (error) { /* ignore */ }
            }
          }, [state.videoMuted, state.videoLoop, state.videoVolume, hasSidecar, video && video.source]);

          useEffect(() => {
            const node = videoRef.current;
            if (!node) return undefined;
            // Autoplay policy: a muted element always starts, one with sound can
            // be refused outright. A refusal used to leave a frozen first frame,
            // which reads as "the video will not play". Fall back to muted
            // playback so the picture moves, then restore the audio on the first
            // real gesture (see retry below).
            const start = () => {
              const promise = node.play();
              if (promise && typeof promise.catch === 'function') {
                promise.catch((error) => {
                  if (!error || error.name === 'AbortError') return;
                  console.warn('[skin-studio] video play failed', error.name, error.message);
                  recordDebug('video:play-failed', {
                    name: error.name,
                    src: String((node.currentSrc || node.src || video.source) || '').slice(-90),
                    ready: node.readyState,
                    network: node.networkState
                  });
                  if (error.name !== 'NotAllowedError') return;
                  autoMutedRef.current = true;
                  try { node.muted = true; } catch (muteError) { /* ignore */ }
                  const again = node.play();
                  if (again && typeof again.catch === 'function') again.catch(() => {});
                  store.notify('videoAutoplayBlocked');
                });
              }
            };
            // Autoplay WITH SOUND stays blocked until the page has a gesture.
            // Retry on every cheap gesture instead of leaving a silently paused
            // element that still looks "playing" in the UI -- that reads as
            // "the video has no sound" even though nothing is muted.
            const retry = () => {
              const current = store.get();
              if (!current.videoPlaying) return;
              // The fallback above muted the element only to satisfy autoplay.
              // The first gesture is the licence to make sound again.
              if (autoMutedRef.current && !current.videoMuted) {
                const live = resolveVideo(current);
                if (!usableAudioUrl(live && live.audioUrl)) {
                  autoMutedRef.current = false;
                  try { node.muted = false; } catch (error) { /* ignore */ }
                  try { node.volume = current.videoVolume; } catch (error) { /* ignore */ }
                }
              }
              if (!node.paused) return;
              start();
            };
            if (state.videoPlaying) start();
            else { try { node.pause(); } catch (error) { /* ignore */ } }
            if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
              document.addEventListener('pointerdown', retry, true);
              document.addEventListener('keydown', retry, true);
              document.addEventListener('visibilitychange', retry);
            }
            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
              window.addEventListener('focus', retry);
            }
            return () => {
              if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
                document.removeEventListener('pointerdown', retry, true);
                document.removeEventListener('keydown', retry, true);
                document.removeEventListener('visibilitychange', retry);
              }
              if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
                window.removeEventListener('focus', retry);
              }
            };
          }, [state.videoPlaying, video && video.source]);

          useEffect(() => {
            const node = videoRef.current;
            const audio = audioRef.current;
            if (!node || !audio || !hasSidecar) return undefined;
            const sync = () => {
              if (!Number.isFinite(node.currentTime)) return;
              if (Math.abs(audio.currentTime - node.currentTime) > 0.28) {
                try { audio.currentTime = node.currentTime; } catch (error) { /* ignore */ }
              }
            };
            const playAudio = () => {
              const promise = audio.play();
              if (promise && typeof promise.catch === 'function') {
                promise.catch((error) => {
                  if (error && error.name !== 'AbortError') {
                    console.warn('[skin-studio] sidecar audio play failed', error.name, error.message);
                  }
                });
              }
            };
            const pauseAudio = () => { try { audio.pause(); } catch (error) { /* ignore */ } };
            audio.muted = state.videoMuted;
            try { audio.volume = state.videoVolume; } catch (error) { /* ignore */ }
            audio.loop = state.videoLoop;
            sync();
            if (state.videoPlaying && !node.paused) playAudio();
            node.addEventListener('play', playAudio);
            node.addEventListener('pause', pauseAudio);
            node.addEventListener('seeking', sync);
            const resumeAfterInterruption = () => {
              if (typeof document !== 'undefined' && document.hidden) return;
              if (state.videoPlaying && !node.paused && audio.paused) playAudio();
            };
            const onAudioPause = () => {
              setTimeout(resumeAfterInterruption, 700);
            };
            audio.addEventListener('pause', onAudioPause);
            if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
              document.addEventListener('visibilitychange', resumeAfterInterruption);
            }
            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
              window.addEventListener('focus', resumeAfterInterruption);
            }
            const unlock = () => { if (!node.paused) playAudio(); };
            const unlockPersistent = () => {
              if (state.videoPlaying && !node.paused && audio.paused) playAudio();
            };
            if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
              document.addEventListener('pointerdown', unlockPersistent, true);
              document.addEventListener('keydown', unlockPersistent, true);
              document.addEventListener('visibilitychange', unlockPersistent);
            }
            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
              window.addEventListener('focus', unlockPersistent);
            }
            const timer = setInterval(sync, 400);
            return () => {
              clearInterval(timer);
              node.removeEventListener('play', playAudio);
              node.removeEventListener('pause', pauseAudio);
              node.removeEventListener('seeking', sync);
              audio.removeEventListener('pause', onAudioPause);
              if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
                window.removeEventListener('focus', unlockPersistent);
              }
              if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
                document.removeEventListener('visibilitychange', resumeAfterInterruption);
              }
              if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
                window.removeEventListener('focus', resumeAfterInterruption);
              }
              if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
                document.removeEventListener('pointerdown', unlockPersistent, true);
                document.removeEventListener('keydown', unlockPersistent, true);
                document.removeEventListener('visibilitychange', unlockPersistent);
              }
              pauseAudio();
            };
          }, [hasSidecar, video && video.source, state.videoPlaying, state.videoMuted, state.videoLoop, state.videoVolume]);

          if (!video || !video.source) return null;
          // If the video failed to decode/load, do NOT keep painting an opaque
          // black layer over the whole app — that made the UI look permanently
          // dark and hid the light theme. Fall back to the normal (opaque)
          // theme by rendering nothing; the video stays selected so the user
          // can fix it, but the screen returns to their light/dark theme.
          if (failed) return null;
          const veilAlpha = clamp(0.18 + (Number(state.dim) || 0) * 0.5, 0.12, 0.72);
          const veilColor = 'rgba(0,0,0,' + veilAlpha.toFixed(2) + ')';
          const layer = h('div', {
            className: 'dsh-skin-video-layer',
            key: 'video-layer',
            'aria-hidden': 'true',
            style: { '--dsh-skin-video-veil': veilColor }
          },
            h('video', {
              ref: videoRef,
              className: 'dsh-skin-video',
              src: mediaPath(video.source),
              playsInline: true,
              muted: state.videoMuted,
              loop: state.videoLoop,
              preload: 'auto',
              tabIndex: -1,
              'data-failed': failed ? 'true' : 'false',
              onError: () => {
                const node = videoRef.current;
                const mediaError = node && node.error ? node.error : null;
                recordDebug('video:error', {
                  src: String(video.source || '').slice(-90),
                  resolved: String(node && node.currentSrc || '').slice(0, 120),
                  origin: String((typeof window !== 'undefined' && window.__skinMediaOrigin) || ''),
                  code: mediaError ? mediaError.code : 0,
                  message: mediaError ? String(mediaError.message || '').slice(0, 120) : '',
                  network: node ? node.networkState : -1,
                  ready: node ? node.readyState : -1
                });
                console.warn('[skin-studio] video could not be loaded', video.source);
                setFailed(true);
                store.notify('videoPlaybackError');
              },
              onLoadedMetadata: () => {
                const node = videoRef.current;
                if (!node || !resumeAt) return;
                const target = resumeAt;
                resumeAt = 0;
                if (Number.isFinite(target) && target > 0.5) {
                  try { node.currentTime = target; } catch (error) { /* ignore */ }
                }
              },
              onLoadedData: () => { if (failed) setFailed(false); }
            }),
            hasSidecar ? h('audio', {
              ref: audioRef,
              className: 'dsh-skin-video-audio',
              src: mediaPath(sidecarUrl),
              preload: 'auto',
              loop: state.videoLoop,
              muted: state.videoMuted,
              'aria-hidden': 'true',
              onError: () => {
                console.warn('[skin-studio] sidecar audio could not be loaded', sidecarUrl);
                // Drop back to the element's own audio track instead of staying
                // silent, then forget the stale URL so the next effect run asks
                // the host again (the cache may have been cleaned).
                setSidecarBroken(true);
                if (videoRef.current) videoRef.current.muted = state.videoMuted;
                // Retry the preparation exactly once per record: a purged
                // cache recovers, while a genuinely broken track cannot spin
                // the prepare/error loop forever.
                const attempts = (audioRetry.get(video.id) || 0) + 1;
                audioRetry.set(video.id, attempts);
                if (video.audioUrl && attempts <= 2) {
                  mergeVideoItem(video.id, { audioUrl: null });
                  store.set({}, { persist: true });
                }
                store.notify('videoAudioUnsupported');
              }
            }) : null,
            h('div', { className: 'dsh-skin-video-veil' })
          );
          // Portal to <body> so the fixed video layer paints behind the app
          // root (negative z-index), not inside the shell.overlay stacking
          // context which sits above every column.
          if (createPortal && typeof document !== 'undefined' && document.body) {
            return createPortal(layer, document.body);
          }
          return layer;
        }

        function VideoDeleteButton(props) {
          const state = useStore(store);
          useLocale();
          return h('button', {
            type: 'button', className: 'dsh-skin-video-del',
            title: t('video.delete'), 'aria-label': t('video.delete'),
            disabled: Boolean(state.videoImporting),
            onClick: (event) => { event.stopPropagation(); deleteCustomVideo(props.id); }
          }, h(IconTrash, { size: 12 }));
        }

        function VideoAddTile() {
          const state = useStore(store);
          useLocale();
          const fileRef = useRef(null);
          const folderRef = useRef(null);
          const [dragging, setDragging] = useState(false);
          const importing = state.videoImporting;
          const atLimit = state.customVideos.length >= MAX_CUSTOM_VIDEOS;
          // Only the limit blocks the button; a running import shows progress
          // but stays clickable so a stuck busy flag can never trap the user.
          const disabled = atLimit;
          const label = importing
            ? t('video.importing').replace('{done}', String(importing.done)).replace('{total}', String(importing.total))
            : t('video.addFiles');
          const title = atLimit ? t('video.limit') : t('video.addFiles');
          const folderTitle = atLimit ? t('video.limit') : t('video.addFolder');
          const notifyFailed = (error) => {
            console.error('[skin-studio] video import failed', error);
            store.notify('videoInvalid');
          };
          const onFiles = (event) => {
            const input = event.target;
            // FileList is live: copy it before clearing the input.
            const files = input.files ? Array.from(input.files) : [];
            input.value = '';
            if (files.length) importVideoFiles(files).catch(notifyFailed);
          };
          const openVideos = () => {
            if (disabled || store.get().videoImporting) return;
            pickAndImportVideos(fileRef).catch(notifyFailed);
          };
          const openFolder = () => {
            if (disabled) return;
            // Native folder dialog first: it yields real paths, so each video in
            // the folder can stream and get its audio probed. Browsers without
            // the host route fall back to <input webkitdirectory>.
            importVideoFolder().then((result) => {
              if (result === 'unavailable' && folderRef.current) folderRef.current.click();
            }).catch(notifyFailed);
          };
          const onDrop = (event) => {
            event.preventDefault();
            setDragging(false);
            if (disabled) return;
            filesFromDataTransfer(event.dataTransfer).then((files) => {
              if (files && files.length) return importVideoFiles(files);
              store.notify('videoInvalid');
              return undefined;
            }).catch(notifyFailed);
          };
          return h('div', {
            className: 'dsh-skin-video-item dsh-skin-video-add' + (dragging ? ' is-dragging' : ''),
            onDragOver: (event) => {
              event.preventDefault();
              if (!disabled) setDragging(true);
            },
            onDragLeave: (event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
            },
            onDrop
          },
            h('button', {
              type: 'button', className: 'dsh-skin-video-add-item', disabled, title, 'aria-label': title,
              onClick: openVideos
            },
              h(IconPlus, { size: 18 }),
              h('span', { className: 'dsh-skin-video-sub' }, label)
            ),
            h('button', {
              type: 'button', className: 'dsh-skin-add-folder', disabled,
              title: folderTitle, 'aria-label': folderTitle,
              onClick: openFolder
            }, h(IconFolderPlus, { size: 12 })),
            h('input', {
              ref: fileRef, type: 'file', accept: 'video/*', multiple: true,
              style: { display: 'none' }, onChange: onFiles
            }),
            h('input', {
              ref: folderRef, type: 'file', accept: 'video/*', multiple: true,
              webkitdirectory: '', directory: '',
              style: { display: 'none' }, onChange: onFiles
            })
          );
        }

        function VideoControls(props) {
          const state = useStore(store);
          useLocale();
          const compact = Boolean(props && props.compact);
          const hasVideos = state.customVideos.length > 0;
          const nothing = state.videoId === 'none' || !hasVideos;
          return h('div', { className: 'dsh-skin-video-controls' + (compact ? ' is-compact' : '') },
            nothing
              ? h('span', { className: 'dsh-skin-video-empty' }, t('video.empty'))
              : h(React.Fragment, null,
                h('button', {
                  type: 'button',
                  className: 'dsh-skin-video-toggle' + (state.videoPlaying ? ' is-on' : ''),
                  'aria-pressed': state.videoPlaying ? 'true' : 'false',
                  title: t(state.videoPlaying ? 'video.pause' : 'video.play'),
                  onClick: () => store.set({ videoPlaying: !state.videoPlaying })
                },
                  h(state.videoPlaying ? IconPause : IconPlay, { size: 13 }),
                  t(state.videoPlaying ? 'video.pause' : 'video.play')
                ),
                h('button', {
                  type: 'button',
                  className: 'dsh-skin-video-toggle' + (state.videoMuted ? '' : ' is-on'),
                  'aria-pressed': state.videoMuted ? 'false' : 'true',
                  title: t(state.videoMuted ? 'video.unmute' : 'video.mute'),
                  onClick: () => store.set({ videoMuted: !state.videoMuted })
                },
                  h(IconVolume, { size: 13, muted: state.videoMuted }),
                  t(state.videoMuted ? 'video.unmute' : 'video.mute')
                ),
                h('button', {
                  type: 'button',
                  className: 'dsh-skin-video-toggle' + (state.videoLoop ? ' is-on' : ''),
                  'aria-pressed': state.videoLoop ? 'true' : 'false',
                  title: t('video.loop'),
                  onClick: () => store.set({ videoLoop: !state.videoLoop })
                }, t('video.loop')),
                h('div', { className: 'dsh-skin-video-ctl-row' },
                  h('span', { className: 'dsh-skin-hint' }, t('video.volume')),
                  h('input', {
                    type: 'range', min: 0, max: 1, step: 0.02, value: state.videoVolume,
                    'aria-label': t('video.volume'),
                    onChange: (event) => store.set({ videoVolume: Number(event.target.value), videoMuted: Number(event.target.value) === 0 })
                  }),
                  h('span', { className: 'dsh-skin-value' }, Math.round(state.videoVolume * 100) + '%')
                )
              ),
            hasVideos
              ? h('button', {
                type: 'button', className: 'dsh-skin-btn is-danger',
                disabled: Boolean(state.videoImporting),
                onClick: clearCustomVideos
              }, t('video.clear'))
              : null
          );
        }

        // Settings-line diagnostics: the console is not somewhere users should
        // have to go. This reads the same live media state as
        // window.__skinStudioDiag() once a second and prints one plain line.
        function VideoDiagLine() {
          const state = useStore(store);
          useLocale();
          const [info, setInfo] = useState(null);
          const activeId = state.videoId;
          useEffect(() => {
            let alive = true;
            const read = () => {
              if (!alive || typeof document === 'undefined') return;
              const video = document.querySelector('video.dsh-skin-video');
              const audio = document.querySelector('audio.dsh-skin-video-audio');
              const item = activeId && activeId !== 'none' ? findCustomVideo(activeId) : null;
              setInfo({
                path: Boolean(item && item.sourcePath),
                audio: Boolean(item && usableAudioUrl(item.audioUrl)),
                muted: video ? Boolean(video.muted) : null,
                video: video ? (video.paused ? String(Math.round(video.currentTime)) + 's paused' : String(Math.round(video.currentTime)) + 's playing') : 'none',
                sound: audio ? String(Math.round(audio.currentTime)) + 's / ' + (audio.paused ? 'paused' : 'playing') : (video && !video.muted ? 'from video' : 'none')
              });
            };
            read();
            const timer = setInterval(read, 1000);
            return () => { alive = false; clearInterval(timer); };
          }, [activeId]);
          if (!info) return null;
          const yes = t('common.yes');
          const no = t('common.no');
          const text = t('video.diag')
            .replace('{path}', info.path ? yes : no)
            .replace('{audio}', info.audio ? yes : no)
            .replace('{muted}', info.muted == null ? '—' : (info.muted ? yes : no))
            .replace('{video}', info.video)
            .replace('{sound}', info.sound);
          return h('div', { className: 'dsh-skin-diag' },
            h('span', { className: 'dsh-skin-hint' }, text),
            h('button', {
              type: 'button', className: 'dsh-skin-mini-btn',
              onClick: () => {
                try { navigator.clipboard.writeText('v' + PLUGIN_VERSION + ' · build ' + BUILD + ' · ' + text); } catch (error) { /* ignore */ }
              }
            }, t('video.diagCopy'))
          );
        }

        function ModeSection() {
          const state = useStore(store);
          useLocale();
          const [recording, setRecording] = useState(null);
          const [error, setError] = useState(null);

          useEffect(() => {
            if (!recording) return undefined;
            modeRecording.current = true;
            const onKey = (event) => {
              event.preventDefault();
              if (typeof event.stopPropagation === 'function') event.stopPropagation();
              if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
              if (event.key === 'Escape') { setRecording(null); setError(null); return; }
              const combo = comboFromEvent(event);
              if (!combo) { setError('mode.needModifier'); return; }
              const current = store.get();
              const other = recording === MODE_PURE ? current.modeKeys.normal : current.modeKeys.pure;
              if (combo && combo === other) { setError('mode.conflict'); return; }
              setRecording(null);
              setError(null);
              store.set({ modeKeys: Object.assign({}, current.modeKeys, { [recording]: combo }) });
            };
            window.addEventListener('keydown', onKey, true);
            return () => {
              modeRecording.current = false;
              window.removeEventListener('keydown', onKey, true);
            };
          }, [recording]);

          const keys = state.modeKeys;
          const lock = state.modeLock;
          const stateKey = lock === MODE_PURE ? 'mode.state.pure' : lock === MODE_NORMAL ? 'mode.state.normal' : 'mode.state.none';

          const row = (kind, labelKey, descKey) => h('div', {
            className: 'dsh-skin-key-row' + (recording === kind ? ' is-recording' : ''),
            key: kind
          },
            h('div', { className: 'dsh-skin-key-text' },
              h('span', { className: 'dsh-skin-option-title' }, t(labelKey)),
              h('span', { className: 'dsh-skin-option-desc' }, t(descKey))
            ),
            h('button', {
              type: 'button',
              className: 'dsh-skin-btn dsh-skin-key-btn',
              title: keys[kind] ? t('mode.clear') : t('mode.unset'),
              onClick: () => { setError(null); setRecording(recording === kind ? null : kind); }
            }, recording === kind ? t('mode.recording') : (keys[kind] ? comboLabel(keys[kind]) : t('mode.unset'))),
            keys[kind]
              ? h('button', {
                type: 'button', className: 'dsh-skin-key-clear',
                title: t('mode.clear'), 'aria-label': t('mode.clear'),
                onClick: () => store.set({ modeKeys: Object.assign({}, keys, { [kind]: '' }) })
              }, '\u00d7')
              : null
          );

          return h('section', { className: 'dsh-skin-section', key: 'modes' },
            h('h2', { className: 'dsh-skin-h2' }, t('section.modes')),
            h('p', { className: 'dsh-skin-hint' }, t('section.modes.desc')),
            h('div', { className: 'dsh-skin-keys' },
              row(MODE_PURE, 'mode.pure', 'mode.pure.desc'),
              row(MODE_NORMAL, 'mode.normal', 'mode.normal.desc')
            ),
            error ? h('p', { className: 'dsh-skin-hint dsh-skin-hint-warn' }, t(error)) : null,
            h('p', { className: 'dsh-skin-mode-state' }, t('mode.now') + ' ' + t(stateKey)),
            h('div', { className: 'dsh-skin-mode-actions' },
              h('button', { type: 'button', className: 'dsh-skin-btn', onClick: () => store.set({ modeLock: MODE_PURE }) }, t('mode.enterPure')),
              h('button', { type: 'button', className: 'dsh-skin-btn', onClick: () => store.set({ modeLock: MODE_NONE }) }, t('mode.exit'))
            ),
            // Opt-in only. Default off so a wallpaper can never decide on its own
            // that the interface should disappear while the user reads or types.
            h('div', { className: 'dsh-skin-key-row', key: 'auto-hide' },
              h('div', { className: 'dsh-skin-key-text' },
                h('span', { className: 'dsh-skin-option-title' }, t('mode.autoHide')),
                h('span', { className: 'dsh-skin-option-desc' }, t('mode.autoHide.desc'))
              ),
              h('button', {
                type: 'button',
                className: 'dsh-skin-btn',
                'aria-pressed': state.cinemaAutoHide === true ? 'true' : 'false',
                onClick: () => {
                  const next = state.cinemaAutoHide !== true;
                  recordDebug('cinema:toggle', { to: next });
                  store.set({ cinemaAutoHide: next });
                }
              }, state.cinemaAutoHide === true ? t('mode.on') : t('mode.off'))
            ),
            h('p', { className: 'dsh-skin-hint' }, t('mode.hint'))
          );
        }

        // Owns the lock -> DOM attribute and the two global hotkeys. Lives in a
        // component (not in apply) so it re-binds whenever the mapping changes.
        function ModeController() {
          const state = useStore(store);
          const lock = state.modeLock;
          const pureKey = state.modeKeys.pure;
          const normalKey = state.modeKeys.normal;

          useEffect(() => {
            if (typeof document === 'undefined' || !document.documentElement) return undefined;
            const root = document.documentElement;
            if (lock === MODE_PURE) root.setAttribute('data-dsh-skin-mode', 'pure');
            else root.removeAttribute('data-dsh-skin-mode');
            // Everything is hidden in pure mode, so a toast inside the React
            // tree would be invisible too. The exit reminder is appended to
            // <body> directly (the pure-mode rule whitelists it) and removes
            // itself, so entering the mode is never a silent black screen.
            let node = null;
            let timer = null;
            if (lock === MODE_PURE && document.body) {
              node = document.createElement('div');
              node.className = 'dsh-skin-pure-hint';
              node.textContent = t('mode.pureHint');
              document.body.appendChild(node);
              timer = setTimeout(() => { if (node && node.parentNode) node.parentNode.removeChild(node); node = null; }, 3200);
            }
            return () => {
              if (timer) clearTimeout(timer);
              if (node && node.parentNode) node.parentNode.removeChild(node);
              try { root.removeAttribute('data-dsh-skin-mode'); } catch (error) { /* ignore */ }
            };
          }, [lock]);

          useEffect(() => {
            if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
            let lastEsc = 0;
            const onKey = (event) => {
              if (modeRecording.current) return;
              // Emergency exit: pure mode hides every control, so Esc twice has
              // to work even when the mapped shortcut does not.
              if (lock === MODE_PURE && event.key === 'Escape') {
                const now = Date.now();
                if (now - lastEsc < 900) {
                  lastEsc = 0;
                  store.set({ modeLock: MODE_NONE });
                  store.notify('modeExit');
                } else {
                  lastEsc = now;
                }
                return;
              }
              const combo = comboFromEvent(event);
              if (!combo) return;
              const wanted = pureKey && combo === pureKey ? MODE_PURE : normalKey && combo === normalKey ? MODE_NORMAL : null;
              if (!wanted) return;
              event.preventDefault();
              if (typeof event.stopPropagation === 'function') event.stopPropagation();
              // Typing wins over the hotkey: if the caret sits in the composer,
              // pressing the pure shortcut must not black out the screen the user
              // is reading. Leaving pure mode is still allowed, so this can never
              // trap anyone.
              if (wanted === MODE_PURE && lock !== MODE_PURE && caretInTextField(event)) {
                recordDebug('pure:blocked-typing', { target: String(event.target && event.target.tagName || '') });
                store.notify('modeTyping');
                return;
              }
              if (wanted === MODE_PURE) {
                if (lock === MODE_NORMAL) { store.notify('modeBlockedNormal'); return; }
                const next = lock === MODE_PURE ? MODE_NONE : MODE_PURE;
                recordDebug('pure:set', { next });
                store.set({ modeLock: next });
                // Focus can be restored a tick after the keystroke (Lexical does
                // this). Re-check right after the switch and give the screen back
                // instead of leaving the user staring at an empty wallpaper.
                if (next === MODE_PURE) {
                  [0, 160, 600].forEach((delay) => {
                    setTimeout(() => {
                      if (store.get().modeLock !== MODE_PURE) return;
                      if (!isTextEntryFocused()) return;
                      recordDebug('pure:auto-exit', { delay });
                      store.set({ modeLock: MODE_NONE });
                      store.notify('modeTyping');
                    }, delay);
                  });
                }
                return;
              }
              if (lock === MODE_PURE) { store.notify('modeBlockedPure'); return; }
              store.set({ modeLock: lock === MODE_NORMAL ? MODE_NONE : MODE_NORMAL });
            };
            window.addEventListener('keydown', onKey, true);
            return () => window.removeEventListener('keydown', onKey, true);
          }, [lock, pureKey, normalKey]);

          return null;
        }

        function VideoGrid(props) {
          const state = useStore(store);
          useLocale();
          const selection = props.selection;
          const cards = state.customVideos.slice().reverse();
          return h('div', { className: 'dsh-skin-videos' + (selection && selection.selecting ? ' is-selecting' : '') },
            h(VideoAddTile, { key: 'video-add' }),
            state.videoId !== 'none'
              ? h('div', { className: 'dsh-skin-video-item', key: 'video-none' },
                h('button', {
                  type: 'button',
                  className: 'dsh-skin-video-card' + (state.videoId === 'none' ? ' is-active' : ''),
                  title: t('video.none'),
                  onClick: () => selectVideo('none')
                },
                  h('span', { className: 'dsh-skin-video-thumb', style: { background: 'var(--dsw-alias-bg-layer-1)' } }),
                  h('span', { className: 'dsh-skin-video-meta' },
                    h('span', { className: 'dsh-skin-video-name' }, t('video.none'))
                  )
                )
              )
              : null,
            cards.map((card) => {
              const active = state.videoId === card.id;
              return h('div', { className: 'dsh-skin-video-item', key: card.id },
                h('button', {
                  type: 'button',
                  className: 'dsh-skin-video-card' + (active ? ' is-active' : ''),
                  title: card.name,
                  'aria-pressed': active,
                  onClick: (event) => {
                    if (selection && selection.selecting) selection.toggleSelection(card.id, event);
                    else selectVideo(card.id);
                  }
                },
                  selection ? h('button', {
                    type: 'button', className: 'dsh-skin-select' + (selection.selectedSet.has(card.id) ? ' is-selected' : ''),
                    title: t(selection.selectedSet.has(card.id) ? 'wallpaper.deselect' : 'wallpaper.select'),
                    onClick: (event) => { event.stopPropagation(); selection.toggleSelection(card.id, event); }
                  }, selection.selectedSet.has(card.id) ? h(IconCheck, { size: 10 }) : null) : null,
                  h('span', { className: 'dsh-skin-video-thumb' },
                    card.fullUrl || card.url
                      ? h('video', { src: card.fullUrl || card.url, muted: true, playsInline: true, preload: 'metadata', tabIndex: -1 })
                      : null
                  ),
                  h('span', { className: 'dsh-skin-video-meta' },
                    h('span', { className: 'dsh-skin-video-name' }, card.name),
                    h('span', { className: 'dsh-skin-video-sub' }, formatBytes(card.size))
                  )
                ),
                h('button', {
                  type: 'button',
                  className: 'dsh-skin-video-fav' + ((state.videoFavorites || []).indexOf(card.id) >= 0 ? ' is-on' : ''),
                  title: t('wallpaper.favorite'),
                  onClick: (event) => { event.stopPropagation(); toggleVideoFavorite(card.id); }
                }, h(IconStar, { size: 13 })),
                card.sourcePath ? null : h('button', {
                  type: 'button',
                  className: 'dsh-skin-video-relink',
                  title: t('video.relink'),
                  onClick: (event) => { event.stopPropagation(); relinkVideo(card); }
                }, h(IconLink, { size: 12 })),
                h(VideoDeleteButton, { id: card.id }),
                active ? h('span', { className: 'dsh-skin-badge' }, h(IconCheck, { size: 10 })) : null
              );
            })
          );
        }

        function VideoSection() {
          const state = useStore(store);
          useLocale();
          const videoCards = state.customVideos.map((item) => Object.assign({}, item, { custom: true }));
          const selection = useWallpaperSelection(videoCards, 'videos');
          const deleteSelected = () => {
            if (!selection.selectedIds.length) return;
            if (selection.selectedIds.length > 1 && !window.confirm(t('video.deleteManyConfirm'))) return;
            deleteCustomVideos(selection.selectedIds.slice()).then(() => selection.clearSelection()).catch(() => {});
          };
          return h('section', { className: 'dsh-skin-section', key: 'video' },
            h('div', { className: 'dsh-skin-section-head' },
              h('h2', { className: 'dsh-skin-h2' }, t('section.video')),
              h('div', { className: 'dsh-skin-section-actions' },
                h('span', { className: 'dsh-skin-hint' }, String(state.customVideos.length))
              )
            ),
            h('p', { className: 'dsh-skin-hint' }, t('section.video.desc')),
            h('p', { className: 'dsh-skin-hint' }, t('video.addHint')),
            state.customVideos.some((item) => !item.sourcePath)
              ? h('p', { className: 'dsh-skin-hint dsh-skin-hint-warn' }, t('video.relinkHint'))
              : null,
            state.videoImporting
              ? h('p', { className: 'dsh-skin-progress' },
                t('video.importing').replace('{done}', String(state.videoImporting.done)).replace('{total}', String(state.videoImporting.total)))
              : null,
            h(VideoControls, { key: 'video-controls' }),
            h(WallpaperSelectionBar, {
              count: selection.selectedIds.length,
              allSelected: selection.allSelected,
              selectableCount: selection.selectableCount,
              busy: Boolean(state.videoImporting),
              onSelectAll: selection.selectAll,
              onDelete: deleteSelected,
              onCancel: selection.clearSelection
            }),
            h(VideoGrid, { key: 'video-grid', selection: selection })
          );
        }

        // Compact video block for the quick panel: an always-visible add tile,
        // thumbnails to switch, an off-option, and playback controls.
        function QuickVideoSection() {
          const state = useStore(store);
          useLocale();
          const hasVideos = state.customVideos.length > 0;
          const cards = state.customVideos.slice().reverse();
          return h(React.Fragment, null,
            h('div', { className: 'dsh-skin-quick-videos' },
              h(QuickVideoAddTile, { key: 'q-add' }),
              state.videoId !== 'none'
                ? h('button', {
                  type: 'button', key: 'q-none',
                  className: 'dsh-skin-quick-vthumb is-none' + (state.videoId === 'none' ? ' is-active' : ''),
                  title: t('video.none'),
                  onClick: () => selectVideo('none')
                }, h(IconClose, { size: 14 }))
                : null,
              cards.map((card) => {
                const active = state.videoId === card.id;
                const fav = (state.videoFavorites || []).indexOf(card.id) >= 0;
                return h('div', { className: 'dsh-skin-quick-vitem', key: card.id },
                  h('button', {
                    type: 'button',
                    className: 'dsh-skin-quick-vthumb' + (active ? ' is-active' : ''),
                    title: card.name, 'aria-pressed': active,
                    onClick: () => selectVideo(card.id)
                  },
                    card.fullUrl || card.url
                      ? h('video', { src: card.fullUrl || card.url, muted: true, playsInline: true, preload: 'metadata', tabIndex: -1 })
                      : h('span', { className: 'dsh-skin-quick-vph' }),
                    active ? h('span', { className: 'dsh-skin-quick-vcheck' }, h(IconCheck, { size: 10 })) : null
                  ),
                  h('button', {
                    type: 'button', className: 'dsh-skin-quick-vfav' + (fav ? ' is-on' : ''),
                    title: t('wallpaper.favorite'),
                    onClick: (event) => { event.stopPropagation(); toggleVideoFavorite(card.id); }
                  }, h(IconStar, { size: 11 })),
                  h('button', {
                    type: 'button', className: 'dsh-skin-quick-vdel',
                    title: t('video.delete'),
                    onClick: (event) => { event.stopPropagation(); deleteCustomVideo(card.id); }
                  }, h(IconTrash, { size: 11 }))
                );
              })
            ),
            hasVideos
              ? h(VideoControls, { compact: true })
              : h('span', { className: 'dsh-skin-video-empty' }, t('video.empty'))
          );
        }

        function QuickVideoAddTile() {
          const state = useStore(store);
          useLocale();
          const fileRef = useRef(null);
          const folderRef = useRef(null);
          const [dragging, setDragging] = useState(false);
          const importing = state.videoImporting;
          const atLimit = state.customVideos.length >= MAX_CUSTOM_VIDEOS;
          // Never hard-disable on storage flags — they can be stale and would
          // make the + silently unclickable. Only the limit blocks the button;
          // a running import shows busy but stays clickable (re-entry is
          // guarded in the handler) so a stuck state can never trap the user.
          const disabled = atLimit;
          const title = atLimit ? t('video.limit') : t('video.addFiles');
          const folderTitle = atLimit ? t('video.limit') : t('video.addFolder');
          const onFiles = (event) => {
            const input = event.target;
            const files = input.files ? Array.from(input.files) : [];
            input.value = '';
            if (files.length) {
              importVideoFiles(files).catch((error) => {
                console.error('[skin-studio] video import failed', error);
                store.notify('videoInvalid');
              });
            }
          };
          // The host can enumerate a whole directory (recursive, sorted by
          // name). Browsers without that route fall back to <input
          // webkitdirectory>, which the import path also understands.
          const pickFolder = () => {
            if (disabled || store.get().videoImporting) return;
            importVideoFolder().then((result) => {
              if (result === 'unavailable' && folderRef.current) folderRef.current.click();
            }).catch((error) => {
              console.error('[skin-studio] folder import failed', error);
              store.notify('videoInvalid');
            });
          };
          const onDrop = (event) => {
            event.preventDefault();
            setDragging(false);
            if (disabled) return;
            filesFromDataTransfer(event.dataTransfer).then((files) => {
              if (files && files.length) return importVideoFiles(files);
              store.notify('videoInvalid');
              return undefined;
            }).catch((error) => {
              console.error('[skin-studio] video drop failed', error);
              store.notify('videoInvalid');
            });
          };
          return h('div', {
            className: 'dsh-skin-quick-vadd-wrap' + (dragging ? ' is-dragging' : ''),
            onDragOver: (event) => { event.preventDefault(); if (!disabled) setDragging(true); },
            onDragLeave: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); },
            onDrop
          },
            h('button', {
              type: 'button', className: 'dsh-skin-quick-vadd' + (importing ? ' is-busy' : ''),
              disabled, title, 'aria-label': title,
              onClick: () => { if (!disabled && !store.get().videoImporting) pickAndImportVideos(fileRef).catch((error) => { console.error('[skin-studio] video import failed', error); store.notify('videoInvalid'); }); }
            }, h(IconPlus, { size: 18 })),
            h('button', {
              type: 'button', className: 'dsh-skin-quick-vadd-folder',
              disabled, title: folderTitle, 'aria-label': folderTitle,
              onClick: pickFolder
            }, h(IconFolderPlus, { size: 10 })),
            h('input', {
              ref: fileRef, type: 'file', accept: 'video/*', multiple: true,
              style: { display: 'none' }, onChange: onFiles
            }),
            h('input', {
              ref: folderRef, type: 'file', multiple: true,
              webkitdirectory: '', directory: '',
              style: { display: 'none' }, onChange: onFiles
            })
          );
        }

        // Bilibili-style control bar over the video backdrop: thin seek track
        // above a compact control row. Auto-hides unless the pointer is near
        // the bottom edge; Ctrl+wheel changes volume and Ctrl+drag scrubs.
        function VideoPlayerBar() {
          const state = useStore(store);
          useLocale();
          const scheme = useScheme();
          const video = resolveVideo(state);
          const active = Boolean(video && video.source);
          const [progress, setProgress] = useState(0);
          const [duration, setDuration] = useState(0);
          const [dragging, setDragging] = useState(false);
          const [visible, setVisible] = useState(true);
          const [hud, setHud] = useState('');
          const seekRef = useRef(null);
          const seekTrackRef = useRef(null);
          const draggingRef = useRef(false);
          const hoverRef = useRef(false);
          const seekGuardRef = useRef(0);
          const pendingSeekRef = useRef(null);
          const dragRef = useRef(null);
          const ctrlHeldRef = useRef(false);
          const hideTimer = useRef(null);
          const hudTimer = useRef(null);
          const [barBottom, setBarBottom] = useState(300);

          // A seek is asynchronous: currentTime keeps reporting the OLD value
          // for a while after we set it. Remember the target and ignore the
          // rAF value until the element actually gets there (or times out),
          // otherwise the thumb visibly snaps back and dragging feels broken.
          const markSeek = (seconds) => {
            const value = Number(seconds);
            pendingSeekRef.current = Number.isFinite(value) ? { time: value, at: Date.now() } : null;
            seekGuardRef.current = Date.now();
          };

          useEffect(() => {
            if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
            const end = () => { draggingRef.current = false; setDragging(false); };
            window.addEventListener('pointerup', end, true);
            window.addEventListener('pointercancel', end, true);
            window.addEventListener('blur', end, true);
            return () => {
              window.removeEventListener('pointerup', end, true);
              window.removeEventListener('pointercancel', end, true);
              window.removeEventListener('blur', end, true);
            };
          }, []);

          useEffect(() => {
            if (!active || typeof document === 'undefined') return undefined;
            const measure = () => {
              const height = Number(window.innerHeight) || 800;
              const card = typeof document.querySelector === 'function' ? document.querySelector('[data-composer-card]') : null;
              const rect = card && typeof card.getBoundingClientRect === 'function' ? card.getBoundingClientRect() : null;
              if (rect && rect.top > 0 && rect.height > 0) {
                setBarBottom(Math.max(28, Math.round(height - rect.top + 18)));
              } else {
                setBarBottom(300);
              }
            };
            measure();
            if (typeof window.addEventListener === 'function') window.addEventListener('resize', measure);
            let observer = null;
            const cardEl = typeof document.querySelector === 'function' ? document.querySelector('[data-composer-card]') : null;
            if (cardEl && typeof ResizeObserver === 'function') {
              observer = new ResizeObserver(measure);
              observer.observe(cardEl);
            }
            return () => {
              if (observer) observer.disconnect();
              if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', measure);
            };
          }, [active]);

          useEffect(() => {
            if (!active) return undefined;
            const rafFn = typeof requestAnimationFrame === 'function'
              ? requestAnimationFrame
              : (cb) => setTimeout(() => cb(Date.now()), 16);
            const cafFn = typeof cancelAnimationFrame === 'function'
              ? cancelAnimationFrame
              : (id) => clearTimeout(id);
            let raf = null;
            const tick = () => {
              const node = videoElementRef.current;
              // Ignore the rAF value while the user drags, and briefly after a
              // seek: currentTime is still the OLD value until the seek lands,
              // which is what makes the thumb appear to "jump back".
              if (node) {
                const pending = pendingSeekRef.current;
                if (pending && (Math.abs(Number(node.currentTime) - pending.time) < 1.2 || Date.now() - pending.at > 4000)) {
                  pendingSeekRef.current = null;
                }
              }
              if (node && !dragging && !draggingRef.current && !pendingSeekRef.current && Date.now() - seekGuardRef.current > 260) {
                const d = Number.isFinite(node.duration) ? node.duration : 0;
                setDuration(d);
                setProgress(d > 0 ? node.currentTime / d : 0);
              }
              raf = rafFn(tick);
            };
            raf = rafFn(tick);
            return () => { if (raf) cafFn(raf); };
          }, [active, dragging, video && video.source]);

          useEffect(() => {
            if (!active || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
            const wake = () => {
              setVisible(true);
              if (hideTimer.current) clearTimeout(hideTimer.current);
              // Never hide the bar under the pointer: a bar that disappears
              // mid-drag makes the seek feel broken.
              hideTimer.current = setTimeout(() => {
                if (hoverRef.current || draggingRef.current) return;
                setVisible(false);
              }, 2600);
            };
            const onMove = (event) => {
              const height = Number(window.innerHeight) || 800;
              if (event.clientY > height - 220) wake();
            };
            wake();
            window.addEventListener('mousemove', onMove, true);
            return () => {
              window.removeEventListener('mousemove', onMove, true);
              if (hideTimer.current) clearTimeout(hideTimer.current);
            };
          }, [active]);

          useEffect(() => {
            if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
            const down = (event) => { if (event.key === 'Control') ctrlHeldRef.current = true; };
            const up = (event) => { if (event.key === 'Control') ctrlHeldRef.current = false; };
            const blur = () => { ctrlHeldRef.current = false; };
            window.addEventListener('keydown', down, true);
            window.addEventListener('keyup', up, true);
            window.addEventListener('blur', blur, true);
            return () => {
              window.removeEventListener('keydown', down, true);
              window.removeEventListener('keyup', up, true);
              window.removeEventListener('blur', blur, true);
            };
          }, []);

          useEffect(() => {
            if (!active || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
            const onWheel = (event) => {
              if (!event.ctrlKey && !ctrlHeldRef.current) return;
              const dx = Number(event.deltaX) || 0;
              const dy = Number(event.deltaY) || 0;
              if (!dx && !dy) return;
              event.preventDefault();
              if (typeof event.stopPropagation === 'function') event.stopPropagation();
              if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
              setVisible(true);
              if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 0.5) {
                const node = currentVideoNode();
                if (!node || !Number.isFinite(node.duration) || node.duration <= 0) return;
                const next = clamp(node.currentTime - dx * 0.04, 0, node.duration);
                markSeek(next);
                try { node.currentTime = next; } catch (error) { /* ignore */ }
                setProgress(next / node.duration);
                setHud(fmt(next) + ' / ' + fmt(node.duration));
              } else {
                const current = store.get();
                const base = Number.isFinite(Number(current.videoVolume)) ? Number(current.videoVolume) : 0.45;
                const next = clamp(base + dy * 0.0016, 0, 1);
                store.set({ videoVolume: next, videoMuted: false });
                setHud(Math.round(next * 100) + '%');
              }
              if (hudTimer.current) clearTimeout(hudTimer.current);
              hudTimer.current = setTimeout(() => setHud(''), 900);
            };
            window.addEventListener('wheel', onWheel, { passive: false, capture: true });
            return () => {
              window.removeEventListener('wheel', onWheel, true);
              if (hudTimer.current) clearTimeout(hudTimer.current);
            };
          }, [active]);

          useEffect(() => {
            if (!active || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
            const onDown = (event) => {
              if (!event.ctrlKey || event.button !== 0) return;
              if (event.target && event.target.closest && event.target.closest('.dsh-skin-player, .dsh-skin-seekbar, .dsh-skin-clock')) return;
              const node = videoElementRef.current;
              if (!node || !Number.isFinite(node.duration) || node.duration <= 0) return;
              dragRef.current = { x: event.clientX, time: node.currentTime, duration: node.duration, moved: false };
            };
            const onMove = (event) => {
              const drag = dragRef.current;
              if (!drag) return;
              const dx = event.clientX - drag.x;
              if (Math.abs(dx) > 4) drag.moved = true;
              if (!drag.moved) return;
              if (event.cancelable) event.preventDefault();
              const node = videoElementRef.current;
              if (!node) return;
              const next = clamp(drag.time + (dx / Math.max(1, window.innerWidth * 0.6)) * drag.duration, 0, drag.duration);
              markSeek(next);
              try { node.currentTime = next; } catch (error) { /* ignore */ }
              setProgress(next / drag.duration);
              setHud(fmt(next) + ' / ' + fmt(drag.duration));
              setVisible(true);
            };
            const onUp = () => {
              if (!dragRef.current) return;
              dragRef.current = null;
              if (hudTimer.current) clearTimeout(hudTimer.current);
              hudTimer.current = setTimeout(() => setHud(''), 700);
            };
            window.addEventListener('pointerdown', onDown, true);
            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onUp, true);
            window.addEventListener('pointercancel', onUp, true);
            return () => {
              window.removeEventListener('pointerdown', onDown, true);
              window.removeEventListener('pointermove', onMove, true);
              window.removeEventListener('pointerup', onUp, true);
              window.removeEventListener('pointercancel', onUp, true);
            };
          }, [active]);

          if (!active) return null;

          // Playlist order matches stepVideo(): createdAt ascending, wrapping.
          const playlist = (state.customVideos || []).slice().sort(comparePlaylist);
          const currentIndex = playlist.findIndex((item) => item.id === state.videoId);
          const playlistLength = playlist.length;
          const positionLabel = (currentIndex >= 0 ? currentIndex + 1 : 0) + ' / ' + playlistLength;
          const canStep = playlistLength > 1;

          const currentVideoNode = () => {
            const found = typeof document !== 'undefined' && typeof document.querySelector === 'function' ? document.querySelector('video.dsh-skin-video') : null;
            return found || videoElementRef.current;
          };

          const seekAt = (clientX, rect) => {
            const node = currentVideoNode();
            if (!node || !Number.isFinite(node.duration) || node.duration <= 0) return;
            if (!rect) {
              const track = seekTrackRef.current;
              if (track && typeof track.getBoundingClientRect === 'function') rect = track.getBoundingClientRect();
            }
            if (!rect || !rect.width) return;
            const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
            const next = ratio * node.duration;
            markSeek(next);
            try { node.currentTime = next; } catch (error) { /* ignore */ }
            setProgress(ratio);
            setHud(fmt(next) + ' / ' + fmt(node.duration));
            if (hudTimer.current) clearTimeout(hudTimer.current);
            hudTimer.current = setTimeout(() => setHud(''), 900);
          };

          const onSeek = (event) => {
            const value = clamp(Number(event.target.value) / 1000, 0, 1);
            setProgress(value);
            const node = currentVideoNode();
            if (node && Number.isFinite(node.duration)) {
              markSeek(value * node.duration);
              try { node.currentTime = value * node.duration; } catch (error) { /* ignore */ }
            }
          };
          function fmt(seconds) {
            if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const sec = Math.floor(seconds % 60);
            const mm = h > 0 && m < 10 ? '0' + m : String(m);
            return (h > 0 ? h + ':' : '') + mm + ':' + (sec < 10 ? '0' : '') + sec;
          }
          // The full control bar is gone: playback is driven by the keyboard
          // (F7 / F8 / F9) and the clock lives in the composer dock chip. What
          // is left is a slim, right-aligned seek strip — one third of the
          // viewport wide, so the picture keeps almost all of its area.
          const bar = h('div', {
            className: 'dsh-skin-seekbar',
            'data-scheme': scheme,
            'data-visible': visible ? 'true' : 'false',
            key: 'player',
            style: { bottom: barBottom + 'px' },
            onMouseEnter: () => { hoverRef.current = true; setVisible(true); },
            onMouseLeave: () => { hoverRef.current = false; }
          },
            hud ? h('div', { className: 'dsh-skin-player-hud', key: 'hud' }, hud) : null,
            h('div', { className: 'dsh-skin-player-seek-wrap', ref: seekTrackRef },
              h('input', {
                ref: seekRef, type: 'range', className: 'dsh-skin-player-seek',
                min: 0, max: 1000, step: 1, value: Math.round(progress * 1000),
                'aria-label': t('video.progress'),
                onChange: onSeek,
                onInput: onSeek,
                onMouseDown: () => { draggingRef.current = true; setDragging(true); },
                onTouchStart: () => { draggingRef.current = true; setDragging(true); },
                onMouseUp: () => { draggingRef.current = false; setDragging(false); },
                onTouchEnd: () => { draggingRef.current = false; setDragging(false); },
                onPointerUp: () => { draggingRef.current = false; setDragging(false); },
                onPointerCancel: () => { draggingRef.current = false; setDragging(false); },
                onBlur: () => { draggingRef.current = false; setDragging(false); }
              })
            )
          );
          if (createPortal && typeof document !== 'undefined' && document.body) {
            return createPortal(bar, document.body);
          }
          return bar;
        }

        function CinemaMode() {
          const state = useStore(store);
          const video = resolveVideo(state);
          const active = Boolean(video && video.source);
          const wakeRef = React.useRef(null);
          useEffect(() => {
            if (!active || state.cinemaAutoHide !== true) return undefined;
            if (typeof document === 'undefined' || !document.body) return undefined;
            let timer = null;
            const wake = () => {
              document.body.classList.remove('dsh-skin-cinema');
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => {
                // Never fade out the app while the caret is in a text field:
                // the user is reading what they type and looking at the
                // conversation above it. That vanishing act is what people
                // describe as "the interface disappeared by itself".
                if (!document.body || isTextEntryFocused()) return;
                document.body.classList.add('dsh-skin-cinema');
              }, CINEMA_IDLE_MS);
            };
            wakeRef.current = wake;
            const events = ['pointermove', 'pointerdown', 'mousemove', 'mousedown', 'wheel', 'keydown', 'touchstart'];
            // Capture on document so movement still wakes the UI when the app
            // root has pointer-events:none and no element is hit-tested.
            events.forEach((name) => document.addEventListener(name, wake, { passive: true, capture: true }));
            const onFocus = () => {
              if (!isTextEntryFocused()) return;
              document.body.classList.remove('dsh-skin-cinema');
              if (timer) clearTimeout(timer);
            };
            document.addEventListener('focusin', onFocus, true);
            wake();
            return () => {
              if (timer) clearTimeout(timer);
              events.forEach((name) => document.removeEventListener(name, wake, { capture: true }));
              document.removeEventListener('focusin', onFocus, true);
              wakeRef.current = null;
              document.body.classList.remove('dsh-skin-cinema');
            };
          }, [active, state.cinemaAutoHide]);
          return null;
        }

        function fmtClock(seconds) {
          if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          const sec = Math.floor(seconds % 60);
          const mm = h > 0 && m < 10 ? '0' + m : String(m);
          return (h > 0 ? h + ':' : '') + mm + ':' + (sec < 10 ? '0' : '') + sec;
        }

        // The clock replaces the floating player bar: it sits in the composer
        // dock, where the vault chip used to be, and reads the live <video>
        // element directly so it needs no shared state with the seek strip.
        function TimeChip() {
          useStore(store);
          useLocale();
          const video = resolveVideo(store.get());
          const active = Boolean(video && video.source);
          const [clock, setClock] = useState({ time: 0, duration: 0 });
          useEffect(() => {
            if (!active) return undefined;
            if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return undefined;
            let raf = 0;
            let last = 0;
            const read = (now) => {
              raf = window.requestAnimationFrame(read);
              if (now - last < 250) return;
              last = now;
              const node = typeof document !== 'undefined' && typeof document.querySelector === 'function' ? document.querySelector('video.dsh-skin-video') : null;
              if (!node) return;
              const time = Number(node.currentTime) || 0;
              const duration = Number(node.duration) || 0;
              setClock((prev) => (Math.abs(prev.time - time) < 0.25 && Math.abs(prev.duration - duration) < 0.5 ? prev : { time, duration }));
            };
            raf = window.requestAnimationFrame(read);
            return () => { try { window.cancelAnimationFrame(raf); } catch (error) { /* ignore */ } };
          }, [active]);
          if (!active) return null;
          const playing = Boolean(store.get().videoPlaying);
          return h('button', {
            type: 'button',
            className: 'dsh-skin-clock',
            title: t('video.clockHint'),
            onClick: () => { store.set({ videoPlaying: !store.get().videoPlaying }); recordDebug('clock:toggle'); }
          },
            h(playing ? IconPause : IconPlay, { size: 12 }),
            h('span', { className: 'dsh-skin-clock-time' }, fmtClock(clock.time) + ' / ' + fmtClock(clock.duration))
          );
        }

        // Hardware playback keys. The media bar used to be the only way to
        // pause; on a laptop F7/F8/F9 are easier to reach than a floating
        // control row, and they never cover the picture.
        function MediaKeys() {
          useStore(store);
          useEffect(() => {
            if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined;
            const onKey = (event) => {
              if (!event || event.defaultPrevented) return;
              if (event.metaKey || event.ctrlKey || event.altKey) return;
              const key = event.key;
              const prev = key === 'F7' || key === 'MediaTrackPrevious' || key === 'MediaPreviousTrack';
              const play = key === 'F8' || key === 'MediaPlayPause' || key === 'MediaPlay' || key === 'MediaPause';
              const next = key === 'F9' || key === 'MediaTrackNext';
              if (!prev && !play && !next) return;
              // Typing wins: an F-key inside a focused text field is the
              // user's, not ours.
              if (isTextEntryFocused()) return;
              const current = store.get();
              if (!current.videoId || current.videoId === 'none') return;
              event.preventDefault();
              if (prev) { recordDebug('key:prev'); stepVideo(-1).catch(() => {}); return; }
              if (next) { recordDebug('key:next'); stepVideo(1).catch(() => {}); return; }
              const playing = !current.videoPlaying;
              store.set({ videoPlaying: playing });
              recordDebug('key:play', { playing });
            };
            document.addEventListener('keydown', onKey, true);
            return () => document.removeEventListener('keydown', onKey, true);
          }, []);
          return null;
        }

        // The key-vault chip used to sit in the composer dock, where the clock
        // now lives. Keeping an entry here means the vault is still reachable
        // without occupying the row the user watches while a movie plays.
        function VaultSection() {
          useLocale();
          const open = () => {
            const chip = typeof document !== 'undefined' && typeof document.querySelector === 'function'
              ? document.querySelector('.bv-chip')
              : null;
            if (chip && typeof chip.click === 'function') { chip.click(); recordDebug('vault:open'); return; }
            store.notify('vaultMissing');
          };
          return h('section', { className: 'dsh-skin-section' },
            h('h2', { className: 'dsh-skin-h2' }, t('section.vault')),
            h('div', { className: 'dsh-skin-options' },
              h('button', { type: 'button', className: 'dsh-skin-key-btn', onClick: open },
                h(IconLink, { size: 12 }),
                h('span', null, t('vault.open'))
              )
            ),
            h('p', { className: 'dsh-skin-hint' }, t('vault.desc'))
          );
        }

        function OverlayEntry() {
          const state = useStore(store);
          const wallpaper = resolveWallpaper(state);
          const video = resolveVideo(state);
          const videoActive = Boolean(video && video.source);
      React.useEffect(() => {
        if (typeof document === 'undefined' || !document.body) return undefined;
        document.body.classList.toggle('dsh-skin-video-active', videoActive);
        return () => { try { document.body.classList.remove('dsh-skin-video-active'); } catch (error) {} };
      }, [videoActive]);

          useEffect(() => {
            if (!state.notice) return undefined;
            const timer = setTimeout(() => store.dismissNotice(), 7000);
            return () => clearTimeout(timer);
          }, [state.notice]);

          return h(React.Fragment, null,
            h('style', { key: 'styles' }, STYLE_CSS),
            h(ModeController, { key: 'mode' }),
            h(CinemaMode, { key: 'cinema' }),
            h(MediaKeys, { key: 'media-keys' }),
            h(VideoBackground, { key: 'video-bg' }),
            h(VideoPlayerBar, { key: 'video-player' }),
            videoActive ? h('style', { key: 'video-body' }, videoBodyCss()) : null,
            wallpaper && !videoActive ? h('style', { key: 'wallpaper' }, bodyCss(wallpaper, state.dim)) : null,
            state.quickOpen ? h(QuickPanel, { key: 'quick' }) : null
          );
        }

        function SettingsIcon(props) {
          return h(IconPalette, { size: (props && props.size) || 16 });
        }

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'skin-studio',
          order: 5,
          label: () => t('nav.label')
        }, guarded(SettingsPage)));

        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon',
          id: 'skin-studio',
          order: 5
        }, SettingsIcon));

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'skin-studio-quick',
          order: 5,
          label: () => t('quick.label')
        }, guarded(QuickAction)));

        // The clock lives in the composer dock: that is the one row the user is
        // already looking at while a wallpaper plays, and it costs no画面。
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'skin-studio-clock',
          order: 19
        }, guarded(TimeChip)));

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'skin-studio-overlay',
          order: 60
        }, guarded(OverlayEntry)));
      }
    };
  }
});
