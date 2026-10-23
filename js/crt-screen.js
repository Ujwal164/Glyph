// CRT screen: draws a source canvas through a WebGL shader (curved glass, scanlines,
// shadow mask, colour fringing, glow, static). Falls back to plain 2D when WebGL is missing.
(function () {
  "use strict";

  var FX = {
    full:  { curve: 0.06, scan: 0.45, mask: 0.28, aberr: 1.4, grain: 0.035, vig: 0.55, glow: 0.22, roll: 0.035 },
    light: { curve: 0.03, scan: 0.2,  mask: 0.1,  aberr: 0.5, grain: 0.015, vig: 0.35, glow: 0.1,  roll: 0.015 },
    off:   { curve: 0,    scan: 0,    mask: 0,    aberr: 0,   grain: 0,     vig: 0,    glow: 0,    roll: 0 }
  };

  var VERT = "attribute vec2 aPos; varying vec2 vUv;" +
    "void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }";

  var FRAG = [
    "precision mediump float;",
    "varying vec2 vUv;",
    "uniform sampler2D uTex;",
    "uniform vec2 uRes, uScale;",
    "uniform float uTime, uCurve, uScan, uLines, uMask, uAberr, uGrain, uNoise, uVig, uGlow, uRoll, uFlash;",
    "float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }",
    "vec3 tex(vec2 p){ return texture2D(uTex, p).rgb; }",
    "void main(){",
    // barrel distortion
    "  vec2 c = vUv * 2.0 - 1.0;",
    "  c *= 1.0 + (c.yx * c.yx) * uCurve;",
    "  vec2 uv = c * 0.5 + 0.5;",
    "  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }",
    // power on/off squeezes the picture toward the centre
    "  vec2 p = (uv - 0.5) / max(uScale, vec2(0.0001)) + 0.5;",
    "  vec3 col = vec3(0.0);",
    "  if (p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0) {",
    "    float a = uAberr / uRes.x;",
    "    col = vec3(tex(p + vec2(a, 0.0)).r, tex(p).g, tex(p - vec2(a, 0.0)).b);",
    "    vec2 o = 2.5 / uRes;",
    "    vec3 blur = (tex(p + vec2(o.x, 0.0)) + tex(p - vec2(o.x, 0.0)) + tex(p + vec2(0.0, o.y)) + tex(p - vec2(0.0, o.y))) * 0.25;",
    "    col += blur * uGlow + uFlash;",
    "  }",
    // scanlines, brightness compensated
    "  float s = 0.5 + 0.5 * cos(uv.y * uLines * 6.28318);",
    "  col *= (1.0 - uScan * (1.0 - s)) * (1.0 + uScan * 0.35);",
    // aperture-grille shadow mask
    "  float m = mod(gl_FragCoord.x, 3.0);",
    "  vec3 mask = m < 1.0 ? vec3(1.0, 0.75, 0.75) : (m < 2.0 ? vec3(0.75, 1.0, 0.75) : vec3(0.75, 0.75, 1.0));",
    "  col *= mix(vec3(1.0), mask * 1.15, uMask);",
    // slow rolling bright band
    "  float band = fract(uv.y * 0.6 - uTime * 0.07);",
    "  col *= 1.0 + uRoll * smoothstep(0.0, 0.1, band) * smoothstep(0.25, 0.1, band);",
    // grain and static
    "  float n = hash(gl_FragCoord.xy + floor(uTime * 60.0) * 17.0);",
    "  col += (n - 0.5) * uGrain;",
    "  col = mix(col, vec3(n), uNoise);",
    // vignette
    "  vec2 v = uv * (1.0 - uv.yx);",
    "  col *= mix(1.0, clamp(pow(v.x * v.y * 18.0, 0.22), 0.0, 1.0), uVig);",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  var UNIFORMS = ["uTex", "uRes", "uScale", "uTime", "uCurve", "uScan", "uLines", "uMask", "uAberr", "uGrain", "uNoise", "uVig", "uGlow", "uRoll", "uFlash"];

  function CRTScreen(canvas, source) {
    this.canvas = canvas; this.source = source;
    this.fx = FX.full; this.lines = 240;
    var gl = null;
    try { gl = canvas.getContext("webgl", { alpha: false, antialias: false }) || canvas.getContext("experimental-webgl"); } catch (e) { gl = null; }
    if (gl && this._setup(gl)) {
      this.gl = gl;
      var self = this;
      canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); });
      canvas.addEventListener("webglcontextrestored", function () { self._setup(gl); self.upload(); });
    } else {
      // A canvas that already has a (broken) WebGL context can't give a 2D one, so swap in a fresh canvas.
      if (gl) { var fresh = canvas.cloneNode(false); canvas.parentNode.replaceChild(fresh, canvas); this.canvas = fresh; }
      this.gl = null;
      this.ctx = this.canvas.getContext("2d");
      this.noiseCanvas = document.createElement("canvas"); this.noiseCanvas.width = 160; this.noiseCanvas.height = 120;
    }
    this.fallback = !this.gl;
  }

  CRTScreen.prototype._setup = function (gl) {
    function compile(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    }
    var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.u = {};
    for (var i = 0; i < UNIFORMS.length; i++) this.u[UNIFORMS[i]] = gl.getUniformLocation(prog, UNIFORMS[i]);
    gl.uniform1i(this.u.uTex, 0);
    return true;
  };

  CRTScreen.prototype.setFx = function (name) { this.fx = FX[name] || FX.full; };

  // w, h in device pixels; cssHeight sets how many scanlines are drawn
  CRTScreen.prototype.resize = function (w, h, cssHeight) {
    this.canvas.width = w; this.canvas.height = h;
    this.lines = Math.max(120, Math.min(400, cssHeight / 2.4));
  };

  CRTScreen.prototype.upload = function () {
    var gl = this.gl; if (!gl) return;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.source);
  };

  // p: { time, noise, sx, sy, flash }
  CRTScreen.prototype.draw = function (p) {
    if (this.fallback) return this._draw2d(p);
    var gl = this.gl, u = this.u, fx = this.fx, w = this.canvas.width, h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.uRes, w, h);
    gl.uniform2f(u.uScale, p.sx, p.sy);
    gl.uniform1f(u.uTime, p.time % 1000);
    gl.uniform1f(u.uCurve, fx.curve);
    gl.uniform1f(u.uScan, fx.scan);
    gl.uniform1f(u.uLines, this.lines);
    gl.uniform1f(u.uMask, fx.mask);
    gl.uniform1f(u.uAberr, fx.aberr * (window.devicePixelRatio || 1));
    gl.uniform1f(u.uGrain, fx.grain);
    gl.uniform1f(u.uNoise, p.noise);
    gl.uniform1f(u.uVig, fx.vig);
    gl.uniform1f(u.uGlow, fx.glow);
    gl.uniform1f(u.uRoll, p.time ? fx.roll : 0);
    gl.uniform1f(u.uFlash, p.flash);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  CRTScreen.prototype._draw2d = function (p) {
    var c = this.ctx, w = this.canvas.width, h = this.canvas.height;
    c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
    if (p.sx > 0.001 && p.sy > 0.001) {
      c.save();
      c.translate(w / 2, h / 2); c.scale(p.sx, p.sy);
      c.drawImage(this.source, -w / 2, -h / 2, w, h);
      if (p.flash > 0) { c.globalAlpha = Math.min(1, p.flash); c.fillStyle = "#fff"; c.fillRect(-w / 2, -h / 2, w, h); }
      c.restore();
    }
    if (p.noise > 0.02) {
      var nc = this.noiseCanvas, nx = nc.getContext("2d"), img = nx.createImageData(nc.width, nc.height), d = img.data;
      for (var i = 0; i < d.length; i += 4) { var v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      nx.putImageData(img, 0, 0);
      c.globalAlpha = p.noise; c.drawImage(nc, 0, 0, w, h); c.globalAlpha = 1;
    }
  };

  window.CRTScreen = CRTScreen;
})();
