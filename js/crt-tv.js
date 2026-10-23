// Glyph Darkroom TV: the cabinet controls, on-screen display and power/channel effects.
(function () {
  "use strict";
  var E = window.GlyphEngine, Sound = window.CRTSound;
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var now = function () { return performance.now(); };

  var CHANNELS = ["ascii", "pixel", "bit"];
  var CH_NAME = { ascii: "ASCII", pixel: "PIXEL", bit: "1-BIT" };
  var DETAIL_UNIT = { ascii: "CHARS", pixel: "PIXELS", bit: "DOTS" };
  var OSD_GREEN = "#7dff95", OSD_RED = "#ff6b5a";
  var STORE = "gd-tv";

  // ---------- Settings (remembered per viewer) ----------
  var CHOICES = {
    ramp: [["std", "STANDARD"], ["detail", "DETAILED"], ["blocks", "BLOCKS"], ["binary", "BINARY"]],
    asciiBg: [["dark", "GLOW ON BLACK"], ["paper", "INK ON PAPER"]],
    palette: [["pico8", "PICO-8"], ["gameboy", "GAME BOY"], ["gray4", "GRAY 4"], ["original", "ORIGINAL"]],
    dither: [["atkinson", "ATKINSON"], ["fs", "FLOYD-STEINBERG"], ["bayer", "BAYER 4X4"], ["none", "NONE"]],
    inks: [["mono", "BLACK/WHITE"], ["riso", "RISO BLUE/PINK"], ["gb", "GAME BOY"], ["amber", "AMBER"]],
    fx: [["full", "FULL"], ["light", "LIGHT"], ["off", "OFF"]]
  };
  var ONOFF = [[true, "ON"], [false, "OFF"]];
  var DEFAULTS = {
    channel: "ascii", bright: 0, contrast: 15, cols: { ascii: 110, pixel: 64, bit: 180 },
    ramp: "std", asciiBg: "dark", asciiColor: true, asciiInvert: false,
    palette: "pico8", pixelDither: true, pixelGrid: false,
    dither: "atkinson", threshold: 50, inks: "mono", fx: "full"
  };
  var S = loadSettings();

  function loadSettings() {
    var s = JSON.parse(JSON.stringify(DEFAULTS)), saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) {}
    Object.keys(DEFAULTS).forEach(function (k) {
      if (k === "cols") {
        CHANNELS.forEach(function (c) {
          var v = saved.cols && saved.cols[c], r = E.MODE_COLS[c];
          if (typeof v === "number" && v >= r[0] && v <= r[1]) s.cols[c] = v;
        });
      } else if (typeof saved[k] === typeof DEFAULTS[k]) s[k] = saved[k];
    });
    Object.keys(CHOICES).forEach(function (k) {
      if (!CHOICES[k].some(function (c) { return c[0] === s[k]; })) s[k] = DEFAULTS[k];
    });
    if (CHANNELS.indexOf(s.channel) < 0) s.channel = DEFAULTS.channel;
    s.bright = clamp(s.bright, -50, 50); s.contrast = clamp(s.contrast, -50, 100); s.threshold = clamp(s.threshold, 10, 90);
    return s;
  }
  var saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }, 300);
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function signed(v) { return (v > 0 ? "+" : "") + v; }

  // ---------- Canvases ----------
  var tv = $("tv"), screenBox = $("screenBox");
  var out = document.createElement("canvas");            // clean converted image (what gets saved)
  var comp = document.createElement("canvas");           // image + on-screen display, fed to the shader
  var cctx = comp.getContext("2d");
  var crt = new window.CRTScreen($("screen"), comp);
  var screenEl = crt.canvas;
  if (crt.fallback) tv.classList.add("no-gl");
  crt.setFx(S.fx);

  var state = { power: false, img: null, name: "ringed-planet", label: "the sample ringed planet", text: "", size: "", smooth: true, dragging: false, url: null };
  var dirty = { out: true, comp: true, draw: true };

  // ---------- On-screen display ----------
  var osd = { ch: 0, bar: null, barUntil: 0, msg: "", msgErr: false, msgUntil: 0, next: 0 };
  function showChannel(delay) { osd.ch = now() + (delay || 0) + 2600; dirty.comp = true; }
  function showBar(kind, label, value, min, max, text) {
    osd.bar = { kind: kind, label: label, value: value, min: min, max: max, text: text };
    osd.barUntil = now() + 1800; dirty.comp = true;
  }
  function message(text, isErr) {
    osd.msg = text; osd.msgErr = !!isErr; osd.msgUntil = now() + (isErr ? 5000 : 3200); dirty.comp = true;
    $("live").textContent = text;
  }

  function composite() {
    var W = comp.width, H = comp.height, t = now();
    cctx.fillStyle = "#050505"; cctx.fillRect(0, 0, W, H);
    osd.next = 0;
    if (!state.power) return;

    // picture, fitted inside the curved safe area
    var m = 0.045, aw = W * (1 - 2 * m), ah = H * (1 - 2 * m);
    if (out.width > 1) {
      var k = Math.min(aw / out.width, ah / out.height), dw = out.width * k, dh = out.height * k;
      cctx.imageSmoothingEnabled = state.smooth;
      cctx.drawImage(out, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    var x0 = W * m, y0 = H * m, x1 = W - x0, y1 = H - y0, pad = H * 0.035, fs = Math.round(H * 0.07);
    cctx.textBaseline = "top";
    cctx.lineJoin = "round";
    function text(str, x, y, size, align, color) {
      cctx.font = size + "px VT323, 'IBM Plex Mono', monospace";
      cctx.textAlign = align || "left";
      cctx.lineWidth = size * 0.14; cctx.strokeStyle = "rgba(0,0,0,0.65)";
      cctx.shadowBlur = 0; cctx.strokeText(str, x, y);
      cctx.shadowColor = color === OSD_RED ? "rgba(255,90,70,0.7)" : "rgba(80,255,120,0.7)"; cctx.shadowBlur = size * 0.3;
      cctx.fillStyle = color || OSD_GREEN; cctx.fillText(str, x, y);
      cctx.shadowBlur = 0;
    }
    function until(u) { if (u > t && (!osd.next || u < osd.next)) osd.next = u; return u > t; }

    if (state.dragging) {
      cctx.fillStyle = "rgba(0,0,0,0.55)"; cctx.fillRect(0, 0, W, H);
      text("INSERT IMAGE", W / 2, H / 2 - fs * 1.1, Math.round(fs * 1.5), "center");
      text("RELEASE TO LOAD", W / 2, H / 2 + fs * 0.6, fs, "center");
      return;
    }
    if (until(osd.ch)) {
      text("CH " + (CHANNELS.indexOf(S.channel) + 1), x1 - pad, y0 + pad, Math.round(fs * 1.5), "right");
      text(CH_NAME[S.channel], x1 - pad, y0 + pad + fs * 1.55, fs, "right");
    }
    var baseY = y1 - pad - fs;
    if (osd.bar && until(osd.barUntil)) {
      var b = osd.bar, segs = 24, on = Math.round((b.value - b.min) / (b.max - b.min) * segs);
      var bx = x0 + pad, bw = (x1 - x0 - pad * 2), sw = bw / segs;
      text(b.label, bx, baseY - fs * 1.05, fs);
      text(b.text, x1 - pad, baseY - fs * 1.05, fs, "right");
      cctx.shadowColor = "rgba(80,255,120,0.6)"; cctx.shadowBlur = fs * 0.25;
      for (var i = 0; i < segs; i++) {
        cctx.fillStyle = i < on ? OSD_GREEN : "rgba(125,255,149,0.18)";
        cctx.fillRect(bx + i * sw + sw * 0.12, baseY + fs * 0.15, sw * 0.76, fs * 0.6);
      }
      cctx.shadowBlur = 0;
      baseY -= fs * 2.3;
    }
    if (osd.msg && until(osd.msgUntil)) text(osd.msg, x0 + pad, baseY, fs, "left", osd.msgErr ? OSD_RED : OSD_GREEN);
  }

  // ---------- Picture ----------
  function renderOutput() {
    if (!state.img || !state.img.complete || !state.img.naturalWidth) return;
    var r = E.render(state.img, S.channel, {
      cols: S.cols[S.channel], bright: S.bright, contrast: S.contrast,
      ramp: S.ramp, asciiBg: S.asciiBg, asciiColor: S.asciiColor, asciiInvert: S.asciiInvert,
      palette: S.palette, pixelDither: S.pixelDither, pixelGrid: S.pixelGrid,
      dither: S.dither, threshold: S.threshold, inks: S.inks
    }, out);
    state.text = r.text; state.size = r.cols + " × " + r.rows; state.smooth = r.smooth;
    if (osd.bar && osd.bar.kind === "detail") osd.bar.text = state.size;
    screenEl.setAttribute("aria-label", CH_NAME[S.channel] + " version of " + state.label + ", " + r.meta);
    updateGlow();
    dirty.comp = true;
  }

  // The room picks up the screen's average colour.
  var g1 = document.createElement("canvas"); g1.width = g1.height = 1;
  var g1x = g1.getContext("2d", { willReadFrequently: true });
  function updateGlow() {
    g1x.clearRect(0, 0, 1, 1); g1x.drawImage(out, 0, 0, 1, 1);
    var d = g1x.getImageData(0, 0, 1, 1).data, mx = Math.max(d[0], d[1], d[2], 1), k = mx < 170 ? 170 / mx : 1;
    document.documentElement.style.setProperty("--glow-rgb", Math.round(d[0] * k) + " " + Math.round(d[1] * k) + " " + Math.round(d[2] * k));
  }

  // ---------- Power and static ----------
  var anim = null, burstA = 0, burstEnd = 0, burstDur = 1;
  function burst(amp, dur) { if (reduce.matches || !state.power) return; burstA = amp; burstDur = dur; burstEnd = now() + dur; }
  function ease(q) { return 1 - Math.pow(1 - q, 3); }
  function powerFrame(t) {
    if (anim) {
      var k = (t - anim.start) / anim.dur;
      if (k >= 1) anim = null;
      else if (anim.on) {
        if (k < 0.15) return { sx: Math.max(0.02, ease(k / 0.15)), sy: 0.006, flash: 1, noise: 0 };
        if (k < 0.45) { var q = (k - 0.15) / 0.3; return { sx: 1, sy: 0.006 + ease(q) * 0.994, flash: 1 - q, noise: 0.6 }; }
        return { sx: 1, sy: 1, flash: 0, noise: 0.6 * (1 - (k - 0.45) / 0.55) };
      } else {
        if (k < 0.4) { var a = k / 0.4; return { sx: 1, sy: 1 - a * a * 0.994, flash: a, noise: 0 }; }
        if (k < 0.8) return { sx: 1 - (k - 0.4) / 0.4 * 0.99, sy: 0.006, flash: 1, noise: 0 };
        return { sx: 0.01, sy: 0.006, flash: 1 - (k - 0.8) / 0.2, noise: 0 };
      }
    }
    return state.power ? { sx: 1, sy: 1, flash: 0, noise: 0 } : { sx: 0, sy: 0, flash: 0, noise: 0 };
  }
  function setPower(on) {
    if (state.power === on) return;
    state.power = on;
    $("powerBtn").setAttribute("aria-pressed", on ? "true" : "false");
    tv.classList.toggle("is-on", on);
    if (!on && !$("menu").hidden) closeMenu(true);
    anim = reduce.matches ? null : { on: on, start: now(), dur: on ? 950 : 520 };
    if (on) { Sound.powerOn(); showChannel(reduce.matches ? 0 : 450); }
    else Sound.powerOff();
    $("live").textContent = on ? "TV on, channel " + (CHANNELS.indexOf(S.channel) + 1) + ", " + CH_NAME[S.channel] : "TV off";
    dirty.comp = true;
  }

  // ---------- Frame loop ----------
  function frame() {
    requestAnimationFrame(frame);
    var t = now();
    if (osd.next && t >= osd.next) dirty.comp = true;
    if (dirty.out) { dirty.out = false; renderOutput(); }
    if (dirty.comp) { dirty.comp = false; composite(); crt.upload(); dirty.draw = true; }
    var p = powerFrame(t);
    var burstN = t < burstEnd ? burstA * (burstEnd - t) / burstDur : 0;
    var noise = Math.max(p.noise, burstN, state.dragging ? 0.35 : 0);
    var live = !reduce.matches && state.power && S.fx !== "off";
    if (dirty.draw || anim || noise > 0 || live) {
      dirty.draw = false;
      crt.draw({ time: reduce.matches ? 0 : t / 1000, noise: noise, sx: p.sx, sy: p.sy, flash: p.flash });
    }
  }

  function resize() {
    var r = screenBox.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(64, Math.round(r.width * dpr)), h = Math.max(48, Math.round(r.height * dpr));
    var cap = 2000 / Math.max(w, h); if (cap < 1) { w = Math.round(w * cap); h = Math.round(h * cap); }
    comp.width = w; comp.height = h;
    crt.resize(w, h, r.height);
    dirty.comp = true;
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(screenBox);
  else window.addEventListener("resize", resize);

  // ---------- Knobs ----------
  function Knob(el, o) {
    var self = this;
    this.el = el; this.cap = el.querySelector(".knob-cap");
    this.min = o.min; this.max = o.max; this.step = o.step || 1; this.def = o.def;
    this.sweep = o.sweep || 270; this.dragPx = o.dragPx || 220;
    this.onChange = o.onChange; this.text = o.text || String; this.value = o.value;
    this.paint();
    var drag = null;
    el.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, v: self.value };
      el.setPointerCapture(e.pointerId); el.classList.add("dragging");
      el.focus({ preventScroll: true }); e.preventDefault();
    });
    el.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var d = (drag.y - e.clientY) + (e.clientX - drag.x);
      self.set(drag.v + d / self.dragPx * (self.max - self.min));
    });
    function end() { drag = null; el.classList.remove("dragging"); }
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", function (e) { e.preventDefault(); self.set(self.value + (e.deltaY < 0 ? 1 : -1) * self.step); }, { passive: false });
    el.addEventListener("keydown", function (e) {
      var s = self.step, big = Math.max(s, Math.round((self.max - self.min) / 10 / s) * s), v = null;
      switch (e.key) {
        case "ArrowUp": case "ArrowRight": v = self.value + s; break;
        case "ArrowDown": case "ArrowLeft": v = self.value - s; break;
        case "PageUp": v = self.value + big; break;
        case "PageDown": v = self.value - big; break;
        case "Home": v = self.min; break;
        case "End": v = self.max; break;
      }
      if (v !== null) { e.preventDefault(); e.stopPropagation(); self.set(v); }
    });
    el.addEventListener("dblclick", function () { if (self.def != null) self.set(typeof self.def === "function" ? self.def() : self.def); });
  }
  Knob.prototype.set = function (v, silent) {
    v = clamp(Math.round((v - this.min) / this.step) * this.step + this.min, this.min, this.max);
    if (v === this.value) return;
    this.value = v; this.paint();
    if (!silent) { Sound.tick(); this.onChange(v); }
  };
  Knob.prototype.setRange = function (min, max, value) { this.min = min; this.max = max; this.value = clamp(value, min, max); this.paint(); };
  Knob.prototype.paint = function () {
    var t = (this.value - this.min) / ((this.max - this.min) || 1);
    this.cap.style.transform = "rotate(" + (-this.sweep / 2 + t * this.sweep) + "deg)";
    this.el.setAttribute("aria-valuemin", this.min);
    this.el.setAttribute("aria-valuemax", this.max);
    this.el.setAttribute("aria-valuenow", this.value);
    this.el.setAttribute("aria-valuetext", this.text(this.value));
  };

  var chKnob = new Knob($("chKnob"), {
    min: 1, max: 3, step: 1, sweep: 120, dragPx: 90, value: CHANNELS.indexOf(S.channel) + 1,
    text: function (v) { return "Channel " + v + ", " + CH_NAME[CHANNELS[v - 1]]; },
    onChange: function (v) { setChannel(CHANNELS[v - 1]); }
  });
  var detailKnob = new Knob($("detailKnob"), {
    min: E.MODE_COLS[S.channel][0], max: E.MODE_COLS[S.channel][1], value: S.cols[S.channel],
    def: function () { return E.MODE_COLS[S.channel][2]; },
    text: function (v) { return v + " " + DETAIL_UNIT[S.channel].toLowerCase() + " wide"; },
    onChange: function (v) {
      S.cols[S.channel] = v; persist(); dirty.out = true;
      var r = E.MODE_COLS[S.channel];
      showBar("detail", "WIDTH · " + DETAIL_UNIT[S.channel], v, r[0], r[1], state.size);
    }
  });
  var brightKnob = new Knob($("brightKnob"), {
    min: -50, max: 50, value: S.bright, def: 0, text: signed,
    onChange: function (v) { S.bright = v; persist(); dirty.out = true; showBar("bright", "BRIGHTNESS", v, -50, 50, signed(v)); }
  });
  var contrastKnob = new Knob($("contrastKnob"), {
    min: -50, max: 100, value: S.contrast, def: 15, text: signed,
    onChange: function (v) { S.contrast = v; persist(); dirty.out = true; showBar("contrast", "CONTRAST", v, -50, 100, signed(v)); }
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-ch]"), function (el) {
    el.addEventListener("click", function () { chKnob.set(+el.dataset.ch); });
  });

  function setChannel(ch) {
    if (ch === S.channel) return;
    S.channel = ch; persist();
    var n = CHANNELS.indexOf(ch) + 1, r = E.MODE_COLS[ch];
    chKnob.set(n, true);
    detailKnob.setRange(r[0], r[1], S.cols[ch]);
    syncPanel();
    osd.bar = null;
    dirty.out = true;
    burst(0.85, 260); Sound.hiss(0.25);
    if (state.power) showChannel();
    if (!$("menu").hidden) buildMenu(null);
    $("live").textContent = "Channel " + n + ", " + CH_NAME[ch];
  }
  function syncPanel() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-ch]"), function (el) {
      el.classList.toggle("on", CHANNELS[+el.dataset.ch - 1] === S.channel);
    });
    $("copyBtn").setAttribute("aria-disabled", S.channel === "ascii" ? "false" : "true");
  }

  // ---------- On-screen menu ----------
  var menuRows = [];
  function opt(label, key) { return { label: label, choices: CHOICES[key], get: function () { return S[key]; }, set: function (v) { S[key] = v; changed(key); } }; }
  function bool(label, key) { return { label: label, choices: ONOFF, get: function () { return S[key]; }, set: function (v) { S[key] = v; changed(key); } }; }
  function action(label, fn) { return { label: label, action: fn }; }
  function changed(key) {
    persist();
    if (key === "fx") { crt.setFx(S.fx); dirty.draw = true; }
    else dirty.out = true;
  }
  function rowsFor(ch) {
    var rows = [];
    if (ch === "ascii") rows.push(opt("CHARSET", "ramp"), opt("PRINT", "asciiBg"), bool("COLOR", "asciiColor"), bool("INVERT", "asciiInvert"));
    if (ch === "pixel") rows.push(opt("PALETTE", "palette"), bool("DITHER", "pixelDither"), bool("GRID", "pixelGrid"));
    if (ch === "bit") {
      var th = []; for (var v = 10; v <= 90; v += 5) th.push([v, v + "%"]);
      rows.push(opt("DITHER", "dither"), { label: "THRESHOLD", choices: th, clamp: true, get: function () { return S.threshold; }, set: function (v) { S.threshold = v; changed("threshold"); } }, opt("INKS", "inks"));
    }
    rows.push(opt("CRT EFFECT", "fx"));
    rows.push({ label: "SOUND", choices: ONOFF, get: function () { return Sound.enabled; }, set: function (v) { if (Sound.setEnabled(v) !== v) message("SOUND NOT SUPPORTED HERE", true); } });
    if (ch === "ascii") rows.push(action("SAVE TEXT", saveText));
    rows.push(action("RESET PICTURE", resetPicture), action("EXIT", function () { closeMenu(); }));
    return rows;
  }
  function currentText(r) {
    var v = r.get();
    for (var i = 0; i < r.choices.length; i++) if (r.choices[i][0] === v) return r.choices[i][1];
    return String(v);
  }
  function buildMenu(focusIndex) {
    var list = $("menuList");
    menuRows = rowsFor(S.channel);
    list.innerHTML = "";
    $("menuTitle").textContent = "PICTURE · CH " + (CHANNELS.indexOf(S.channel) + 1) + " " + CH_NAME[S.channel];
    menuRows.forEach(function (r, i) {
      var li = document.createElement("li"), b = document.createElement("button"), l = document.createElement("span");
      b.type = "button"; b.className = "menu-item"; b.dataset.i = i;
      l.textContent = r.label; b.appendChild(l);
      if (r.choices) {
        var v = document.createElement("span"); v.className = "menu-val";
        v.innerHTML = '<i aria-hidden="true" data-dir="-1">◀</i><b></b><i aria-hidden="true" data-dir="1">▶</i>';
        v.querySelector("b").textContent = currentText(r);
        b.appendChild(v);
      }
      li.appendChild(b); list.appendChild(li);
    });
    if (focusIndex != null) { var items = list.querySelectorAll(".menu-item"); if (items[focusIndex]) items[focusIndex].focus(); }
  }
  function cycle(i, dir) {
    var r = menuRows[i]; if (!r || !r.choices) return;
    var n = r.choices.length, idx = 0;
    for (var k = 0; k < n; k++) if (r.choices[k][0] === r.get()) idx = k;
    idx = r.clamp ? clamp(idx + dir, 0, n - 1) : (idx + dir + n) % n;
    r.set(r.choices[idx][0]);
    Sound.tick();
    var b = $("menuList").querySelector('[data-i="' + i + '"] b'); if (b) b.textContent = currentText(r);
  }
  function openMenu() {
    if (!state.power) { Sound.press(); $("live").textContent = "Turn the TV on to open the menu"; return; }
    Sound.press();
    $("menu").hidden = false; $("menuBtn").setAttribute("aria-expanded", "true");
    buildMenu(0);
  }
  function closeMenu(keepFocus) {
    $("menu").hidden = true; $("menuBtn").setAttribute("aria-expanded", "false");
    if (!keepFocus) $("menuBtn").focus();
  }
  $("menuList").addEventListener("click", function (e) {
    var b = e.target.closest(".menu-item"); if (!b) return;
    var i = +b.dataset.i, r = menuRows[i];
    if (r.action) { Sound.press(); r.action(); return; }
    cycle(i, e.target.dataset && e.target.dataset.dir ? +e.target.dataset.dir : 1);
  });
  $("menu").addEventListener("keydown", function (e) {
    var items = Array.prototype.slice.call($("menuList").querySelectorAll(".menu-item"));
    var i = items.indexOf(document.activeElement), k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") {
      var j = i < 0 ? 0 : (i + (k === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[j].focus(); Sound.tick();
    } else if ((k === "ArrowLeft" || k === "ArrowRight") && i >= 0) {
      cycle(i, k === "ArrowRight" ? 1 : -1);
    } else if (k === "Escape" || k.toLowerCase() === "m") {
      closeMenu();
    } else return;
    e.preventDefault(); e.stopPropagation();
  });

  // ---------- Image input ----------
  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) { message("NOT AN IMAGE · TRY JPG PNG WEBP GIF", true); return; }
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = url; state.img = img;
      state.name = (file.name || "pasted-image").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").slice(0, 60) || "image";
      state.label = file.name || "the pasted image";
      if (!state.power) setPower(true);
      dirty.out = true;
      burst(0.7, 380); Sound.hiss(0.35);
      message("LOADED · " + state.name.toUpperCase().slice(0, 22));
    };
    img.onerror = function () { URL.revokeObjectURL(url); message("COULDN'T READ THAT IMAGE", true); };
    img.src = url;
  }
  $("file").addEventListener("change", function (e) { loadFile(e.target.files[0]); e.target.value = ""; });

  var dragDepth = 0;
  function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, "Files") >= 0; }
  function setDragging(v) { if (state.dragging === v) return; state.dragging = v; tv.classList.toggle("is-dragging", v); dirty.comp = true; }
  document.addEventListener("dragenter", function (e) { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; setDragging(true); });
  document.addEventListener("dragover", function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  document.addEventListener("dragleave", function (e) { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) setDragging(false); });
  document.addEventListener("drop", function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; setDragging(false);
    loadFile(e.dataTransfer.files[0]);
  });
  document.addEventListener("paste", function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) { if (items[i].type.indexOf("image") === 0) { loadFile(items[i].getAsFile()); return; } }
  });

  // ---------- Output ----------
  function download(blob, filename) {
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function stamp() { return state.name + "-" + S.channel; }
  function savePng() {
    Sound.press();
    if (out.width < 2) return;
    out.toBlob(function (blob) {
      if (!blob) { message("COULDN'T MAKE THE PNG · LOWER THE WIDTH", true); return; }
      download(blob, stamp() + ".png");
      message("SAVED " + stamp().toUpperCase().slice(0, 20) + ".PNG");
    }, "image/png");
  }
  function saveText() {
    if (S.channel !== "ascii") return;
    download(new Blob([state.text + "\n"], { type: "text/plain" }), stamp() + ".txt");
    message("SAVED " + stamp().toUpperCase().slice(0, 20) + ".TXT");
  }
  function copyText() {
    Sound.press();
    if (S.channel !== "ascii") { message("COPY WORKS ON CH 1 · ASCII"); return; }
    var lines = state.text.split("\n").length;
    var fail = function () { message("COPY BLOCKED · USE MENU > SAVE TEXT", true); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(state.text).then(function () { message("COPIED " + lines + " LINES"); }, fail);
    } else fail();
  }
  function resetPicture() {
    S.bright = 0; S.contrast = 15; S.threshold = 50; persist();
    brightKnob.set(0, true); contrastKnob.set(15, true);
    dirty.out = true; message("PICTURE RESET");
    if (!$("menu").hidden) buildMenu(null);
  }

  // ---------- Buttons and keys ----------
  $("powerBtn").addEventListener("click", function () { Sound.press(); setPower(!state.power); });
  $("menuBtn").addEventListener("click", function () { if ($("menu").hidden) openMenu(); else { Sound.press(); closeMenu(); } });
  $("saveBtn").addEventListener("click", savePng);
  $("copyBtn").addEventListener("click", copyText);

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (!$("menu").hidden) { if (k === "escape" || k === "m") { e.preventDefault(); closeMenu(); } return; }
    var tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (k === "1" || k === "2" || k === "3") chKnob.set(+k);
    else if (k === "m") openMenu();
    else if (k === "p") { Sound.press(); setPower(!state.power); }
    else if (k === "o") $("file").click();
    else if (k === "s") savePng();
    else if (k === "c") copyText();
    else return;
    e.preventDefault();
  });

  // ---------- Start ----------
  syncPanel();
  resize();
  requestAnimationFrame(frame);
  state.img = E.makeSample();
  state.img.onload = function () {
    var go = function () { dirty.out = true; setPower(true); };
    var fonts = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load(E.FONT_PX + "px 'IBM Plex Mono'"), document.fonts.load("20px VT323")])
      : Promise.resolve();
    fonts.then(go, go);
  };
})();
