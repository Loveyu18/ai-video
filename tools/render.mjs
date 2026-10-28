// 輸出影片：node tools/render.mjs [輸出.mp4] [--from=格] [--to=格] [--cpu] [--music=音樂檔] [--novoice] [--nomusic]
//   --pt=64：改用路徑追蹤，每格 64 次取樣（擬真但慢很多）
//   預設用 GPU（約 6 格/秒）；--cpu 改用 SwiftShader 軟體渲染（約 0.3 格/秒，沒有顯卡時用）
//   預設輸出 output/tour.mp4（layout.VIDEO：1920×1080、30fps、60 秒）
//   流程：無頭 Edge/Chrome 逐格渲染 → 每格 JPEG POST 回來 → 直接餵給 ffmpeg 壓成 H.264
//   時間只由格數決定，所以每次輸出的影片一模一樣，也不會因為機器慢而掉格。
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';
import { VIDEO } from '../layout.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.split('=')[1]) : def;
};
// --query=cam=x,y,z&look=x,y,z：額外的網址參數（例如固定鏡頭近拍導覽員）
const query = args.find((a) => a.startsWith('--query='))?.slice('--query='.length);
const out = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'output/tour.mp4');
const total = Math.round(VIDEO.duration * VIDEO.fps);
const from = opt('from', 0);
const to = opt('to', total);
const useGpu = !args.includes('--cpu');
fs.mkdirSync(path.dirname(out), { recursive: true });

// Chrome 優先（Edge 自動更新時版本資料夾可能暫時不見）；可用環境變數 BROWSER 指定
const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const browserPath = BROWSERS.find((p) => fs.existsSync(p));
if (!browserPath) { console.error('找不到 Edge/Chrome'); process.exit(1); }

// —— 聲音（只在完整輸出時加）：預設旁白＋配樂；--novoice 只要配樂；--music=路徑 換成自己的音樂；--nomusic 不加聲音 ——
const musicArg = args.find((a) => a.startsWith('--music='))?.split('=')[1];
let music = null;
if (!args.includes('--nomusic') && from === 0 && to === total) {
  if (musicArg) {
    music = path.resolve(musicArg);
  } else if (!args.includes('--novoice')) {
    // 旁白＋配樂（tools/voice.mjs；旁白有快取，只有稿子改了才重新合成）
    try {
      const { buildSoundtrack } = await import('./voice.mjs');
      music = buildSoundtrack();
    } catch (e) {
      console.warn(`旁白合成失敗，改用純配樂：${e.message}`);
    }
  }
  if (!music) {
    music = path.resolve('output/music.wav');
    if (!fs.existsSync(music)) {
      const { generateMusic } = await import('./music.mjs');
      generateMusic(music);
    }
  }
}

// —— ffmpeg：從 stdin 收 JPEG 序列（＋配樂） ——
const ffmpeg = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(VIDEO.fps), '-c:v', 'mjpeg', '-i', '-',
  ...(music ? ['-i', music, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  out,
], { stdio: ['pipe', 'inherit', 'inherit'] });

let expected = from;
let lastFrame = Date.now();
let browser;
const t0 = Date.now();
let resolveDone;
const done = new Promise((r) => { resolveDone = r; });

const readBody = (req) => new Promise((r) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => r(Buffer.concat(chunks)));
});

const server = await startServer(0, (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/frame') {
    readBody(req).then((buf) => {
      const i = Number(url.searchParams.get('i'));
      if (i !== expected) { console.error(`\n畫格順序錯誤：收到 ${i}，預期 ${expected}`); process.exit(1); }
      expected++;
      lastFrame = Date.now();
      const ok = ffmpeg.stdin.write(buf);
      const reply = () => res.writeHead(204).end();
      ok ? reply() : ffmpeg.stdin.once('drain', reply);
      const n = i - from + 1;
      if (n % 15 === 0 || i === to - 1) {
        const sec = (Date.now() - t0) / 1000;
        const eta = (sec / n) * (to - from - n);
        process.stdout.write(`\r畫格 ${i + 1}/${to}  ${(n / sec).toFixed(2)} fps  剩約 ${Math.ceil(eta / 60)} 分   `);
      }
    });
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/done') {
    readBody(req).then((buf) => {
      res.writeHead(204).end();
      const { errors } = JSON.parse(buf.toString() || '{}');
      if (errors?.length) console.warn('\n場景錯誤：', errors);
      resolveDone();
    });
    return true;
  }
  return false;
});

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'render-'));
const pt = opt('pt', 0);
const url = `http://127.0.0.1:${server.address().port}/index.html?render=1&from=${from}&to=${to}${pt ? `&pt=${pt}` : ''}${args.includes('--noguide') ? '&noguide=1' : ''}${query ? `&${query}` : ''}`;
console.log(`輸出 ${out}\n格 ${from}~${to}（共 ${to - from} 格，${VIDEO.width}×${VIDEO.height} @ ${VIDEO.fps}fps）`);
browser = execFile(browserPath, [
  '--headless=new', '--hide-scrollbars', '--mute-audio',
  ...(useGpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  '--disable-gpu-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--user-data-dir=${profile}`, `--window-size=${VIDEO.width},${VIDEO.height}`,
  ...(process.env.RENDER_DEBUG ? ['--enable-logging=stderr', '--v=0'] : []), url,
], { maxBuffer: 64 * 1024 * 1024 });
if (process.env.RENDER_DEBUG) browser.stderr.on('data', (d) => { const t = d.toString(); if (/CONSOLE|ERROR|WebGL|shader/i.test(t)) process.stderr.write(t); });

// 看門狗：頁面的模組載入失敗時不會回報錯誤，3 分鐘沒收到新畫格就當作卡住
const watchdog = setInterval(() => {
  if (Date.now() - lastFrame < 180000) return;
  console.error(`\n3 分鐘沒有收到新畫格（停在第 ${expected} 格），可能是頁面載入失敗。用 RENDER_DEBUG=1 看瀏覽器訊息。`);
  browser.kill();
  process.exit(1);
}, 5000);
await done;
clearInterval(watchdog);
browser.kill();
server.close();
ffmpeg.stdin.end();
ffmpeg.on('close', (code) => {
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  if (code === 0) console.log(`\n完成：${out}（${sec} 秒）`);
  else { console.error(`\nffmpeg 結束碼 ${code}`); process.exit(1); }
});
