(function () {
  "use strict";

  // ---------- Data ----------
  var RAMPS = {
    std: " .:-=+*#%@",
    detail: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    blocks: " ░▒▓█",
    binary: " 01"
  };
  var PALETTES = {
    pico8: ["#000000","#1d2b53","#7e2553","#008751","#ab5236","#5f574f","#c2c3c7","#fff1e8","#ff004d","#ffa300","#ffec27","#00e436","#29adff","#83769c","#ff77a8","#ffccaa"],
    gameboy: ["#0f380f","#306230","#8bac0f","#9bbc0f"],
    gray4: ["#000000","#555555","#aaaaaa","#ffffff"],
    original: null
  };
  var INKS = {
    mono: ["#111111", "#f7f7f2"],
    riso: ["#2f4fa0", "#ffd3e6"],
    gb: ["#0f380f", "#9bbc0f"],
    amber: ["#ffb000", "#1a1206"]
  };
  var MODE_COLS = { ascii: [20, 240, 110], pixel: [16, 160, 64], bit: [40, 320, 180] };

  // ---------- Elements ----------
  var $ = function (id) { return document.getElementById(id); };
  var out = $("out"), octx = out.getContext("2d");
  var work = document.createElement("canvas"), wctx = work.getContext("2d", { willReadFrequently: true });
  var state = { mode: "ascii", img: null, name: "ringed-planet", text: "", colsByMode: { ascii: 110, pixel: 64, bit: 180 } };

  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  var PAL_RGB = {}; Object.keys(PALETTES).forEach(function (k) { PAL_RGB[k] = PALETTES[k] ? PALETTES[k].map(rgb) : null; });

  // ---------- Sample image (drawn, so the page works at once) ----------
  function makeSample() {
    var c = document.createElement("canvas"); c.width = 640; c.height = 440;
    var g = c.getContext("2d");
    var sky = g.createLinearGradient(0, 0, 0, 440);
    sky.addColorStop(0, "#0b1033"); sky.addColorStop(1, "#3a1d5c");
    g.fillStyle = sky; g.fillRect(0, 0, 640, 440);
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 90; i++) { g.fillStyle = "rgba(255,255,255," + (0.4 + rnd() * 0.6) + ")"; var s = rnd() * 2.2 + 0.6; g.fillRect(rnd() * 640, rnd() * 440, s, s); }
    // ring (back half)
    g.save(); g.translate(320, 225); g.rotate(-0.32);
    g.strokeStyle = "rgba(255,214,150,0.85)"; g.lineWidth = 14;
    g.beginPath(); g.ellipse(0, 0, 230, 58, 0, Math.PI, Math.PI * 2); g.stroke(); g.restore();
    // planet
    var p = g.createRadialGradient(270, 170, 10, 320, 225, 150);
    p.addColorStop(0, "#ffe2a8"); p.addColorStop(0.45, "#f07a3a"); p.addColorStop(0.85, "#7a2a6a"); p.addColorStop(1, "#2a0f3a");
    g.fillStyle = p; g.beginPath(); g.arc(320, 225, 140, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.18; g.fillStyle = "#3a0f2a";
    for (var b = -3; b <= 3; b++) { g.fillRect(180, 225 + b * 34, 280, 9); }
    g.globalAlpha = 1;
    // ring (front half)
    g.save(); g.translate(320, 225); g.rotate(-0.32);
    g.strokeStyle = "rgba(255,226,170,0.95)"; g.lineWidth = 14;
    g.beginPath(); g.ellipse(0, 0, 230, 58, 0, 0, Math.PI); g.stroke(); g.restore();
    var img = new Image(); img.src = c.toDataURL("image/png");
    return img;
  }

  // ---------- Image loading ----------
  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) { note("That file isn't an image. Try a JPG, PNG, WebP or GIF.", true); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      state.img = img;
      state.name = (file.name || "pasted-image").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").slice(0, 60) || "image";
      $("thumb").src = url; $("srcName").textContent = file.name || "Pasted image";
      note("");
      schedule();
    };
    img.onerror = function () { note("Couldn't read that image. It may be damaged or in an unsupported format.", true); };
    img.src = url;
  }
  $("file").addEventListener("change", function (e) { loadFile(e.target.files[0]); e.target.value = ""; });
  ["drop", "mat"].forEach(function (id) {
    var el = $(id);
    el.addEventListener("dragover", function (e) { e.preventDefault(); el.classList.add("over"); });
    el.addEventListener("dragleave", function () { el.classList.remove("over"); });
    el.addEventListener("drop", function (e) { e.preventDefault(); el.classList.remove("over"); loadFile(e.dataTransfer.files[0]); });
  });
  document.addEventListener("paste", function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) { if (items[i].type.indexOf("image") === 0) { loadFile(items[i].getAsFile()); return; } }
  });

  // ---------- Sampling ----------
  function adjust(data) {
    var b = +$("bright").value / 100 * 255;
    var c = 1 + (+$("contrast").value) / 100;
    for (var i = 0; i < data.length; i += 4) {
      for (var k = 0; k < 3; k++) {
        var v = (data[i + k] - 128) * c + 128 + b;
        data[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      // flatten transparency onto white
      var a = data[i + 3] / 255;
      if (a < 1) { for (var j = 0; j < 3; j++) data[i + j] = data[i + j] * a + 255 * (1 - a); data[i + 3] = 255; }
    }
    return data;
  }
  function sample(cols, rows) {
    work.width = cols; work.height = rows;
    wctx.imageSmoothingEnabled = true; wctx.imageSmoothingQuality = "high";
    wctx.clearRect(0, 0, cols, rows);
    wctx.drawImage(state.img, 0, 0, cols, rows);
    return adjust(wctx.getImageData(0, 0, cols, rows).data);
  }
  function lum(r, g, b) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
  function ratio() { return state.img.naturalHeight / state.img.naturalWidth; }

  // ---------- ASCII ----------
  var FONT_PX = 14;
  function renderAscii(cols) {
    var font = FONT_PX + "px 'IBM Plex Mono', ui-monospace, Consolas, monospace";
    octx.font = font;
    var cw = octx.measureText("M").width, ch = Math.round(FONT_PX * 1.12);
    var rows = Math.max(1, Math.round(cols * ratio() * (cw / ch)));
    var d = sample(cols, rows);
    var ramp = RAMPS[$("ramp").value];
    var dark = $("asciiBg").value === "dark";
    var color = $("asciiColor").checked;
    var invert = $("asciiInvert").checked;
    out.width = Math.ceil(cols * cw); out.height = rows * ch;
    var bg = dark ? "#0c0d10" : "#fbfbf8", fg = dark ? "#e9ecf2" : "#15171c";
    octx.fillStyle = bg; octx.fillRect(0, 0, out.width, out.height);
    octx.font = font; octx.textBaseline = "top";
    var lines = [], last = "";
    for (var y = 0; y < rows; y++) {
      var line = "";
      for (var x = 0; x < cols; x++) {
        var i = (y * cols + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        var v = lum(r, g, b);
        var density = dark ? v : 1 - v;
        if (invert) density = 1 - density;
        var chr = ramp[Math.min(ramp.length - 1, Math.floor(density * ramp.length))];
        line += chr;
        if (chr !== " ") {
          var fill = color ? "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")" : fg;
          if (fill !== last) { octx.fillStyle = fill; last = fill; }
          octx.fillText(chr, x * cw, y * ch);
        }
      }
      lines.push(line.replace(/\s+$/, ""));
    }
    state.text = lines.join("\n");
    out.classList.add("smooth");
    return cols + " × " + rows + " characters · " + ramp.trim().length + "-step ramp";
  }

  // ---------- Pixel ----------
  function nearest(pal, r, g, b) {
    var best = 0, bd = Infinity;
    for (var p = 0; p < pal.length; p++) {
      var dr = r - pal[p][0], dg = g - pal[p][1], db = b - pal[p][2];
      var dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (dist < bd) { bd = dist; best = p; }
    }
    return pal[best];
  }
  function renderPixel(cols) {
    var rows = Math.max(1, Math.round(cols * ratio()));
    var d = sample(cols, rows);
    var pal = PAL_RGB[$("palette").value];
    var buf = new Float32Array(d.length);
    for (var i = 0; i < d.length; i++) buf[i] = d[i];
    var dither = $("pixelDither").checked && pal;
    var res = new Uint8ClampedArray(d.length);
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var j = (y * cols + x) * 4;
        var r = buf[j], g = buf[j + 1], b = buf[j + 2];
        var c = pal ? nearest(pal, r, g, b) : [r, g, b];
        res[j] = c[0]; res[j + 1] = c[1]; res[j + 2] = c[2]; res[j + 3] = 255;
        if (dither) {
          var er = r - c[0], eg = g - c[1], eb = b - c[2];
          spread(buf, cols, rows, x + 1, y, er, eg, eb, 7 / 16);
          spread(buf, cols, rows, x - 1, y + 1, er, eg, eb, 3 / 16);
          spread(buf, cols, rows, x, y + 1, er, eg, eb, 5 / 16);
          spread(buf, cols, rows, x + 1, y + 1, er, eg, eb, 1 / 16);
        }
      }
    }
    var scale = Math.max(2, Math.floor(960 / cols));
    out.width = cols * scale; out.height = rows * scale;
    for (var yy = 0; yy < rows; yy++) {
      for (var xx = 0; xx < cols; xx++) {
        var k = (yy * cols + xx) * 4;
        octx.fillStyle = "rgb(" + res[k] + "," + res[k + 1] + "," + res[k + 2] + ")";
        octx.fillRect(xx * scale, yy * scale, scale, scale);
      }
    }
    if ($("pixelGrid").checked && scale >= 6) {
      octx.strokeStyle = "rgba(0,0,0,0.22)"; octx.lineWidth = 1; octx.beginPath();
      for (var gx = 1; gx < cols; gx++) { octx.moveTo(gx * scale + 0.5, 0); octx.lineTo(gx * scale + 0.5, out.height); }
      for (var gy = 1; gy < rows; gy++) { octx.moveTo(0, gy * scale + 0.5); octx.lineTo(out.width, gy * scale + 0.5); }
      octx.stroke();
    }
    out.classList.remove("smooth");
    state.text = "";
    return cols + " × " + rows + " pixels · " + (pal ? pal.length + " colors" : "original colors") + " · shown at " + scale + "×";
  }
  function spread(buf, w, h, x, y, er, eg, eb, f) {
    if (x < 0 || x >= w || y >= h) return;
    var j = (y * w + x) * 4;
    buf[j] += er * f; buf[j + 1] += eg * f; buf[j + 2] += eb * f;
  }

  // ---------- 1-bit ----------
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function renderBit(cols) {
    var rows = Math.max(1, Math.round(cols * ratio()));
    var d = sample(cols, rows);
    var n = cols * rows, L = new Float32Array(n);
    for (var i = 0; i < n; i++) L[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    var t = +$("threshold").value / 100, method = $("dither").value;
    var bits = new Uint8Array(n);
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var p = y * cols + x, v = L[p], on;
        if (method === "bayer") { on = v > (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16 + (t - 0.5); }
        else { on = v > t; }
        bits[p] = on ? 1 : 0;
        if (method === "fs" || method === "atkinson") {
          var err = v - (on ? 1 : 0);
          if (method === "fs") {
            add(L, cols, rows, x + 1, y, err * 7 / 16); add(L, cols, rows, x - 1, y + 1, err * 3 / 16);
            add(L, cols, rows, x, y + 1, err * 5 / 16); add(L, cols, rows, x + 1, y + 1, err / 16);
          } else {
            var e = err / 8;
            add(L, cols, rows, x + 1, y, e); add(L, cols, rows, x + 2, y, e);
            add(L, cols, rows, x - 1, y + 1, e); add(L, cols, rows, x, y + 1, e); add(L, cols, rows, x + 1, y + 1, e);
            add(L, cols, rows, x, y + 2, e);
          }
        }
      }
    }
    var ink = INKS[$("inks").value];
    var scale = Math.max(1, Math.floor(1100 / cols));
    out.width = cols * scale; out.height = rows * scale;
    octx.fillStyle = ink[1]; octx.fillRect(0, 0, out.width, out.height);
    octx.fillStyle = ink[0];
    var dark = 0;
    for (var yy = 0; yy < rows; yy++) {
      for (var xx = 0; xx < cols; xx++) {
        if (!bits[yy * cols + xx]) { octx.fillRect(xx * scale, yy * scale, scale, scale); dark++; }
      }
    }
    out.classList.remove("smooth");
    state.text = "";
    return cols + " × " + rows + " dots · " + Math.round(dark / n * 100) + "% ink coverage";
  }
  function add(L, w, h, x, y, v) { if (x >= 0 && x < w && y < h) L[y * w + x] += v; }

  // ---------- Render loop ----------
  var pending = false;
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(render); } }
  function render() {
    pending = false;
    if (!state.img || !state.img.complete || !state.img.naturalWidth) return;
    var cols = +$("cols").value;
    var meta = state.mode === "ascii" ? renderAscii(cols) : state.mode === "pixel" ? renderPixel(cols) : renderBit(cols);
    $("meta").textContent = meta;
    $("txt").value = state.text;
    var isAscii = state.mode === "ascii";
    $("copyBtn").hidden = !isAscii; $("saveTxt").hidden = !isAscii || !canSave; $("textBox").hidden = !isAscii;
  }

  function syncOutputs() {
    $("colsOut").textContent = $("cols").value;
    $("brightOut").textContent = (+$("bright").value > 0 ? "+" : "") + $("bright").value;
    $("contrastOut").textContent = (+$("contrast").value > 0 ? "+" : "") + $("contrast").value;
    $("thresholdOut").textContent = $("threshold").value + "%";
    var pal = PALETTES[$("palette").value];
    $("palSwatches").innerHTML = "";
    (pal || ["#ff004d", "#ffa300", "#00e436", "#29adff", "#83769c"]).forEach(function (c) {
      var i = document.createElement("i"); i.style.background = pal ? c : "linear-gradient(90deg,#f33,#fc3,#3c6,#39f,#c3f)"; $("palSwatches").appendChild(i);
    });
    if (!pal) $("palSwatches").innerHTML = '<i style="background:linear-gradient(90deg,#f33,#fc3,#3c6,#39f,#c3f)"></i>';
  }

  function setMode(m) {
    state.colsByMode[state.mode] = +$("cols").value;
    state.mode = m;
    ["ascii", "pixel", "bit"].forEach(function (k) {
      $("m-" + k).setAttribute("aria-pressed", k === m ? "true" : "false");
      $("opt-" + k).hidden = k !== m;
    });
    var r = MODE_COLS[m];
    $("cols").min = r[0]; $("cols").max = r[1]; $("cols").value = state.colsByMode[m];
    $("colsLabel").textContent = m === "ascii" ? "Width in characters" : m === "pixel" ? "Width in pixels" : "Width in dots";
    syncOutputs(); schedule();
    try { localStorage.setItem("gd-mode", m); } catch (e) {}
  }
  document.querySelectorAll(".modes button").forEach(function (b) { b.addEventListener("click", function () { setMode(b.dataset.mode); }); });
  ["cols", "bright", "contrast", "threshold"].forEach(function (id) { $(id).addEventListener("input", function () { syncOutputs(); schedule(); }); });
  ["ramp", "asciiBg", "asciiColor", "asciiInvert", "palette", "pixelDither", "pixelGrid", "dither", "inks"].forEach(function (id) {
    $(id).addEventListener("change", function () { syncOutputs(); schedule(); });
  });
  $("reset").addEventListener("click", function () { $("bright").value = 0; $("contrast").value = 15; $("threshold").value = 50; syncOutputs(); schedule(); });

  // ---------- Notes ----------
  var noteTimer;
  function note(msg, isErr) {
    var n = $("note"); n.textContent = msg; n.classList.toggle("err", !!isErr);
    clearTimeout(noteTimer); if (msg && !isErr) noteTimer = setTimeout(function () { n.textContent = ""; }, 3500);
  }

  // ---------- Copy ----------
  $("copyBtn").addEventListener("click", function () {
    var text = state.text;
    var fallback = function () { var d = $("textBox"); d.open = true; $("txt").focus(); $("txt").select(); note("Copying isn't allowed here, so the text is selected. Press Ctrl+C."); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { note("Copied " + text.split("\n").length + " lines. Paste into a monospace font to keep the shape."); }, fallback);
    } else { fallback(); }
  });

  // ---------- Saving: claude.ai downloads capability, or a plain link when opened as a local file ----------
  var canSave = true, downloads = null, inViewer = !!(window.claude && typeof window.claude.use === "function");
  function stamp() { return state.name + "-" + state.mode; }
  function saveBlob(blob, filename) {
    if (inViewer) {
      if (!downloads) { note("Saving isn't available in this view.", true); return; }
      downloads.save({ filename: filename, data: blob }).then(function () { note("Saved " + filename + "."); }, function (err) {
        var code = err && err.code;
        if (code === "declined") note("Save cancelled.");
        else if (code === "rate_limited") note("A save prompt is already open. Finish that one first.");
        else { note("Saving isn't available here.", true); canSave = false; $("savePng").hidden = true; $("saveTxt").hidden = true; }
      });
    } else {
      var url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      note("Saved " + filename + ".");
    }
  }
  $("savePng").addEventListener("click", function () {
    out.toBlob(function (blob) { if (blob) saveBlob(blob, stamp() + ".png"); else note("Couldn't create the PNG. Try a smaller width.", true); }, "image/png");
  });
  $("saveTxt").addEventListener("click", function () { saveBlob(new Blob([state.text + "\n"], { type: "text/plain" }), stamp() + ".txt"); });
  if (inViewer) {
    $("savePng").hidden = true; canSave = false;
    window.claude.use("downloads").then(function (ns) {
      downloads = ns;
      canSave = !!ns;
      $("savePng").hidden = !ns;
      $("saveTxt").hidden = !ns || state.mode !== "ascii";
    }, function () { canSave = false; });
  }

  // ---------- Start ----------
  var startMode = "ascii";
  try { var sm = localStorage.getItem("gd-mode"); if (MODE_COLS[sm]) startMode = sm; } catch (e) {}
  state.img = makeSample();
  $("thumb").src = state.img.src;
  state.img.onload = function () {
    var go = function () { setMode(startMode); };
    if (document.fonts && document.fonts.load) { document.fonts.load(FONT_PX + "px 'IBM Plex Mono'").then(go, go); } else { go(); }
  };
  syncOutputs();
})();
