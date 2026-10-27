// 旁白＋混音：node tools/voice.mjs
//   1. 依 layout.CAMERA_PATH 每個鏡頭的 narration，用台灣口音神經語音（Microsoft Edge TTS，zh-TW）合成旁白
//      ※ 會把旁白文字送到微軟的語音服務；結果依「語音＋語速＋文字」快取在 output/voice/，稿子沒改就不重送
//   2. 每句放在「鏡頭開始 + lead 秒」；太長放不進鏡頭時自動加快語速重做
//   3. 與配樂（output/music.wav，沒有就用 tools/music.mjs 生成）混成 output/soundtrack.wav，
//      旁白出現時配樂自動壓低（sidechain ducking）
//   需要：python -m pip install edge-tts、ffmpeg
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMERA_PATH, VIDEO } from '../layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VOICE_DIR = path.join(ROOT, 'output', 'voice');
const MUSIC = path.join(ROOT, 'output', 'music.wav');
const OUT = path.join(ROOT, 'output', 'soundtrack.wav');
const LIPSYNC = path.join(ROOT, 'output', 'lipsync.json');

const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

function synth(text, voice, rate) {
  const key = crypto.createHash('sha1').update(`${voice}|${rate}|${text}`).digest('hex').slice(0, 12);
  const file = path.join(VOICE_DIR, `${key}.mp3`);
  if (!fs.existsSync(file)) {
    execFileSync('python', ['-m', 'edge_tts', '--voice', voice, `--rate=${rate}`, '--text', text, '--write-media', file], { stdio: 'pipe' });
  }
  return file;
}

export function buildSoundtrack() {
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  if (!fs.existsSync(MUSIC)) {
    execFileSync('node', [path.join(ROOT, 'tools', 'music.mjs'), MUSIC], { stdio: 'inherit' });
  }
  const { name: voice, rate: baseRate, lead } = VIDEO.voice;
  const base = parseInt(baseRate, 10);
  const clips = [];
  for (const shot of CAMERA_PATH) {
    if (!shot.narration) continue;
    const at = shot.start + lead;
    const room = shot.end - at - 0.25;                 // 鏡頭結束前 0.25 秒要唸完
    let rate = base, file, len;
    for (;;) {
      const r = `${rate >= 0 ? '+' : ''}${rate}%`;
      file = synth(shot.narration, voice, r);
      len = duration(file);
      if (len <= room || rate >= 12) break;            // 最多加快到 +12%，再快就不自然
      rate += 6;                                         // 太長：加快一點重做
    }
    const fit = len <= room ? '' : `  ⚠️ 超出 ${(len - room).toFixed(2)} 秒，建議縮短這句`;
    console.log(`${String(shot.start).padStart(4)}s ${shot.name.padEnd(6, '　')} ${len.toFixed(2)}s / ${room.toFixed(2)}s  語速 ${rate}%${fit}`);
    clips.push({ file, at });
  }

  // —— 嘴型資料：每句話每 1/30 秒的音量（0~1），給 guide.js 開合嘴巴 ——
  const FPS = 30;
  const env = clips.map((c) => {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', c.file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 64 * 1024 * 1024 });
    const per = Math.round(8000 / FPS);
    const values = [];
    for (let i = 0; i + 1 < pcm.length / 2; i += per) {
      let sum = 0, n = 0;
      for (let j = i; j < Math.min(i + per, pcm.length / 2); j++) { const v = pcm.readInt16LE(j * 2) / 32768; sum += v * v; n++; }
      values.push(Math.sqrt(sum / Math.max(1, n)));
    }
    return { at: c.at, values };
  });
  const peak = Math.max(...env.flatMap((e) => e.values), 1e-6);
  for (const e of env) {
    let prev = 0;
    e.values = e.values.map((v) => {
      const x = Math.min(1, Math.max(0, (v / peak - 0.06) / 0.55));   // 去掉底噪、拉開對比
      prev = prev * 0.35 + x * 0.65;                                     // 稍微平滑，嘴巴不會抖
      return Math.round(prev * 1000) / 1000;
    });
  }
  fs.writeFileSync(LIPSYNC, JSON.stringify({ fps: FPS, clips: env }));

  // —— 混音：旁白各自延遲到位 → 合成一軌 → 用它壓低配樂 → 相加 → 限幅 ——
  const inputs = ['-i', MUSIC, ...clips.flatMap((c) => ['-i', c.file])];
  const delays = clips.map((c, i) => {
    const ms = Math.round(c.at * 1000);
    return `[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms},volume=1.6[v${i}]`;
  });
  const vMix = `${clips.map((_, i) => `[v${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,apad=whole_dur=${VIDEO.duration}[voice]`;
  const graph = [
    ...delays,
    vMix,
    '[voice]asplit=2[vsc][vout]',
    '[0:a]volume=0.85[mus]',
    '[mus][vsc]sidechaincompress=threshold=0.02:ratio=8:attack=80:release=900:makeup=1[duck]',
    `[duck][vout]amix=inputs=2:normalize=0,alimiter=limit=0.9,atrim=0:${VIDEO.duration}[out]`,
  ].join(';');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]', '-ar', '44100', OUT], { stdio: 'inherit' });
  console.log(`音軌完成：${OUT}`);
  return OUT;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) buildSoundtrack();
