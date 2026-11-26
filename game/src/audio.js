// AERIS Ridge Runner — all sound is synthesised in code with WebAudio:
// engine hum, wind rush, ring chimes and landing thuds. No audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windGain = null;
    this.windFilter = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine: two detuned saws through a lowpass.
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.detune.value = 9;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc1.connect(engineFilter);
    this.engineOsc2.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc1.start();
    this.engineOsc2.start();
    // Wind: looped noise through a bandpass, gain follows airspeed.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    noise.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) void this.ctx.resume();
    if (this.engineGain) this.engineGain.gain.value = 0;
    if (this.windGain) this.windGain.gain.value = 0;
  }

  /** Called every frame while flying. */
  update(flight, dt) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const rpm = 38 + flight.throttle * 62 + flight.speed * 0.35;
    this.engineOsc1.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.5, t, 0.08);
    const engVol = flight.status === 'parked' ? 0.02 : 0.045 + flight.throttle * 0.05;
    this.engineGain.gain.setTargetAtTime(engVol, t, 0.1);
    const windVol = Math.min(0.16, flight.speed * 0.0016);
    this.windGain.gain.setTargetAtTime(windVol, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(500 + flight.speed * 9, t, 0.15);
    void dt;
  }

  blip(freq, dur, type = 'sine', vol = 0.16, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  ringChime() {
    this.blip(880, 0.5, 'sine', 0.18);
    this.blip(1318, 0.7, 'sine', 0.14, 0.07);
  }

  thud() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t);
    o.stop(t + 0.4);
  }

  stallBeep() {
    this.blip(620, 0.12, 'square', 0.05);
  }

  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.5, 'triangle', 0.16, i * 0.11));
  }
}
