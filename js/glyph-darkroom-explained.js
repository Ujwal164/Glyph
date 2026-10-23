(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // ---- Shrink figure: big grid -> small grid (shades from a soft sphere) ----
  function shade(x, y, w, h) {
    var dx = (x + 0.5) / w - 0.45, dy = (y + 0.5) / h - 0.4;
    var d = Math.sqrt(dx * dx + dy * dy * 1.6);
    return Math.max(0, Math.min(1, 1 - d * 1.7));
  }
  var big = $("bigGrid");
  for (var y = 0; y < 18; y++) for (var x = 0; x < 24; x++) {
    var v = shade(x, y, 24, 18), c = Math.round(30 + v * 210);
    el("rect", { x: 20 + x * 10, y: 40 + y * 10, width: 10, height: 10, style: "fill:rgb(" + c + "," + Math.round(c * 0.75) + "," + Math.round(c * 0.55) + ")" }, big);
  }
  var small = $("smallGrid");
  for (var sy = 0; sy < 6; sy++) for (var sx = 0; sx < 12; sx++) {
    var sv = shade(sx * 2, sy * 3, 24, 18), sc = Math.round(30 + sv * 210);
    el("rect", { x: 384 + sx * 16, y: 82 + sy * 16, width: 16, height: 16, style: "fill:rgb(" + sc + "," + Math.round(sc * 0.75) + "," + Math.round(sc * 0.55) + ")", "class": "cellg" }, small);
  }

  // ---- Luminance lab ----
  var RAMP = " .:-=+*#%@";
  var rampEl = $("ramp");
  var cells = RAMP.split("").map(function (ch, i) {
    var s = document.createElement("span"); s.textContent = ch === " " ? "␣" : ch; s.title = "position " + i;
    rampEl.appendChild(s); return s;
  });
  function lab() {
    var r = +$("rR").value, g = +$("rG").value, b = +$("rB").value;
    $("oR").textContent = r; $("oG").textContent = g; $("oB").textContent = b;
    $("sw").style.background = "rgb(" + r + "," + g + "," + b + ")";
    var L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    var idx = Math.min(RAMP.length - 1, Math.floor(L * RAMP.length));
    $("math").innerHTML = "0.21×" + r + " + 0.72×" + g + " + 0.07×" + b + "<br>= <b>" + (L * 255).toFixed(1) + "</b> of 255 → <b>" + Math.round(L * 100) + "%</b> bright";
    cells.forEach(function (c, i) { c.classList.toggle("on", i === idx); });
    $("rampIdx").textContent = Math.round(L * 100) + "% × " + RAMP.length + " letters = position " + idx + " → \"" + (RAMP[idx] === " " ? "space" : RAMP[idx]) + "\"";
  }
  ["rR", "rG", "rB"].forEach(function (id) { $(id).addEventListener("input", lab); });
  lab();

  // ---- Dither strips (same maths as the app) ----
  var W = 100, H = 24;
  function gradient() { var L = new Float32Array(W * H); for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) L[y * W + x] = x / (W - 1); return L; }
  function add(L, x, y, v) { if (x >= 0 && x < W && y < H) L[y * W + x] += v; }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function dither(method) {
    var L = gradient(), bits = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var p = y * W + x, v = L[p], on;
      if (method === "bay") on = v > (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
      else on = v > 0.5;
      bits[p] = on ? 1 : 0;
      var err = v - (on ? 1 : 0);
      if (method === "fs") { add(L, x + 1, y, err * 7 / 16); add(L, x - 1, y + 1, err * 3 / 16); add(L, x, y + 1, err * 5 / 16); add(L, x + 1, y + 1, err / 16); }
      if (method === "atk") { var e = err / 8; add(L, x + 1, y, e); add(L, x + 2, y, e); add(L, x - 1, y + 1, e); add(L, x, y + 1, e); add(L, x + 1, y + 1, e); add(L, x, y + 2, e); }
    }
    return bits;
  }
  function paint(id, fn) {
    var c = $(id), ctx = c.getContext("2d"), s = c.width / W;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) { ctx.fillStyle = fn(x, y); ctx.fillRect(x * s, y * s, s, s); }
  }
  paint("d-src", function (x) { var g = Math.round(x / (W - 1) * 255); return "rgb(" + g + "," + g + "," + g + ")"; });
  [["d-none", "none"], ["d-fs", "fs"], ["d-atk", "atk"], ["d-bay", "bay"]].forEach(function (pair) {
    var bits = dither(pair[1]);
    paint(pair[0], function (x, y) { return bits[y * W + x] ? "#f7f7f2" : "#111111"; });
  });

  // ---- Kernel diagrams ----
  function kernel(id, cols, rows, me, weights, labelFn) {
    var g = $(id), size = 40, ox = (230 - cols * size) / 2, oy = (130 - rows * size) / 2;
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var key = x + "," + y, w = weights[key];
      var cls = (x === me[0] && y === me[1]) ? "cell-me" : (w !== undefined ? "cell-hot" : "cell-w");
      el("rect", { x: ox + x * size, y: oy + y * size, width: size - 3, height: size - 3, rx: 5, "class": cls }, g);
      var label = labelFn ? labelFn(x, y) : (w !== undefined ? w : "");
      if (label !== "") {
        var t = el("text", { x: ox + x * size + (size - 3) / 2, y: oy + y * size + (size - 3) / 2 + 4, "text-anchor": "middle", "class": "tc-p" }, g);
        t.textContent = label;
      }
    }
  }
  kernel("k-fs", 3, 2, [1, 0], { "2,0": "7/16", "0,1": "3/16", "1,1": "5/16", "2,1": "1/16" });
  kernel("k-atk", 4, 3, [1, 0], { "2,0": "1/8", "3,0": "1/8", "0,1": "1/8", "1,1": "1/8", "2,1": "1/8", "1,2": "1/8" });
  var BM = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  (function () {
    var g = $("k-bay"), size = 28, ox = (230 - 4 * size) / 2, oy = (130 - 4 * size) / 2;
    for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
      var v = BM[y * 4 + x];
      el("rect", { x: ox + x * size, y: oy + y * size, width: size - 2, height: size - 2, rx: 4, "class": "cell-w", style: "fill-opacity:1" }, g);
      var t = el("text", { x: ox + x * size + (size - 2) / 2, y: oy + y * size + (size - 2) / 2 + 4, "text-anchor": "middle", "class": "tc" }, g);
      t.textContent = v;
    }
  })();

  // ---- Palette match row ----
  var PICO = ["#000000","#1d2b53","#7e2553","#008751","#ab5236","#5f574f","#c2c3c7","#fff1e8","#ff004d","#ffa300","#ffec27","#00e436","#29adff","#83769c","#ff77a8","#ffccaa"];
  var px = [232, 128, 60];
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  var dists = PICO.map(function (h) { var c = rgb(h), dr = px[0] - c[0], dg = px[1] - c[1], db = px[2] - c[2]; return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11); });
  var best = dists.indexOf(Math.min.apply(null, dists));
  var row = $("palRow");
  PICO.forEach(function (h, i) {
    var x = 200 + i * 40, isBest = i === best;
    el("rect", { x: x, y: isBest ? 58 : 66, width: 34, height: isBest ? 64 : 48, rx: 6, style: "fill:" + h, stroke: isBest ? "currentColor" : "none", "stroke-width": isBest ? 3 : 0, "class": isBest ? "" : "" }, row);
    var t = el("text", { x: x + 17, y: 144, "text-anchor": "middle", "class": isBest ? "tc-p" : "tm" }, row);
    t.textContent = Math.round(dists[i]);
  });
  var lbl = el("text", { x: 200 + best * 40 + 17, y: 48, "text-anchor": "middle", "class": "tc-p" }, row);
  lbl.textContent = "closest";
})();
