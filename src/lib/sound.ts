/* Крошечный WebAudio-синтезатор для игровых блипов */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean) {
  enabled = on;
}
export function soundOn() {
  return enabled;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  vol = 0.16,
  delay = 0,
  slideTo?: number,
) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, vol = 0.1, delay = 0) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g).connect(c.destination);
  src.start(t0);
}

export function play(kind: string) {
  switch (kind) {
    case 'click':
      tone(660, 0.06, 'triangle', 0.08);
      break;
    case 'deal':
      noise(0.09, 0.14);
      tone(1500, 0.05, 'triangle', 0.05, 0.01);
      break;
    case 'shuffle':
      noise(0.16, 0.12);
      noise(0.12, 0.1, 0.09);
      break;
    case 'start':
      noise(0.16, 0.12);
      [392, 523, 659].forEach((f, i) => tone(f, 0.14, 'triangle', 0.1, 0.05 + i * 0.07));
      break;
    case 'chip':
      tone(1900, 0.05, 'square', 0.05);
      tone(2500, 0.06, 'square', 0.05, 0.05);
      break;
    case 'bet':
      tone(980, 0.07, 'triangle', 0.1);
      tone(1240, 0.08, 'triangle', 0.08, 0.06);
      break;
    case 'fold':
      tone(300, 0.12, 'sine', 0.1, 0, 180);
      break;
    case 'hit':
      tone(160, 0.14, 'sawtooth', 0.14, 0, 90);
      noise(0.08, 0.12, 0.01);
      break;
    case 'transfer':
      tone(500, 0.2, 'sine', 0.12, 0, 1100);
      break;
    case 'take':
      tone(240, 0.25, 'sawtooth', 0.12, 0, 120);
      break;
    case 'bito':
      tone(520, 0.1, 'triangle', 0.1);
      tone(780, 0.12, 'triangle', 0.1, 0.08);
      break;
    case 'turn':
      tone(880, 0.08, 'sine', 0.07);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, i * 0.09));
      break;
    case 'bigwin':
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'triangle', 0.13, i * 0.1));
      noise(0.3, 0.05, 0.5);
      break;
    case 'lose':
      [330, 262, 196].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.09, i * 0.13));
      break;
    case 'join':
      tone(700, 0.08, 'sine', 0.09);
      tone(1050, 0.1, 'sine', 0.09, 0.07);
      break;
    case 'leave':
      tone(700, 0.1, 'sine', 0.08);
      tone(420, 0.14, 'sine', 0.08, 0.08);
      break;
    case 'error':
      tone(180, 0.2, 'square', 0.1);
      tone(140, 0.24, 'square', 0.1, 0.1);
      break;
    default:
      break;
  }
}
