import { store } from './core.js';

// tiny 8-bit synth; browsers only allow sound after a key press or click, which a typed command is
let audio;
export let soundOn = store.get('sound', true);
export function tone(freq, at, dur, type = 'square', vol = 0.05) {
  if (!soundOn) return;
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + at;
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
}
// startup sound: power thump, fan spin-up, POST beep, disk clicks per boot line, a chord at the end.
// Browsers block sound until the visitor clicks or types, so a fresh visit boots silently.
function sweep(f0, f1, at, dur, type = 'sawtooth', vol = 0.03) {
  if (!soundOn) return;
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(at, dur, vol = 0.03, freq = 1000, q = 1) {
  if (!soundOn) return;
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  const len = Math.ceil(audio.sampleRate * dur), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain(), t = audio.currentTime + at;
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(audio.destination); src.start(t); src.stop(t + dur + 0.02);
}
const powerOn = () => {
  sweep(140, 45, 0, 0.3, 'sine', 0.12);          // relay thump
  noise(0.05, 2.2, 0.025, 450, 0.6);            // fan spinning up
  sweep(70, 210, 0.05, 1.8, 'sawtooth', 0.008); // motor whine
  tone(1000, 0.7, 0.14, 'square', 0.04);        // POST beep
};
// a sharp tick plus a lower knock, so it sounds like a drive head seeking rather than a faint hiss
const diskClick = () => {
  noise(0, 0.035, 0.24, 3200, 2); noise(0, 0.05, 0.18, 1100, 1.5);
  if (Math.random() < 0.6) { noise(0.07, 0.03, 0.18, 2600, 2); noise(0.07, 0.04, 0.12, 900, 1.5); }
};
export const chime = at => {
  tone(130.8, at, 1.4, 'sine', 0.07);                                           // bass C3
  [261.6, 329.6, 392].forEach(f => tone(f, at + 0.05, 1.3, 'sine', 0.025));      // soft pad
  [523, 659, 784, 1047].forEach((f, i) => tone(f, at + i * 0.09, 0.35, 'triangle', 0.06));
  tone(1568, at + 0.4, 0.6, 'sine', 0.02);                                      // sparkle
};
const powerDown = () => { sweep(420, 55, 0, 0.7, 'sawtooth', 0.03); noise(0, 0.8, 0.02, 500, 0.6); };
export function bootSound(stage) {
  if (!soundOn) return;
  // no sound until the browser allows it; playing it later would not match the screen.
  // a click during the boot still lets the remaining clicks and the chime play in sync.
  const allowed = navigator.userActivation ? navigator.userActivation.hasBeenActive : true;
  if (!allowed || (audio && audio.state !== 'running')) return;
  try {
    if (stage === 'start') { powerOn(); bootSound.t = audio.currentTime; }
    if (stage === 'tick') diskClick();
    // the chord never lands before the POST beep
    if (stage === 'done') chime(Math.max(0, (bootSound.t ?? audio.currentTime) + 1.0 - audio.currentTime));
    if (stage === 'down') powerDown();
  } catch {}
}
export function setSound(on) { soundOn = on; store.set('sound', on); }
// called from a click or key press, the only moment browsers let a page start audio
export function resumeAudio() { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); }
