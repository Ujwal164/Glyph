# Glyph Darkroom

Turn any photo into **ASCII art**, **pixel art** or **1‑bit dithered prints**, right in your browser.

No server, no install, no dependencies. Your image never leaves your device. Just plain HTML, CSS and JavaScript.

## Glyph Darkroom TV

The main experience (`index.html`) is a retro CRT television that fills one screen, with no scrolling. Every control is part of the TV:

| Control | What it does |
| --- | --- |
| **Channel knob** | CH 1 ASCII · CH 2 PIXEL · CH 3 1‑BIT, with a burst of static on every switch |
| **DETAIL / BRIGHT / CONTR knobs** | Drag, scroll or use arrow keys; double‑click to reset. An on‑screen level bar shows the value |
| **MENU** | Green on‑screen menu with the options for the current channel, CRT effect level, sound and reset |
| **POWER** | Classic CRT power on/off: line, then dot |
| **SAVE / COPY** | Save a clean PNG (no CRT effects) · copy the ASCII text |
| **INSERT IMAGE slot** | Click to pick an image, or drop or paste one anywhere |

The screen is rendered with a WebGL shader: curved glass, scanlines, shadow mask, colour fringing, glow, vignette and static. Without WebGL, it falls back to plain 2D with CSS scanlines. Sounds are synthesised with the Web Audio API and stay off until you turn them on in the menu.

**Keyboard:** `1` `2` `3` channel · `M` menu · `O` open image · `S` save · `C` copy · `P` power

## Files

```
├── index.html                      # the CRT TV (start here)
├── glyph-darkroom.html             # the original panel-style app
├── glyph-darkroom-explained.html   # how the conversion works (self-contained)
├── css/
│   ├── crt-tv.css
│   └── glyph-darkroom.css
└── js/
    ├── glyph-engine.js             # image → ASCII / pixel / 1-bit (no UI)
    ├── crt-screen.js               # WebGL CRT shader
    ├── crt-sound.js                # Web Audio sound effects
    ├── crt-tv.js                   # TV controls, menu, power and channels
    └── glyph-darkroom.js           # original app
```

| Page | What it is |
| --- | --- |
| [`index.html`](index.html) | The CRT TV version. Open it in any modern browser. |
| [`glyph-darkroom.html`](glyph-darkroom.html) | The original app with a classic control panel. |
| [`glyph-darkroom-explained.html`](glyph-darkroom-explained.html) | An illustrated, interactive walkthrough of how the conversion works: the pipeline, the luminance formula, dithering kernels and palette matching. |

Keep the `css/` and `js/` folders next to the HTML files, since the pages load them by relative path. The explainer page has everything inline and works on its own.

## Getting started

1. Download or clone this repo.
2. Open `index.html` in your browser.
3. Drop, paste or insert an image. A sample image is shown until you load one.
4. Turn the knobs, pick a channel, then save a PNG or copy the text.

```bash
git clone https://github.com/Ujwal164/Glyph.git
cd Glyph
# then open index.html in your browser
```

## Styles

### ASCII
- Character sets: Standard (` .:-=+*#%@`), Detailed (70 characters), Blocks (`░▒▓█`), Binary (`0 1`)
- Light characters on black, or ink on white paper
- Optional original colours and invert
- Copy as text, save as `.txt` or `.png`

### Pixel art
- Palettes: PICO‑8 (16 colours), Game Boy (4 greens), Grayscale (4 tones), or original colours
- Optional dithering and grid lines

### 1‑bit
- Dithering: Atkinson, Floyd–Steinberg, Bayer 4×4, or a hard threshold
- Inks: black on white, riso blue on pink, Game Boy greens, amber terminal

All styles share brightness, contrast and resolution controls.

## How it works

Every style follows the same pipeline:

```
image → shrink to a small grid → read pixels → adjust brightness/contrast → map each cell → draw on canvas → PNG
```

- **ASCII:** each cell's brightness (Rec. 709 luminance: `0.21R + 0.72G + 0.07B`) picks a character from the ramp. Rows are scaled by the character aspect ratio so the output isn't stretched.
- **Pixel:** each colour snaps to the nearest palette colour using a perceptually weighted RGB distance. With dithering on, the error spreads to neighbouring pixels.
- **1‑bit:** brightness becomes on/off dots via error‑diffusion (Floyd–Steinberg, Atkinson) or ordered (Bayer) dithering.

Redraws are batched with `requestAnimationFrame`, so dragging the sliders stays smooth.

For the full illustrated explanation, with live demos, open [`glyph-darkroom-explained.html`](glyph-darkroom-explained.html).

## Built with

Only built‑in browser APIs: Canvas 2D, WebGL, Web Audio, `URL.createObjectURL`, drag‑and‑drop and paste events, `canvas.toBlob()` and the Clipboard API.

## License

[MIT](LICENSE) © 2026 Ujwal Bagul
