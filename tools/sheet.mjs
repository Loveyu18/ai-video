// 影格表：node tools/sheet.mjs [輸出資料夾] [--from=秒] [--to=秒] [--every=秒] [--cols=6] [--rows=5] [--width=480] [--cpu] [--query=...]
//   每隔 --every 秒（預設 0.5）取一格，左上角印時間與鏡頭名稱（轉場中是橘底），
//   拼成 cols×rows 一張的影格表：輸出資料夾/sheet-01.jpg、sheet-02.jpg…（預設 output/sheet）
//   一次看完整支片的走位、轉場接縫、導覽員動作；用時間碼回頭對 ?t=秒數 精修。
//   例：node tools/sheet.mjs                                   整支片，每 0.5 秒一格
//       node tools/sheet.mjs out/door --from=41 --to=46 --every=0.1   近看一段轉場
// 畫面和 tools/render.mjs 輸出的影片同一套（同解析度、同字卡），只是跳著畫。
import { execFile, spawnSync } from 'node:child_process';
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
const query = args.find((a) => a.startsWith('--query='))?.slice('--query='.length);
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'output/sheet');
const { fps } = VIDEO;
const from = Math.round(opt('from', 0) * fps);
const to = Math.round(opt('to', VIDEO.duration) * fps);
const step = Math.max(1, Math.round(opt('every', 0.5) * fps));
const cols = opt('cols', 6), rows = opt('rows', 5), width = opt('width', 480);

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const browserPath = BROWSERS.find((p) => fs.existsSync(p));
if (!browserPath) { console.error('找不到 Edge/Chrome'); process.exit(1); }

const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-frames-'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'));
let n = 0;
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
      fs.writeFileSync(path.join(frames, `${String(n++).padStart(5, '0')}.jpg`), buf);
      process.stdout.write(`\r畫格 ${n}/${Math.ceil((to - from) / step)}   `);
      res.writeHead(204).end();
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

const url = `http://127.0.0.1:${server.address().port}/index.html?render=1&stamp=1&q=0.85&from=${from}&to=${to}&step=${step}${query ? `&${query}` : ''}`;
console.log(`影格表 ${(from / fps).toFixed(1)}~${(to / fps).toFixed(1)} 秒，每 ${(step / fps).toFixed(2)} 秒一格 → ${outDir}`);
const browser = execFile(browserPath, [
  '--headless=new', '--hide-scrollbars', '--mute-audio',
  ...(args.includes('--cpu') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist']),
  '--disable-gpu-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--user-data-dir=${profile}`, `--window-size=${VIDEO.width},${VIDEO.height}`, url,
], { maxBuffer: 64 * 1024 * 1024 });

await done;
browser.kill();
server.close();

// —— 拼圖：ffmpeg tile，最後一張不滿也會輸出 ——
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/^sheet-\d+\.jpg$/.test(f)) fs.rmSync(path.join(outDir, f));
const r = spawnSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(frames, '%05d.jpg'),
  '-vf', `scale=${width}:-2,tile=${cols}x${rows}:padding=6:margin=6:color=0x1a1a1a`,
  '-q:v', '3', path.join(outDir, 'sheet-%02d.jpg'),
], { stdio: 'inherit' });
for (const d of [frames, profile]) try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
if (r.status !== 0) { console.error('\nffmpeg 拼圖失敗'); process.exit(1); }
const sheets = fs.readdirSync(outDir).filter((f) => /^sheet-\d+\.jpg$/.test(f));
console.log(`\n完成：${sheets.length} 張（${n} 格）→ ${sheets.map((f) => path.join(outDir, f)).join('、')}`);
