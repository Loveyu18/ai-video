// 程式生成配樂：node tools/music.mjs [輸出.wav]   預設 output/music.wav
//   溫暖的環境音樂：和弦鋪底（pad）＋ 類鋼琴分解和弦 ＋ 低音 ＋ 殘響，長度 = layout.VIDEO.duration。
//   不用任何音檔或取樣，全部用數學合成；固定種子，每次產生的音樂一模一樣。
//   想換成自己的音樂：把檔案放在 output/music.wav（或用 render.mjs --music=路徑）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO } from '../layout.js';
import { rngFor } from '../rng.js';

const SR = 44100;
const BPM = 68;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// C 大調、溫暖的和弦進行（MIDI 音高）：Fmaj9 → Em7 → Dm9 → Cmaj7(add9) → Am9 → Fmaj7 → G6sus → Cmaj9
const CHORDS = [
  [53, 57, 60, 64, 67], [52, 55, 59, 62, 67], [50, 53, 57, 60, 64], [48, 55, 59, 62, 64],
  [45, 52, 55, 59, 60], [53, 57, 60, 64, 69], [55, 60, 62, 64, 69], [48, 55, 59, 62, 64],
];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

export function generateMusic(outPath = 'output/music.wav') {
  const dur = VIDEO.duration;
  const n = Math.round(dur * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const rng = rngFor('music');

  const add = (buf, i, v) => { if (i >= 0 && i < n) buf[i] += v; };

  // —— 和弦鋪底：每個和弦兩聲部微失諧、慢起慢收，彼此交疊 ——
  const chordAt = (bar) => CHORDS[bar % CHORDS.length];
  const bars = Math.ceil(dur / BAR) + 1;
  for (let b = 0; b < bars; b++) {
    const t0 = b * BAR - 0.8, t1 = (b + 1) * BAR + 1.6;
    const notes = chordAt(b);
    for (const [k, m] of notes.entries()) {
      const f = hz(m + (k === 0 ? 0 : 12));     // 往上一個八度，比較亮
      const pan = (k / (notes.length - 1)) * 0.8 - 0.4;
      for (const det of [-0.0025, 0.0025]) {
        const ff = f * (1 + det);
        const ph = rng.next() * Math.PI * 2;
        const s0 = Math.max(0, Math.floor(t0 * SR)), s1 = Math.min(n, Math.floor(t1 * SR));
        for (let i = s0; i < s1; i++) {
          const t = i / SR;
          const env = Math.min(1, (t - t0) / 1.6) * Math.min(1, (t1 - t) / 2.0);
          const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * ff * t + ph));
          const v = (0.75 * Math.sin(2 * Math.PI * ff * t + ph) + 0.25 * tri) * env * 0.018;
          L[i] += v * (1 - pan); R[i] += v * (1 + pan);
        }
      }
    }
    // 低音：和弦根音低八度
    const fb = hz(notes[0] - 12);
    const s0 = Math.max(0, Math.floor((b * BAR) * SR)), s1 = Math.min(n, Math.floor(((b + 1) * BAR + 0.5) * SR));
    for (let i = s0; i < s1; i++) {
      const t = i / SR - b * BAR;
      const env = Math.min(1, t / 0.08) * Math.exp(-t * 0.35) * Math.min(1, (s1 / SR - i / SR) / 0.5);
      const v = Math.sin(2 * Math.PI * fb * (i / SR)) * env * 0.09;
      L[i] += v; R[i] += v;
    }
  }

  // —— 類鋼琴分解和弦：八分音符，依固定種子挑音與力度；開頭與結尾留白 ——
  const piano = (t0, m, vel, pan) => {
    const f = hz(m);
    const len = 3.2;
    const s0 = Math.floor(t0 * SR), s1 = Math.min(n, s0 + Math.floor(len * SR));
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      const env = Math.min(1, t / 0.004) * Math.exp(-t * 1.6);
      const w = 2 * Math.PI * f * t;
      const v = (Math.sin(w) + 0.35 * Math.sin(2 * w) * Math.exp(-t * 2.5) + 0.12 * Math.sin(3 * w) * Math.exp(-t * 4)) * env * vel;
      add(L, i, v * (1 - pan)); add(R, i, v * (1 + pan));
    }
  };
  const pr = rng.fork('piano');
  for (let b = 1; b * BAR < dur - 4; b++) {
    const notes = chordAt(b);
    for (let e = 0; e < 8; e++) {
      const t = b * BAR + e * (BEAT / 2);
      if (!pr.chance(e === 0 ? 0.95 : 0.42)) continue;
      const m = pr.pick(notes) + 12 + (pr.chance(0.25) ? 12 : 0);
      piano(t + pr.range(0, 0.015), m, pr.range(0.035, 0.07), pr.range(-0.5, 0.5));
    }
  }

  // —— 殘響：Schroeder（4 個梳狀 + 2 個全通），左右聲道延遲不同，製造空間感 ——
  const reverb = (x, offset) => {
    const out = new Float32Array(n);
    for (const [d, g] of [[1557, 0.84], [1617, 0.83], [1491, 0.85], [1422, 0.84]]) {
      const D = d + offset, buf = new Float32Array(D);
      let p = 0, lp = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[p];
        lp = y * 0.6 + lp * 0.4;                // 阻尼：高頻衰減較快，聲音較暖
        buf[p] = x[i] + lp * g;
        out[i] += y * 0.25;
        p = (p + 1) % D;
      }
    }
    for (const [d, g] of [[225, 0.5], [556, 0.5]]) {
      const D = d + offset, buf = new Float32Array(D);
      let p = 0;
      for (let i = 0; i < n; i++) {
        const bo = buf[p], y = -out[i] * g + bo;
        buf[p] = out[i] + bo * g;
        out[i] = y;
        p = (p + 1) % D;
      }
    }
    return out;
  };
  const rl = reverb(L, 0), rr = reverb(R, 23);

  // —— 混音、淡入淡出、正規化 ——
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fade = Math.min(1, t / 2.5) * Math.min(1, (dur - t) / 3.0);
    L[i] = (L[i] * 0.75 + rl[i] * 0.45) * fade;
    R[i] = (R[i] * 0.75 + rr[i] * 0.45) * fade;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const gain = 0.89 / (peak || 1);              // 約 -1 dBFS

  // —— 寫成 16-bit 立體聲 WAV ——
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), i * 4 + 2);
  }
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
  hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  const out = path.resolve(outPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([hdr, data]));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const t0 = Date.now();
  const out = generateMusic(process.argv[2] ?? 'output/music.wav');
  console.log(`配樂完成：${out}（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
}
