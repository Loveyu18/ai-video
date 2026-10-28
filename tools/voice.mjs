// 旁白＋混音：node tools/voice.mjs [--edge]
//   1. 依 layout.CAMERA_PATH 每個鏡頭的 narration 合成旁白：
//      - 有 voice-ref/ref.wav（本人錄音）→ F5-TTS 在本機複製本人音色（tools/clone_voice.py）
//      - 否則用台灣口音神經語音（Microsoft Edge TTS，zh-TW）；※ 會把旁白文字送到微軟的語音服務
//      結果都快取在 output/voice/，稿子沒改就不重做
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

// 本人聲音：有 voice-ref/ref.wav（本人錄音，不進 git）就用 F5-TTS 在本機複製音色，沒有就用 Edge 線上語音
//   F5TTS_PYTHON：裝了 f5-tts 的 Python（預設 D:\tmp\f5tts）；--edge 強制用 Edge 語音
const REF = path.join(ROOT, 'voice-ref', 'ref.wav');
const REF_TEXT = path.join(ROOT, 'voice-ref', 'ref.txt');
const F5_PYTHON = process.env.F5TTS_PYTHON ?? 'D:/tmp/f5tts/Scripts/python.exe';
const useClone = () => !process.argv.includes('--edge') && fs.existsSync(REF) && fs.existsSync(F5_PYTHON);

/** 合成一批句子 [{text, rate}] → 檔案路徑；結果依「引擎＋聲音＋語速＋文字」快取 */
function synthBatch(items, voice) {
  const clone = useClone();
  const refKey = clone ? crypto.createHash('sha1').update(fs.readFileSync(REF)).update(fs.existsSync(REF_TEXT) ? fs.readFileSync(REF_TEXT) : '').digest('hex').slice(0, 8) : '';
  const files = items.map(({ text, rate }) => {
    const id = clone ? `clone:${refKey}` : voice;
    const key = crypto.createHash('sha1').update(`${id}|${rate}|${text}`).digest('hex').slice(0, 12);
    return path.join(VOICE_DIR, `${key}.${clone ? 'wav' : 'mp3'}`);
  });
  const todo = items.map((it, i) => ({ ...it, out: files[i] })).filter((j) => !fs.existsSync(j.out));
  if (!todo.length) return files;
  if (clone) {
    const cfg = path.join(VOICE_DIR, 'jobs.json');
    fs.writeFileSync(cfg, JSON.stringify({
      ref: REF,
      ref_text: fs.existsSync(REF_TEXT) ? fs.readFileSync(REF_TEXT, 'utf8') : '',
      jobs: todo.map((j) => ({ text: j.text, speed: 1 + parseInt(j.rate, 10) / 100, out: j.out })),
    }));
    console.log(`本人聲音合成 ${todo.length} 句（F5-TTS，CPU 比較慢）…`);
    execFileSync(F5_PYTHON, [path.join(ROOT, 'tools', 'clone_voice.py'), cfg], { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  } else {
    for (const j of todo) {
      execFileSync('python', ['-m', 'edge_tts', '--voice', voice, `--rate=${j.rate}`, '--text', j.text, '--write-media', j.out], { stdio: 'pipe' });
    }
  }
  return files;
}

export function buildSoundtrack() {
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  if (!fs.existsSync(MUSIC)) {
    execFileSync('node', [path.join(ROOT, 'tools', 'music.mjs'), MUSIC], { stdio: 'inherit' });
  }
  const { name: voice, rate: baseRate, lead } = VIDEO.voice;
  const base = parseInt(baseRate, 10);
  const lines = CAMERA_PATH.filter((s) => s.narration).map((shot) => ({
    shot, at: shot.start + lead,
    room: shot.end - shot.start - lead - 0.25,          // 鏡頭結束前 0.25 秒要唸完
    rate: base, file: null, len: 0,
  }));
  // 整批合成；太長的句子加快一點再整批重做，最多加快到 +12%，再快就不自然
  let pending = lines;
  while (pending.length) {
    const files = synthBatch(pending.map((l) => ({ text: l.shot.narration, rate: `${l.rate >= 0 ? '+' : ''}${l.rate}%` })), voice);
    pending.forEach((l, i) => { l.file = files[i]; l.len = duration(l.file); });
    pending = pending.filter((l) => l.len > l.room && l.rate < 12);
    for (const l of pending) l.rate += 6;
  }
  const clips = [];
  for (const { shot, at, room, rate, file, len } of lines) {
    const fit = len <= room ? '' : `  ⚠️ 超出 ${(len - room).toFixed(2)} 秒，建議縮短這句`;
    console.log(`${String(shot.start).padStart(4)}s ${shot.name.padEnd(6, '　')} ${len.toFixed(2)}s / ${room.toFixed(2)}s  語速 ${rate}%${fit}`);
    clips.push({ file, at });
  }

  // —— 嘴型資料：每句話每 1/30 秒的音量與音色（0~1），給導覽員開合嘴巴 ——
  const FPS = 30;
  const env = clips.map((c) => {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', c.file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 64 * 1024 * 1024 });
    const per = Math.round(8000 / FPS);
    const values = [], zcr = [];
    for (let i = 0; i + 1 < pcm.length / 2; i += per) {
      let sum = 0, n = 0, cross = 0, prev = 0;
      for (let j = i; j < Math.min(i + per, pcm.length / 2); j++) {
        const v = pcm.readInt16LE(j * 2) / 32768;
        sum += v * v; n++;
        if (j > i && (v >= 0) !== (prev >= 0)) cross++;
        prev = v;
      }
      values.push(Math.sqrt(sum / Math.max(1, n)));
      zcr.push(cross / Math.max(1, n));
    }
    return { at: c.at, values, zcr };
  });
  const peak = Math.max(...env.flatMap((e) => e.values), 1e-6);
  // 音色用這把聲音自己的範圍（有聲音的畫格的第 10～90 百分位）來正規化，換聲音也適用
  const voiced = env.flatMap((e) => e.zcr.filter((_, i) => e.values[i] > peak * 0.2)).sort((a, b) => a - b);
  const zLo = voiced[Math.floor(voiced.length * 0.1)] ?? 0.04, zHi = voiced[Math.floor(voiced.length * 0.9)] ?? 0.26;
  for (const e of env) {
    let prev = 0;
    e.values = e.values.map((v) => {
      const x = Math.min(1, Math.max(0, (v / peak - 0.06) / 0.55));   // 去掉底噪、拉開對比
      prev = prev * 0.35 + x * 0.65;                                     // 稍微平滑，嘴巴不會抖
      return Math.round(prev * 1000) / 1000;
    });
    // 音色（0~1）：過零率高＝高頻多（ㄧ、ㄝ），低＝低頻多（ㄨ、ㄛ）；給 VRM 角色挑嘴形
    let s = 0.5;
    e.shape = e.zcr.map((z) => {
      s = s * 0.5 + Math.min(1, Math.max(0, 0.1 + 0.8 * (z - zLo) / Math.max(1e-6, zHi - zLo))) * 0.5;
      return Math.round(s * 1000) / 1000;
    });
    delete e.zcr;
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
  // 網頁播放用的小檔（GitHub Pages 會用到；wav 太大不進 git）
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', OUT, '-c:a', 'libmp3lame', '-b:a', '128k', OUT.replace(/\.wav$/, '.mp3')], { stdio: 'inherit' });
  console.log(`音軌完成：${OUT}（網頁用 mp3 也已更新）`);
  return OUT;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) buildSoundtrack();
