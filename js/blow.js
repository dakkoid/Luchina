// Blow detection through the microphone. Works on desktop and phones:
// - the AudioContext is created and resumed synchronously inside the tap/click (iOS and Chrome require it),
//   the microphone is requested right after;
// - it runs on its own timer, independent of the 3D scene (so it also works when the scene is off screen);
// - the threshold adapts to the room noise; a blow is a loud, low, noisy burst held for ~0.12 s.
export function createBlow() {
  let ctx = null, stream = null, an = null, timer = null, buf = null, fbuf = null;
  let base = .01, hold = 0, cool = 0, lvl = 0;
  const subs = new Set(), meters = new Set();

  function alive() {
    return stream && stream.getAudioTracks().some(t => t.readyState === 'live' && t.enabled) && ctx && ctx.state !== 'closed';
  }
  function tick() {
    if (!an) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    an.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    an.getFloatFrequencyData(fbuf);
    const hz = ctx.sampleRate / an.fftSize;
    let lo = 0, nl = 0, hi = 0, nh = 0;
    for (let i = 1; i < fbuf.length; i++) {
      const f = i * hz, p = Math.pow(10, fbuf[i] / 10);
      if (f < 900) { lo += p; nl++; } else if (f > 2000 && f < 7000) { hi += p; nh++; }
    }
    const lowShare = lo / nl / (lo / nl + hi / nh + 1e-12);       // blowing into a mic is mostly low rumble
    const thr = Math.max(.035, base * 5);
    const loud = rms > thr && lowShare > .6;
    lvl = Math.min(1, rms / (thr * 1.6));
    meters.forEach(f => f(lvl));
    if (!loud) base += (rms - base) * .02;                         // follow the room noise slowly
    cool = Math.max(0, cool - .03);
    hold = loud ? hold + .03 : Math.max(0, hold - .06);
    if (hold > .12 && cool === 0) { hold = 0; cool = .9; subs.forEach(f => f()); }
  }
  return {
    // call directly from a click/tap handler
    async start() {
      try {
        if (!ctx || ctx.state === 'closed') ctx = new (window.AudioContext || window.webkitAudioContext)();
        const resumed = ctx.resume();                               // inside the gesture
        if (!alive()) {
          if (stream) stream.getTracks().forEach(t => t.stop());
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
          const src = ctx.createMediaStreamSource(stream);
          an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = .2; src.connect(an);
          buf = new Float32Array(an.fftSize); fbuf = new Float32Array(an.frequencyBinCount);
          base = .01; hold = 0; cool = .5;
          stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => { an = null; }));
        }
        await resumed; await ctx.resume();
        if (!timer) timer = setInterval(tick, 30);
        return true;
      } catch (e) { console.warn('mic', e); return false; }
    },
    stop() { clearInterval(timer); timer = null; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; an = null; },
    active: () => !!timer && alive(),
    onBlow(f) { subs.add(f); return () => subs.delete(f); },
    onLevel(f) { meters.add(f); return () => meters.delete(f); },
  };
}
