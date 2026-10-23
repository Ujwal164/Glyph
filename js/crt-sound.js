// TV sounds, synthesised with the Web Audio API. Silent until the viewer turns sound on.
(function () {
  "use strict";
  var ctx = null, master = null, noise = null, enabled = false, lastTick = 0;

  function init() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.45; master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }
  function env(g, t, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function hiss(dur, peak, type, freq, q) {
    var t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; src.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    src.connect(f); f.connect(g); g.connect(master);
    env(g, t, peak, dur); src.start(t); src.stop(t + dur + 0.05);
  }
  function tone(f0, f1, dur, peak, type) {
    var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(g); g.connect(master);
    env(g, t, peak, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  function play(fn) { if (enabled && init()) fn(); }

  window.CRTSound = {
    get enabled() { return enabled; },
    setEnabled: function (v) { enabled = !!v && init(); return enabled; },
    // knob detent
    tick: function () {
      var n = performance.now(); if (n - lastTick < 30) return; lastTick = n;
      play(function () { hiss(0.018, 0.22, "highpass", 2500); });
    },
    // push button
    press: function () { play(function () { tone(180, 90, 0.08, 0.35); hiss(0.03, 0.12, "bandpass", 1500, 1.2); }); },
    // channel change / new image
    hiss: function (dur) { play(function () { hiss(dur, 0.16, "bandpass", 3800, 0.5); }); },
    powerOn: function () { play(function () { tone(70, 40, 0.5, 0.3, "triangle"); hiss(0.7, 0.1, "highpass", 5000); }); },
    powerOff: function () { play(function () { tone(220, 30, 0.35, 0.25); }); }
  };
})();
