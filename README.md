# Glyph Darkroom

Turn any photo into **ASCII art**, **pixel art** or **1‑bit dithered prints**, right in your browser.

No server, no install, no dependencies. Your image never leaves your device. Just plain HTML, CSS and JavaScript.

## Files

```
├── glyph-darkroom.html             # the app
├── glyph-darkroom-explained.html   # how the app works
├── css/
│   ├── glyph-darkroom.css
│   └── glyph-darkroom-explained.css
└── js/
    ├── glyph-darkroom.js
    └── glyph-darkroom-explained.js
```

| Page | What it is |
| --- | --- |
| [`glyph-darkroom.html`](glyph-darkroom.html) | The app. Open it in any modern browser. |
| [`glyph-darkroom-explained.html`](glyph-darkroom-explained.html) | An illustrated, interactive walkthrough of how the app works: the pipeline, the luminance formula, dithering kernels and palette matching. |

Keep the `css/` and `js/` folders next to the HTML files, since the pages load them by relative path.

## Getting started

1. Download or clone this repo.
2. Open `glyph-darkroom.html` in your browser.
3. Drop, paste or pick an image. A sample image is shown until you load one.
4. Choose a style, tweak the sliders, then copy the text or save a PNG.

```bash
git clone https://github.com/Ujwal164/Glyph.git
cd Glyph
# then open glyph-darkroom.html in your browser
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

Only built‑in browser APIs: Canvas 2D, `URL.createObjectURL`, drag‑and‑drop and paste events, `canvas.toBlob()` and the Clipboard API.

## License

[MIT](LICENSE) © 2026 Ujwal Bagul
