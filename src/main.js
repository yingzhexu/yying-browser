// YYING浏览器 主进程
// 所有浏览器共用同一个 Chromium 内核（同一个 Electron 进程），
// 每个浏览器使用独立的持久化 session 分区（persist:yy_<id>），
// 因此 Cookie / LocalStorage / IndexedDB / 缓存 / 历史记录 / 书签 / 下载 全部互相隔离。
const {
  app, BrowserWindow, WebContentsView, ipcMain, session, Menu, clipboard, shell, nativeTheme, dialog, screen, nativeImage, powerMonitor,
} = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

// 4.0 起改名为 YYING浏览器，但数据（登录、历史、书签）继续放在原来的 yingying浏览器 文件夹里，升级不丢数据
if (path.basename(app.getPath('userData')) === app.getName()) {
  const unused = app.getPath('userData');
  app.setPath('userData', path.join(app.getPath('appData'), 'yingying浏览器'));
  try { fs.rmdirSync(unused); } catch {} // 系统按新名字先建的空文件夹，删掉免得误会（不是空的就不会删）
}
const { pathToFileURL } = require('url');
const os = require('os');

const MAX_PROFILES = 10;
const COLORS = ['#ff6b8b', '#4f8cff', '#2ec4a6', '#ffa94d', '#9b6bff',
  '#f2b632', '#ff7a45', '#36b3e6', '#5fbf5a', '#e86bd1'];
const BASE_TOP = 80;     // 标签栏 40 + 工具栏 40
const BOOKMARK_BAR = 32; // 书签栏高度
const PANEL_W = 360;     // 侧栏宽度
const SIDEBAR_W = 56;    // 右侧浏览器栏宽度
const HISTORY_LIMIT = 5000;
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const CREDIT = '小应同学ying 制作';
// 不同系统的快捷键习惯不同（Windows 上 Ctrl+Y 是“重做”，历史记录是 Ctrl+H）
const HK = {
  history: process.platform === 'darwin' ? 'Cmd+Y' : 'Ctrl+H',
  downloads: process.platform === 'darwin' ? 'Cmd+Shift+J' : 'Ctrl+J',
};
// 内存不超过 4GB 或只有 2 个 CPU 核心的电脑视为老电脑，自动开启省资源模式
const LOW_END = os.totalmem() <= 4.5 * 1024 ** 3 || os.cpus().length <= 2;

// 主进程任何意外错误都只记录，不弹框、不退出，避免整个浏览器卡死
process.on('uncaughtException', (e) => console.error('[YYING]', e));
process.on('unhandledRejection', (e) => console.error('[YYING]', e));

// Windows 10/11：隐藏系统标题栏，用自绘标签栏 + 系统自带的最小化/最大化/关闭按钮
const barColors = () => (nativeTheme.shouldUseDarkColors
  ? { color: '#1a1b21', symbolColor: '#e9eaf1' } : { color: '#e6e8ef', symbolColor: '#1d1f2b' });
function frameOptions(kind) {
  // Mac：浏览器窗口不用系统全屏（系统全屏会放进单独的桌面空间，切换时有滑动动画），改由浏览器自己控制“简单全屏”
  if (IS_MAC) return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 }, ...(kind === 'browser' ? { fullscreenable: false } : {}) };
  const icon = path.join(__dirname, 'icon.png');
  if (IS_WIN) {
    const overlay = kind === 'home' ? { color: '#f5f6fa', symbolColor: '#1b1d2a' } : barColors();
    return { icon, titleBarStyle: 'hidden', titleBarOverlay: { ...overlay, height: 40 } };
  }
  return { icon, autoHideMenuBar: true };
}

// 同一时间只运行一个 YYING浏览器，再次双击图标时打开主页
if (!app.requestSingleInstanceLock()) app.exit(0);
if (IS_WIN) app.setAppUserModelId('com.yingying.browser');
app.setAboutPanelOptions({
  applicationName: 'YYING浏览器', applicationVersion: app.getVersion(),
  credits: CREDIT, copyright: '© 2026 小应同学ying',
});
const PAGES = {
  newtab: path.join(__dirname, 'newtab.html'),
  error: path.join(__dirname, 'error.html'),
};
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

// ---------- 主题 ----------
// classic 跟随浅色/深色外观设置；其余是固定配色。每个浏览器可以单独选，也可以跟随默认主题。
const SKINS = {
  classic: { name: '经典', mode: 'auto' },
  sakura: { name: '樱花粉', mode: 'light', bar: '#f9dfe8', tool: '#fff7fa', field: '#fcebf1', line: '#f1d0dc', text: '#3a2430', sub: '#8f6577', nt: 'linear-gradient(160deg,#ffdce9 0%,#fff3f7 55%,#ffe6ef 100%)' },
  sky: { name: '天空蓝', mode: 'light', bar: '#d9e9fb', tool: '#f5f9ff', field: '#e8f1fc', line: '#c8dbf2', text: '#1c2b3d', sub: '#5b7089', nt: 'linear-gradient(160deg,#d6e9ff 0%,#f3f8ff 55%,#e0eeff 100%)' },
  mint: { name: '薄荷绿', mode: 'light', bar: '#d6f0e5', tool: '#f4fcf8', field: '#e3f5ed', line: '#c0e4d4', text: '#183229', sub: '#557a6c', nt: 'linear-gradient(160deg,#d3f4e6 0%,#f2fcf7 55%,#dcf6eb 100%)' },
  lavender: { name: '薰衣草', mode: 'light', bar: '#e5dff9', tool: '#faf8ff', field: '#eeeafc', line: '#d6cdf2', text: '#2a2340', sub: '#6f6690', nt: 'linear-gradient(160deg,#e4dbff 0%,#f8f6ff 55%,#ebe4ff 100%)' },
  sunset: { name: '落日橙', mode: 'light', bar: '#fbe0cb', tool: '#fff8f2', field: '#fdecdf', line: '#f0cfb4', text: '#3b2416', sub: '#8d6650', nt: 'linear-gradient(160deg,#ffdfc7 0%,#fff6ee 55%,#ffe7d5 100%)' },
  night: { name: '暗夜', mode: 'dark', bar: '#15161c', tool: '#23242c', field: '#1b1c23', line: '#33343f', text: '#e9eaf1', sub: '#9b9eae', nt: 'linear-gradient(160deg,#211d33 0%,#16171f 55%,#151a24 100%)' },
  ocean: { name: '深海蓝', mode: 'dark', bar: '#0c1826', tool: '#132436', field: '#0f1e2e', line: '#233c56', text: '#e3eef9', sub: '#8fa8c2', nt: 'linear-gradient(160deg,#0f2747 0%,#0b1726 55%,#0d2036 100%)' },
  forest: { name: '森林', mode: 'dark', bar: '#0f1d17', tool: '#172a22', field: '#12231c', line: '#284437', text: '#e4f2ea', sub: '#8db3a2', nt: 'linear-gradient(160deg,#123521 0%,#0d1a14 55%,#10281c 100%)' },
  graphite: { name: '石墨黑', mode: 'dark', bar: '#1c1c1e', tool: '#2a2a2d', field: '#222225', line: '#3a3a3e', text: '#ececef', sub: '#a0a0a8', nt: 'linear-gradient(160deg,#2a2a30 0%,#1a1a1c 55%,#212126 100%)' },
};
const skinList = () => Object.entries(SKINS).map(([id, k]) => ({ id, name: k.name, mode: k.mode, bar: k.bar, tool: k.tool, text: k.text, nt: k.nt }));

const ENGINES = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?ensearch=1&q=',
  baidu: 'https://www.baidu.com/s?wd=',
};

// 去掉 UA 中的 Electron 标记，避免 Google 等网站提示“浏览器不安全”
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/, '')
  .replace(/\s(?:yingying|yying)\S*\/\S+/i, '');

// ---------- 数据存储 ----------
const dataPath = (...p) => path.join(app.getPath('userData'), ...p);

function readJSON(file, fallback) {
  for (const f of [file, `${file}.bak`]) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  }
  return fallback;
}
// 重要文件（浏览器列表、设置）写之前留一份 .bak，万一主文件损坏还能找回
function writeJSON(file, data, backup = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  if (backup && fs.existsSync(file)) { try { fs.copyFileSync(file, `${file}.bak`); } catch {} }
  fs.renameSync(tmp, file);
}
async function writeJSONAsync(file, data) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data));
  await fs.promises.rename(tmp, file);
}

let profiles = [];
let settings = {
  engine: 'bing', theme: 'system', bootAnimation: true, bookmarksBar: false, restoreTabs: true, sidebar: true,
  lowPerf: false, tabSleep: true, hardwareAcceleration: true, skin: 'classic',
};
const saveProfiles = () => writeJSON(dataPath('profiles.json'), profiles, true);
const saveSettings = () => writeJSON(dataPath('settings.json'), settings, true);
const partitionOf = (id) => `persist:yy_${id}`;
const chromeTop = () => BASE_TOP + (settings.bookmarksBar ? BOOKMARK_BAR : 0);
// 低性能模式：设置里手动打开（默认关闭）
const isLite = () => !!settings.lowPerf;
const publicSettings = () => ({ ...settings, lite: isLite(), lowEnd: LOW_END, needRestart: !!settings.lowPerf !== startedLowPerf });

// 设置要在 app ready 之前读出来，硬件加速开关只能在这时生效
settings = { ...settings, ...readJSON(dataPath('settings.json'), {}) };
if ((settings.v || 0) < 2) { settings.engine = 'bing'; } // 2.0：默认搜索引擎改为必应国际版
if ((settings.v || 0) < 3) { settings.bookmarksBar = false; settings.sidebar = true; } // 2.2：书签栏默认隐藏，右侧浏览器栏默认显示
settings.v = 3;
if (settings.perf !== undefined) { if (settings.perf === 'lite') settings.lowPerf = true; delete settings.perf; } // 旧版“性能模式”迁移
if (settings.hardwareAcceleration === false) app.disableHardwareAcceleration();
// 低性能模式下的内核优化（启动时生效）：Chromium 低端设备模式省内存、少渲染；关掉平滑滚动
if (settings.lowPerf) {
  app.commandLine.appendSwitch('enable-low-end-device-mode');
  app.commandLine.appendSwitch('disable-smooth-scrolling');
}
const startedLowPerf = !!settings.lowPerf;
// 显卡驱动老旧时 GPU 进程会反复崩溃（白屏、闪退），崩 3 次后自动关闭硬件加速
app.on('child-process-gone', (_e, d) => {
  if (d.type !== 'GPU' || d.reason === 'clean-exit' || d.reason === 'killed') return;
  settings.gpuCrashes = (settings.gpuCrashes || 0) + 1;
  if (settings.gpuCrashes >= 3) settings.hardwareAcceleration = false;
  saveSettings();
});

// 每个浏览器一份的列表数据（历史记录、书签），内存缓存 + 延迟写盘
const stores = new Map();
function store(kind, id) {
  const key = `${kind}:${id}`;
  let s = stores.get(key);
  if (!s) {
    s = { kind, id, data: readJSON(dataPath(kind, `${id}.json`), []), timer: null };
    stores.set(key, s);
  }
  return s;
}
function saveStore(s, now = false) {
  clearTimeout(s.timer);
  const file = dataPath(s.kind, `${s.id}.json`);
  if (now) { s.timer = null; writeJSON(file, s.data); return; }
  // 平时异步写盘、按顺序排队，不阻塞界面
  s.timer = setTimeout(() => {
    s.timer = null;
    const snapshot = s.data.slice();
    s.chain = (s.chain || Promise.resolve()).then(() => (s.dropped ? null : writeJSONAsync(file, snapshot))).catch(() => {});
  }, 1500);
}
function dropStore(kind, id) {
  const s = stores.get(`${kind}:${id}`);
  if (s) { clearTimeout(s.timer); s.dropped = true; }
  stores.delete(`${kind}:${id}`);
  fs.rmSync(dataPath(kind, `${id}.json`), { force: true });
}
const history = (id) => store('history', id);
const bookmarks = (id) => store('bookmarks', id);

function internalPage(url) {
  if (!url || !url.startsWith('file:')) return null;
  try {
    const p = decodeURIComponent(new URL(url).pathname);
    for (const [name, file] of Object.entries(PAGES)) if (p.endsWith(file.replace(/\\/g, '/'))) return name;
  } catch {}
  return null;
}
function isWebURL(url) { return /^https?:/i.test(url || ''); }

function addHistory(id, url, title, favicon) {
  if (!isWebURL(url)) return;
  const s = history(id);
  const last = s.data[0];
  if (last && last.url === url && Date.now() - last.time < 30000) {
    if (title) last.title = title;
  } else {
    s.data.unshift({ url, title: title || url, favicon: favicon || null, time: Date.now() });
    if (s.data.length > HISTORY_LIMIT) s.data.length = HISTORY_LIMIT;
  }
  saveStore(s);
}
function patchHistory(id, url, patch) {
  const s = history(id);
  const item = s.data.find((h) => h.url === url);
  if (item) { Object.assign(item, patch); saveStore(s); }
}

function topSites(id) {
  const hosts = new Map();
  for (const h of history(id).data.slice(0, 3000)) {
    let u;
    try { u = new URL(h.url); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const c = hosts.get(u.hostname) || { url: `${u.origin}/`, host: u.hostname, count: 0, favicon: null, title: null };
    c.count++;
    if (!c.favicon && h.favicon) c.favicon = h.favicon;
    if (!c.title && u.pathname === '/' && h.title) c.title = h.title;
    hosts.set(u.hostname, c);
  }
  return [...hosts.values()].sort((a, b) => b.count - a.count).slice(0, 8).map((c) => ({
    url: c.url,
    host: c.host,
    favicon: c.favicon,
    title: ((c.title || '').split(/\s[-|–—_·]\s|[|｜]/)[0].trim().slice(0, 14)) || c.host.replace(/^www\./, ''),
  }));
}

// ---------- 网址处理 ----------
function looksLikeUrl(text) {
  return !/\s/.test(text) && (/^localhost(:\d+)?(\/|$)/i.test(text) ||
    /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text) ||
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#].*)?$/.test(text));
}
const searchURL = (text) => (ENGINES[settings.engine] || ENGINES.google) + encodeURIComponent(text);
function toURL(input) {
  const text = (input || '').trim();
  if (!text) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^(about|data|file|mailto):/i.test(text)) return text;
  if (looksLikeUrl(text)) return (/^(localhost|\d)/i.test(text) ? 'http://' : 'https://') + text;
  return searchURL(text);
}

function suggestions(pid, input) {
  const text = input.trim();
  const q = text.toLowerCase();
  if (!q) return [];
  const out = [];
  const seen = new Set();
  const add = (item) => { if (!seen.has(item.url)) { seen.add(item.url); out.push(item); } };
  if (looksLikeUrl(text) || /^[a-z]+:\/\//i.test(text)) add({ type: 'url', title: text, url: toURL(text) });
  else add({ type: 'search', title: text, url: searchURL(text) });

  const match = (h) => h.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').startsWith(q) ? 2
    : (h.url.toLowerCase().includes(q) || (h.title || '').toLowerCase().includes(q)) ? 1 : 0;
  for (const b of bookmarks(pid).data) {
    if (out.length >= 4) break;
    if (match(b)) add({ type: 'bookmark', title: b.title, url: b.url, favicon: b.favicon });
  }
  const counts = new Map();
  for (const h of history(pid).data.slice(0, 3000)) {
    const m = match(h);
    if (!m) continue;
    const c = counts.get(h.url) || { h, score: 0 };
    c.score += m;
    counts.set(h.url, c);
  }
  for (const { h } of [...counts.values()].sort((a, b) => b.score - a.score)) {
    if (out.length >= 7) break;
    add({ type: 'history', title: h.title, url: h.url, favicon: h.favicon });
  }
  if (out[0].type === 'url') add({ type: 'search', title: text, url: searchURL(text) });
  return out;
}

// ---------- 主页（选择浏览器） ----------
let homeWin = null;
let booted = false;
const ctxs = new Map(); // profileId -> 浏览器窗口上下文

function showHome(opts = {}) {
  if (homeWin && !homeWin.isDestroyed()) {
    homeWin.show(); homeWin.focus();
    if (opts.settings) homeWin.webContents.send('open-settings');
    if (opts.edit) homeWin.webContents.send('open-edit', opts.edit);
    if (opts.batch) homeWin.webContents.send('open-batch', opts.batch);
    return;
  }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  homeWin = new BrowserWindow({
    width: Math.min(1120, area.width - 60), height: Math.min(760, area.height - 40), minWidth: 640, minHeight: 480,
    title: 'YYING浏览器',
    show: false,
    backgroundColor: '#f5f6fa',
    ...frameOptions('home'),
    webPreferences: { preload: path.join(__dirname, 'preload-home.js'), spellcheck: false },
  });
  homeWin.on('show', notifyHome);
  bindShortcutsLite(homeWin.webContents);
  homeWin.on('restore', notifyHome);
  homeWin.loadFile(path.join(__dirname, 'home.html'), {
    query: { boot: !booted && settings.bootAnimation && !isLite() ? '1' : '0', settings: opts.settings ? '1' : '0', edit: opts.edit || '', lite: isLite() ? '1' : '0', batch: opts.batch ? JSON.stringify(opts.batch) : '' },
  });
  booted = true;
  homeWin.once('ready-to-show', () => homeWin.show());
  homeWin.on('closed', () => { homeWin = null; });
}

function skinPayload(pid) {
  const p = profiles.find((x) => x.id === pid);
  const id = (p?.skin && SKINS[p.skin] ? p.skin : null) || (SKINS[settings.skin] ? settings.skin : 'classic');
  const k = SKINS[id];
  const dark = k.mode === 'dark' || (k.mode === 'auto' && nativeTheme.shouldUseDarkColors);
  const wp = p?.wallpaper ? dataPath('wallpapers', p.wallpaper) : null;
  return {
    id, ...k, dark, own: !!p?.skin,
    wallpaper: wp && fs.existsSync(wp) ? `${pathToFileURL(wp).href}?v=${p.wallpaperV || 0}` : null,
  };
}
function barColorsFor(pid) {
  const k = skinPayload(pid);
  return k.id === 'classic' ? barColors() : { color: k.bar, symbolColor: k.text };
}
// 把主题推给浏览器界面、标题栏、所有新标签页
function applySkin(ctx) {
  if (!ctx || ctx.win.isDestroyed()) return;
  const k = skinPayload(ctx.id);
  ctx.win.webContents.send('skin', k);
  ctx.win.setBackgroundColor(k.tool || (k.dark ? '#2a2b33' : '#ffffff'));
  if (IS_WIN) ctx.win.setTitleBarOverlay({ ...barColorsFor(ctx.id), height: 40 });
  for (const t of ctx.tabs) {
    if (alive(t) && internalPage(t.view.webContents.getURL()) === 'newtab') t.view.webContents.send('skin', k);
  }
}
function setProfileSkin(pid, patch) {
  const p = profiles.find((x) => x.id === pid);
  if (!p) return;
  Object.assign(p, patch);
  saveProfiles();
  profilesChanged();
  applySkin(ctxs.get(pid));
}
async function pickWallpaper(pid, win) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '选择新标签页壁纸', properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
  });
  if (canceled || !filePaths[0]) return false;
  const src = filePaths[0];
  if (fs.statSync(src).size > 20 * 1024 * 1024) {
    dialog.showMessageBox(win, { type: 'info', message: '图片太大了', detail: '请选择 20MB 以内的图片。' });
    return false;
  }
  const dir = dataPath('wallpapers');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`${pid}.`)) fs.rmSync(path.join(dir, f), { force: true });
  const name = `${pid}${path.extname(src).toLowerCase()}`;
  fs.copyFileSync(src, path.join(dir, name));
  setProfileSkin(pid, { wallpaper: name, wallpaperV: Date.now() });
  return true;
}
function clearWallpaper(pid) {
  const p = profiles.find((x) => x.id === pid);
  if (p?.wallpaper) fs.rmSync(dataPath('wallpapers', p.wallpaper), { force: true });
  setProfileSkin(pid, { wallpaper: null });
}

function profileList() {
  return profiles.map((p) => {
    const ctx = ctxs.get(p.id);
    const a = ctx && activeTab(ctx);
    const info = a && (a.sleep || alive(a)) ? tabInfo(a, new Set()) : null;
    return {
      ...p, running: !!ctx, tabCount: ctx ? ctx.tabs.length : 0, historyCount: history(p.id).data.length,
      activeTitle: info ? info.title : '', activeUrl: info ? info.url : '', lastTabs: lastSession(p.id).tabs.length,
    };
  });
}
let homeTimer = null;
function notifyHome() {
  clearTimeout(homeTimer);
  homeTimer = setTimeout(() => {
    // 主页被最小化或藏在后面时不刷新，省 CPU
    if (homeWin && !homeWin.isDestroyed() && homeWin.isVisible() && !homeWin.isMinimized()) {
      homeWin.webContents.send('profiles-changed', profileList());
    }
  }, 200);
}

// ---------- 上次会话与窗口位置 ----------
const sessionCache = new Map();
function lastSession(id) {
  if (!sessionCache.has(id)) sessionCache.set(id, readJSON(dataPath('sessions', `${id}.json`), { tabs: [] }));
  return sessionCache.get(id);
}
function saveSession(ctx) {
  const tabs = [];
  const items = [];
  let active = 0;
  for (const t of ctx.tabs) {
    if (!t.sleep && !alive(t)) continue;
    const info = tabInfo(t, new Set());
    if (!isWebURL(info.url)) continue;
    if (t.id === ctx.activeId) active = tabs.length;
    tabs.push(info.url);
    items.push({ url: info.url, title: info.title, favicon: info.favicon });
  }
  const data = { tabs, items, active, bounds: { ...ctx.win.getNormalBounds(), maximized: ctx.win.isMaximized() }, time: Date.now() };
  sessionCache.set(ctx.id, data);
  // 内容没变就不重复写盘（定时自动保存会频繁调用这里）
  const sig = JSON.stringify({ items, active, b: data.bounds });
  if (sig === ctx.savedSig) return;
  ctx.savedSig = sig;
  writeJSON(dataPath('sessions', `${ctx.id}.json`), data);
}
function validBounds(b) {
  if (!b || !b.width) return null;
  const ok = screen.getAllDisplays().some(({ workArea: a }) =>
    b.x < a.x + a.width - 100 && b.x + b.width > a.x + 100 && b.y >= a.y - 20 && b.y < a.y + a.height - 100);
  return ok ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
}
// 新窗口错开摆放，避免多开时完全叠在一起
function cascadeBounds() {
  const a = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(1280, a.width - 80);
  const height = Math.min(840, a.height - 60);
  const off = (ctxs.size % 8) * 36;
  return { x: a.x + Math.round((a.width - width) / 2) - 120 + off, y: a.y + 30 + off, width, height };
}

// 主页“全部后台打开”：把还没打开的浏览器都在后台开好，之后切换都是无缝的
let lastBrowserCtx = null;
async function openAllInBackground() {
  const front = BrowserWindow.getFocusedWindow();
  const todo = profiles.filter((p) => !ctxs.has(p.id));
  for (const p of todo) {
    openProfile(p.id, { background: true, front });
    await new Promise((r) => setTimeout(r, isLite() ? 700 : 350));
  }
  setTimeout(() => { if (front && !front.isDestroyed()) { front.moveTop(); front.focus(); } }, 450);
  return todo.length;
}
// “一键全屏”：所有已打开的浏览器一起进入全屏；都已经全屏时再点一下就一起退出
function fullscreenAll() {
  const list = profiles.map((p) => ctxs.get(p.id)).filter((c) => c && !c.win.isDestroyed());
  if (!list.length) return { count: 0, on: false };
  const on = !list.every((c) => isFs(c.win));
  for (const c of list) setFs(c.win, on);
  if (on) {
    const target = lastBrowserCtx && ctxs.get(lastBrowserCtx.id) === lastBrowserCtx ? lastBrowserCtx : list[0];
    setTimeout(() => { if (!target.win.isDestroyed()) { target.win.show(); target.win.moveTop(); target.win.focus(); } }, IS_MAC ? 500 : 80);
  }
  return { count: list.length, on };
}

// 立刻把所有数据写到硬盘：标签页、历史、书签、Cookie（关机、断电前用）
function saveEverything() {
  for (const ctx of ctxs.values()) { try { if (!ctx.win.isDestroyed()) saveSession(ctx); } catch {} }
  for (const s of stores.values()) if (s.timer) saveStore(s, true);
  for (const id of readySessions) session.fromPartition(partitionOf(id)).cookies.flushStore().catch(() => {});
}

// 把所有打开的浏览器窗口平铺到当前屏幕
function tileWindows() {
  const wins = profiles.map((p) => ctxs.get(p.id)).filter(Boolean).map((c) => c.win).filter((w) => !w.isDestroyed());
  if (!wins.length) return;
  const a = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const n = wins.length;
  const cols = Math.ceil(Math.sqrt(n * (a.width / a.height) / 1.6));
  const rows = Math.ceil(n / cols);
  const gap = 6;
  const w = Math.floor((a.width - gap * (cols + 1)) / cols);
  const h = Math.floor((a.height - gap * (rows + 1)) / rows);
  wins.forEach((win, i) => {
    if (win.isFullScreen()) win.setFullScreen(false);
    if (win.isMaximized()) win.unmaximize();
    if (win.isMinimized()) win.restore();
    const r = Math.floor(i / cols);
    const c = i % cols;
    win.setBounds({ x: a.x + gap + c * (w + gap), y: a.y + gap + r * (h + gap), width: w, height: h }, IS_MAC);
    win.showInactive();
  });
  wins[0].focus();
}

// ---------- 无缝切换：目标浏览器出现在当前窗口完全相同的位置和大小 ----------
// 全屏：Mac 用不切换桌面空间的简单全屏，Windows 用普通全屏
const isFs = (w) => w.isFullScreen() || (IS_MAC && w.isSimpleFullScreen());
function setFs(w, on) {
  if (isFs(w) === on) return;
  if (IS_MAC) w.setSimpleFullScreen(on); else w.setFullScreen(on);
}
async function switchToProfile(fromCtx, id) {
  if (fromCtx && fromCtx.id === id) return;
  const from = fromCtx && !fromCtx.win.isDestroyed() ? fromCtx.win : null;
  const st = from ? { bounds: from.getNormalBounds(), max: from.isMaximized(), fs: isFs(from) } : null;
  const target = ctxs.get(id);
  if (!target) { openProfile(id, st ? { place: st, seamless: true } : {}); return; }
  const w = target.win;
  if (w.isMinimized()) w.restore();
  if (st) {
    if (isFs(w) !== st.fs) {
      // 在原窗口后面先把全屏状态调好，再一下子换到前面，看不到放大缩小的过程
      setFs(w, st.fs);
      if (IS_MAC) await new Promise((r) => setTimeout(r, 450));
    }
    if (!st.fs) {
      if (st.max) { if (!w.isMaximized()) { w.setBounds(st.bounds); w.maximize(); } } else { if (w.isMaximized()) w.unmaximize(); w.setBounds(st.bounds); }
    }
  }
  w.show(); w.moveTop(); w.focus();
}
// 按顺序切到上一个 / 下一个已打开的浏览器
function cycleProfile(dir) {
  const running = profiles.filter((p) => ctxs.has(p.id));
  if (!running.length) return;
  const cur = ctxFromWindow(BrowserWindow.getFocusedWindow());
  const i = cur ? running.findIndex((p) => p.id === cur.id) : -1;
  switchToProfile(cur, running[(i + dir + running.length) % running.length].id);
}

function focusProfile(id) {
  const ctx = ctxs.get(id);
  if (!ctx) return false;
  if (ctx.win.isMinimized()) ctx.win.restore();
  ctx.win.show(); ctx.win.focus();
  return true;
}

// 菜单里用的小色点图标（手写一个最小 PNG）
const dotCache = new Map();
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// 头像上的字：名字里有数字就显示数字，否则显示第一个字（和界面里的规则一样）
const badgeOf = (name) => { const m = String(name || '').match(/\d+/); return m ? m[0].slice(0, 2) : [...(String(name || '').trim() || 'Y')][0].toUpperCase(); };

// Windows 任务栏：每个浏览器窗口用自己的图标（颜色 + 数字 / 首字），多开时一眼能分清
const winIconCache = new Map();
let iconPainter = null;
async function profileIcon(name, color) {
  const badge = badgeOf(name);
  const key = `${color}|${badge}`;
  if (winIconCache.has(key)) return winIconCache.get(key);
  if (!iconPainter || iconPainter.isDestroyed()) {
    iconPainter = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { offscreen: true } });
    await iconPainter.loadURL('about:blank');
  }
  const url = await iconPainter.webContents.executeJavaScript(`(() => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, ${JSON.stringify(color)}); grad.addColorStop(1, 'color-mix(in srgb, ' + ${JSON.stringify(color)} + ' 55%, #6b3bff)');
    try { g.fillStyle = grad; } catch { g.fillStyle = ${JSON.stringify(color)}; }
    g.beginPath(); g.roundRect(8, 8, S - 16, S - 16, 64); g.fill();
    g.fillStyle = '#fff';
    const t = ${JSON.stringify(badge)};
    g.font = '700 ' + (t.length > 1 ? 128 : 156) + 'px "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, S / 2, S / 2 + 8);
    return c.toDataURL('image/png');
  })()`);
  const img = nativeImage.createFromDataURL(url);
  winIconCache.set(key, img);
  return img;
}
async function applyWinIcon(ctx) {
  if (IS_MAC || !ctx || ctx.win.isDestroyed()) return;
  const p = profiles.find((x) => x.id === ctx.id);
  if (!p) return;
  try { const img = await profileIcon(p.name, p.color); if (!ctx.win.isDestroyed()) ctx.win.setIcon(img); } catch {}
}

function dotIcon(color, running) {
  const key = `${color}${running}`;
  if (dotCache.has(key)) return dotCache.get(key);
  const S = 32;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const raw = Buffer.alloc((S * 4 + 1) * S);
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - S / 2 + 0.5, y - S / 2 + 0.5);
      const outer = Math.max(0, Math.min(1, 12.5 - d));
      const hole = running ? 0 : Math.max(0, Math.min(1, 7.5 - d));
      const o = y * (S * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = Math.round(255 * outer * (1 - hole));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
  const img = nativeImage.createFromBuffer(png, { scaleFactor: 2 });
  dotCache.set(key, img);
  return img;
}
function profileItems(currentId) {
  return profiles.map((p, i) => ({
    label: p.name + (ctxs.has(p.id) ? '' : '（未打开）'),
    icon: dotIcon(p.color, ctxs.has(p.id)),
    type: currentId ? 'checkbox' : 'normal',
    checked: p.id === currentId,
    accelerator: i < 10 ? `CmdOrCtrl+Alt+${(i + 1) % 10}` : undefined,
    click: () => switchToProfile(focusedCtx(), p.id),
  }));
}
// 点左上角名字弹出的原生下拉菜单（和 1.x 一样，最快）
function profileMenu(ctx, x, y) {
  const sep = { type: 'separator' };
  if (x == null && ctx.pill) { x = ctx.pill.x; y = ctx.pill.y + ctx.pill.h + 4; }
  ctx.win.webContents.send('switcher-state', true);
  Menu.buildFromTemplate([
    { label: '切换浏览器', enabled: false },
    ...profileItems(ctx.id).map((it, i) => ({ ...it, click: () => switchToProfile(ctx, profiles[i].id) })),
    sep,
    { label: '显示右侧浏览器栏', type: 'checkbox', checked: !!settings.sidebar, click: () => setSettings({ sidebar: !settings.sidebar }) },
    { label: '后台打开全部浏览器', enabled: ctxs.size < profiles.length, click: () => openAllInBackground() },
    { label: '全部全屏 / 退出全屏', click: () => fullscreenAll() },
    { label: '排列所有浏览器窗口', enabled: ctxs.size > 1, click: tileWindows },
    { label: '批量打开网页…', click: () => showHome({ batch: {} }) },
    { label: '重命名此浏览器…', click: () => showHome({ edit: ctx.id }) },
    { label: '管理所有浏览器…', click: () => showHome() },
  ]).popup({ window: ctx.win, x: Math.round(x || 80), y: Math.round(y || 40), callback: () => { if (!ctx.win.isDestroyed()) ctx.win.webContents.send('switcher-state', false); } });
}
function updateDock() {
  if (!IS_MAC || !app.dock) return;
  app.dock.setMenu(Menu.buildFromTemplate([
    ...profileItems(null),
    { type: 'separator' },
    { label: '排列所有浏览器窗口', enabled: ctxs.size > 1, click: tileWindows },
    { label: '打开主页', click: () => showHome() },
  ]));
}
// 浏览器列表或运行状态变了：刷新主页、菜单、Dock
// 右侧浏览器栏需要的数据：全部浏览器、颜色、是否在运行
function pushSidebar(ctx) {
  const list = profiles.map((p) => ({ id: p.id, name: p.name, color: p.color, note: p.note || '', running: ctxs.has(p.id) }));
  for (const c of ctx ? [ctx] : ctxs.values()) if (!c.win.isDestroyed()) c.win.webContents.send('sidebar', { list, current: c.id });
}
function profilesChanged() {
  pushSidebar();
  notifyHome();
  buildMenu();
  updateDock();
}

// ---------- 下载 ----------
let dlSeq = 0;
const downloads = new Map(); // profileId -> 下载列表
const dlItems = new Map();   // 下载 id -> DownloadItem
const readySessions = new Set();

function getSession(id) {
  const ses = session.fromPartition(partitionOf(id));
  if (!readySessions.has(id)) {
    readySessions.add(id);
    ses.on('will-download', (_e, item) => trackDownload(id, item));
    // 很多网站的登录 Cookie 是“会话 Cookie”，默认关掉浏览器就没了。
    // 这里把它们转成 30 天有效的持久 Cookie，重新打开后依然是登录状态。
    ses.cookies.on('changed', (_e, c, _cause, removed) => {
      if (removed || !c.session || !c.domain) return;
      const host = c.domain.replace(/^\./, '');
      ses.cookies.set({
        url: `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`,
        name: c.name, value: c.value, path: c.path,
        domain: c.hostOnly ? undefined : c.domain,
        secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
        expirationDate: Math.floor(Date.now() / 1000) + 30 * 86400,
      }).catch(() => {});
    });
  }
  return ses;
}

const reservedPaths = new Set();
function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext) || 'download';
  let p = path.join(dir, `${base}${ext}`);
  for (let i = 1; fs.existsSync(p) || reservedPaths.has(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  reservedPaths.add(p);
  return p;
}

const dlTimers = new Map();
function pushDownloads(pid, now = false) {
  const send = () => {
    dlTimers.delete(pid);
    const ctx = ctxs.get(pid);
    if (ctx && !ctx.win.isDestroyed()) ctx.win.webContents.send('downloads', downloads.get(pid) || []);
  };
  if (now) { clearTimeout(dlTimers.get(pid)); send(); } else if (!dlTimers.has(pid)) dlTimers.set(pid, setTimeout(send, 250));
}

function trackDownload(pid, item) {
  const savePath = uniquePath(app.getPath('downloads'), item.getFilename());
  item.setSavePath(savePath);
  const d = {
    id: ++dlSeq, filename: path.basename(savePath), path: savePath, url: item.getURL(),
    received: 0, total: item.getTotalBytes(), state: 'progressing', paused: false, speed: 0, time: Date.now(),
  };
  if (!downloads.has(pid)) downloads.set(pid, []);
  downloads.get(pid).unshift(d);
  dlItems.set(d.id, item);
  let lastBytes = 0;
  let lastTime = Date.now();
  item.on('updated', (_e, state) => {
    d.state = state;
    d.received = item.getReceivedBytes();
    d.total = item.getTotalBytes();
    d.paused = item.isPaused();
    const now = Date.now();
    if (now - lastTime >= 500) {
      d.speed = ((d.received - lastBytes) * 1000) / (now - lastTime);
      lastBytes = d.received; lastTime = now;
    }
    pushDownloads(pid);
  });
  item.once('done', (_e, state) => {
    reservedPaths.delete(savePath);
    d.state = state;
    d.received = item.getReceivedBytes();
    d.speed = 0;
    dlItems.delete(d.id);
    if (state === 'completed' && IS_MAC) app.dock?.downloadFinished(d.path);
    pushDownloads(pid, true);
  });
  pushDownloads(pid, true);
  const ctx = ctxs.get(pid);
  if (ctx) ctx.win.webContents.send('download-started');
}

// ---------- 浏览器窗口 ----------
let tabSeq = 0;

// 在已打开的浏览器里打开一组网址；网址多时后面的先休眠，避免一下子加载太多页面
function openUrlsIn(ctx, urls, mode = 'newtab') {
  urls.forEach((u, i) => {
    const awc = activeWC(ctx);
    if (i === 0 && mode === 'current' && awc) { load(awc, u); return; }
    const last = ctx.tabs[ctx.tabs.length - 1];
    createTab(ctx, u, { activate: i === 0, sleep: i > 0 && urls.length > (isLite() ? 1 : 3), afterId: last ? last.id : -1 });
  });
}
// 批量：在多个浏览器里各打开同样的网页（每个号用自己的登录）
async function batchOpen({ ids = [], urls = [], mode = 'newtab', tile = false } = {}) {
  const list = urls.map((u) => toURL(String(u))).filter(Boolean).slice(0, 20);
  const order = profiles.map((p) => p.id).filter((id) => ids.includes(id));
  if (!list.length || !order.length) return 0;
  for (const id of order) {
    const ctx = ctxs.get(id);
    if (ctx) openUrlsIn(ctx, list, mode);
    else { openProfile(id, { urls: list }); await new Promise((r) => setTimeout(r, 250)); }
  }
  if (order.length === 1) focusProfile(order[0]);
  else if (tile) setTimeout(tileWindows, 1200);
  return order.length;
}
function otherProfilesMenu(ctx, url) {
  const others = profiles.filter((p) => p.id !== ctx.id);
  if (!others.length) return [{ label: '还没有其他浏览器', enabled: false }];
  return [
    ...others.map((p) => ({
      label: p.name + (ctxs.has(p.id) ? '' : '（未打开）'), icon: dotIcon(p.color, ctxs.has(p.id)),
      click: () => batchOpen({ ids: [p.id], urls: [url] }),
    })),
    { type: 'separator' },
    { label: `在其他全部 ${others.length} 个浏览器中打开`, click: () => batchOpen({ ids: others.map((p) => p.id), urls: [url], tile: true }) },
  ];
}

function openProfile(id, opts = {}) {
  const profile = profiles.find((p) => p.id === id);
  if (!profile) return;
  const existing = ctxs.get(id);
  if (existing) {
    if (opts.urls?.length) openUrlsIn(existing, opts.urls);
    focusProfile(id);
    return;
  }
  getSession(id);

  const saved = lastSession(id);
  const win = new BrowserWindow({
    ...(opts.place?.bounds || validBounds(saved.bounds) || cascadeBounds()),
    minWidth: 380, minHeight: 300,
    title: `${profile.name} - YYING浏览器`,
    show: false,
    backgroundColor: skinPayload(id).tool || (nativeTheme.shouldUseDarkColors ? '#2a2b33' : '#ffffff'),
    ...frameOptions('browser'),
    webPreferences: { preload: path.join(__dirname, 'preload-browser.js'), spellcheck: false },
  });
  const ctx = { id, win, tabs: [], activeId: null, panel: false, fsTab: null, closed: [], overlay: null, intro: true };
  ctxs.set(id, ctx);

  win.loadFile(path.join(__dirname, 'browser.html'), {
    query: { name: profile.name, color: profile.color, plat: process.platform, lite: isLite() ? '1' : '0', skin: JSON.stringify(skinPayload(id)), intro: opts.seamless || opts.background || isLite() ? '0' : '1' },
  });
  // Windows 任务栏图标上加一个这个浏览器颜色的小圆点，多开时好分辨
  applyWinIcon(ctx);
  win.once('ready-to-show', () => {
    if (opts.place ? opts.place.max : saved.bounds?.maximized) win.maximize();
    if (opts.place?.fs) setFs(win, true); // 显示之前就铺满屏幕，切过来时直接是全屏
    // 系统第一次显示窗口时会播一段动画（Mac 放大弹出、Windows 淡入）。
    // 无缝切换 / 后台打开时先让窗口完全透明，等系统动画在看不见的时候播完，再一下子显示出来。
    const hideAnim = opts.seamless || opts.background;
    if (hideAnim) win.setOpacity(0);
    if (opts.background) {
      win.showInactive();
      if (opts.front && !opts.front.isDestroyed()) opts.front.moveTop(); // 原来的窗口留在最前面
    } else {
      win.show();
    }
    // macOS 在窗口第一次显示时会自动挪动位置，显示后立刻对齐，保证和原窗口分毫不差
    const want = opts.place && !opts.place.max && !opts.place.fs ? opts.place.bounds : (!saved.bounds?.maximized && validBounds(saved.bounds));
    if (want) win.setBounds(want);
    if (hideAnim) setTimeout(() => { if (!win.isDestroyed()) win.setOpacity(1); }, 320);
  });
  win.on('focus', () => { lastBrowserCtx = ctx; });
  if (IS_WIN) win.setTitleBarOverlay({ ...barColorsFor(id), height: 40 });
  bindShortcuts(ctx, win.webContents);
  win.webContents.once('did-finish-load', () => {
    applySkin(ctx);
    win.webContents.send('settings', publicSettings());
    win.webContents.send('bookmarks', bookmarks(id).data);
    win.webContents.send('downloads', downloads.get(id) || []);
    pushSidebar(ctx);
    // 恢复上次的标签页；没有的话打开这个浏览器的启动页
    // 只加载上次正在看的那个标签页，其余先“休眠”，点到时才加载，老电脑也能秒开
    const items = settings.restoreTabs ? (saved.items || (saved.tabs || []).map((url) => ({ url }))) : [];
    if (items.length) {
      const act = Math.min(saved.active || 0, items.length - 1);
      items.forEach((it, i) => createTab(ctx, it.url, {
        activate: i === act, sleep: i !== act, title: it.title, favicon: it.favicon,
        afterId: ctx.tabs.length ? ctx.tabs[ctx.tabs.length - 1].id : -1,
      }));
      if (!ctx.activeId) switchTab(ctx, ctx.tabs[0].id);
    } else if (!opts.urls?.length) {
      createTab(ctx, profile.startUrl ? toURL(profile.startUrl) : null);
    }
    if (opts.urls?.length) openUrlsIn(ctx, opts.urls);
    setTimeout(() => endIntro(ctx), 3000); // 动画万一没回报，3 秒后也显示网页
  });
  win.on('resize', () => {
    hideOverlay(ctx);
    layout(ctx);
    const fs = isFs(win);
    if (fs !== ctx.fsState) { ctx.fsState = fs; win.webContents.send('win-fullscreen', fs); }
  });
  win.on('blur', () => hideOverlay(ctx));
  win.on('enter-full-screen', () => win.webContents.send('win-fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('win-fullscreen', false));
  win.on('close', () => { saveSession(ctx); getSession(id).cookies.flushStore().catch(() => {}); });
  win.on('session-end', saveEverything);
  win.on('closed', () => {
    for (const t of ctx.tabs) if (alive(t)) t.view.webContents.close();
    if (ctx.overlay && !ctx.overlay.webContents.isDestroyed()) ctx.overlay.webContents.close();
    ctxs.delete(id);
    for (const kind of ['history', 'bookmarks']) { const s = stores.get(`${kind}:${id}`); if (s?.timer) saveStore(s, true); }
    profilesChanged();
  });
  profilesChanged();
}

function ctxFromSender(sender) {
  for (const ctx of ctxs.values()) {
    if (ctx.win.webContents === sender || ctx.overlay?.webContents === sender) return ctx;
  }
  return null;
}
function tabFromSender(sender) {
  for (const ctx of ctxs.values()) {
    const t = ctx.tabs.find((x) => x.view?.webContents === sender);
    if (t) return { ctx, tab: t };
  }
  return null;
}
function ctxFromWindow(win) {
  for (const ctx of ctxs.values()) if (ctx.win === win) return ctx;
  return null;
}
const activeTab = (ctx) => ctx.tabs.find((t) => t.id === ctx.activeId);
const alive = (t) => !!t.view && !t.view.webContents.isDestroyed();
const activeWC = (ctx) => { const t = activeTab(ctx); return t && alive(t) ? t.view.webContents : null; };
const hostTitle = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

function layout(ctx) {
  if (ctx.win.isDestroyed()) return;
  const [w, h] = ctx.win.getContentSize();
  const top = chromeTop();
  const vw = Math.max(240, w - (settings.sidebar ? SIDEBAR_W : 0) - (ctx.panel ? PANEL_W : 0));
  for (const t of ctx.tabs) {
    if (!alive(t)) continue;
    if (ctx.fsTab === t.id) t.view.setBounds({ x: 0, y: 0, width: w, height: h });
    else t.view.setBounds({ x: 0, y: top, width: vw, height: Math.max(0, h - top) });
  }
}

function tabInfo(t, marked) {
  if (t.sleep) {
    const url = t.sleep.url;
    return {
      id: t.id, title: t.sleep.title || hostTitle(url), url, loading: false, favicon: t.sleep.favicon || null,
      canBack: false, canForward: false, secure: url.startsWith('https:'), error: false, zoom: 100,
      audible: false, muted: false, bookmarked: marked.has(url), sleeping: true,
    };
  }
  const wc = t.view.webContents;
  const raw = wc.getURL();
  const page = internalPage(raw);
  const url = page === 'error' ? (t.errorUrl || '') : (page || !raw ? '' : raw);
  let title = wc.getTitle() || url;
  if (page === 'newtab' || !raw) title = '新标签页';
  if (page === 'error') title = '无法访问此网站';
  return {
    id: t.id, title, url,
    loading: wc.isLoading(),
    favicon: page ? null : t.favicon,
    canBack: wc.navigationHistory.canGoBack(),
    canForward: wc.navigationHistory.canGoForward(),
    secure: url.startsWith('https:'),
    error: page === 'error',
    zoom: Math.round(wc.getZoomFactor() * 100),
    audible: wc.isCurrentlyAudible(),
    muted: wc.isAudioMuted(),
    bookmarked: !!url && marked.has(url),
    sleeping: false,
  };
}

// 同一时刻的多个事件合并为一次界面刷新
function sendState(ctx) {
  if (ctx.stateQueued) return;
  ctx.stateQueued = true;
  setImmediate(() => {
    ctx.stateQueued = false;
    if (ctx.win.isDestroyed()) return;
    const marked = new Set(bookmarks(ctx.id).data.map((b) => b.url));
    const tabs = ctx.tabs.filter((t) => t.sleep || alive(t)).map((t) => tabInfo(t, marked));
    ctx.win.webContents.send('state', { tabs, activeId: ctx.activeId });
    const a = tabs.find((t) => t.id === ctx.activeId);
    const name = profiles.find((p) => p.id === ctx.id)?.name || '';
    // Windows 任务栏只显示浏览器名字（如“浏览器 1”）；Mac 保持原样
    ctx.win.setTitle(IS_MAC && a ? `${a.title} - ${name}` : name);
    notifyHome();
  });
}

function load(wc, url) {
  if (url) wc.loadURL(url).catch(() => {});
  else wc.loadFile(PAGES.newtab, { query: { engine: settings.engine, lite: isLite() ? '1' : '0' } }).catch(() => {});
}

function createTab(ctx, url, { activate = true, afterId = ctx.activeId, sleep = false, title, favicon } = {}) {
  const tab = { id: ++tabSeq, view: null, favicon: favicon || null, errorUrl: null, startUrl: url, lastActive: Date.now(), sleep: null };
  const idx = ctx.tabs.findIndex((t) => t.id === afterId);
  ctx.tabs.splice(idx < 0 ? ctx.tabs.length : idx + 1, 0, tab);
  if (sleep && url) {
    tab.sleep = { url, title, favicon };
  } else {
    attachView(ctx, tab, url);
    if (activate) { switchTab(ctx, tab.id); notifyHome(); return tab; }
  }
  sendState(ctx);
  notifyHome();
  return tab;
}

// 给标签页创建网页视图（新建或从休眠中唤醒时调用）
function attachView(ctx, tab, url) {
  const view = new WebContentsView({
    webPreferences: {
      partition: partitionOf(ctx.id), contextIsolation: true, sandbox: true, spellcheck: false,
      // 低性能模式：视频、音乐要点一下才播放，省 CPU
      autoplayPolicy: isLite() ? 'user-gesture-required' : 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload-tab.js'),
    },
  });
  tab.view = view;
  tab.startUrl = url;
  ctx.win.contentView.addChildView(view);
  if (ctx.overlay) ctx.win.contentView.addChildView(ctx.overlay); // 联想框保持在最上层
  view.setVisible(false);
  layout(ctx);

  const wc = view.webContents;
  const update = () => sendState(ctx);
  wc.on('did-start-loading', update);
  wc.on('did-stop-loading', update);
  wc.on('did-navigate', (_e, u) => {
    if (internalPage(u) !== 'error') tab.errorUrl = null;
    tab.favicon = null;
    addHistory(ctx.id, u, wc.getTitle());
    update();
  });
  wc.on('did-navigate-in-page', (_e, u, isMain) => { if (isMain) addHistory(ctx.id, u, wc.getTitle(), tab.favicon); update(); });
  wc.on('page-title-updated', (_e, title) => { patchHistory(ctx.id, wc.getURL(), { title }); update(); });
  wc.on('page-favicon-updated', (_e, icons) => {
    tab.favicon = icons[0] || null;
    if (tab.favicon) patchHistory(ctx.id, wc.getURL(), { favicon: tab.favicon });
    update();
  });
  wc.on('audio-state-changed', update);
  wc.on('focus', () => hideOverlay(ctx));
  wc.on('zoom-changed', (_e, dir) => stepZoom(ctx, wc, dir === 'in' ? 1 : -1));
  wc.on('found-in-page', (_e, r) => ctx.win.webContents.send('find-result', { active: r.activeMatchOrdinal, total: r.matches }));
  wc.on('did-fail-load', (_e, code, desc, failedUrl, isMain) => {
    if (!isMain || code === -3 || internalPage(failedUrl)) return;
    tab.errorUrl = failedUrl;
    wc.loadFile(PAGES.error, { query: { code: String(code), desc, url: failedUrl } }).catch(() => {});
  });
  wc.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit' || wc.isDestroyed()) return;
    tab.errorUrl = tab.errorUrl || wc.getURL();
    wc.loadFile(PAGES.error, { query: { code: 'crash', desc: details.reason, url: tab.errorUrl } }).catch(() => {});
  });
  // 网页卡死：每个标签页是独立进程，不会拖住整个浏览器；这里让用户选择等待或关掉它
  wc.on('responsive', () => { tab.hung = false; });
  wc.on('unresponsive', async () => {
    tab.hung = true;
    if (tab.hangDialog) return;
    tab.hangDialog = true;
    const { response } = await dialog.showMessageBox(ctx.win, {
      type: 'warning', buttons: ['等待', '关闭此网页'], defaultId: 0, cancelId: 0,
      message: '网页无响应',
      detail: `“${wc.getTitle() || wc.getURL()}”暂时没有响应。可以继续等待，或者结束这个网页（其他标签页和浏览器不受影响）。`,
    });
    tab.hangDialog = false;
    if (response === 1 && tab.hung && !wc.isDestroyed()) wc.forcefullyCrashRenderer();
  });
  // 网页里的视频全屏：Mac 上由浏览器自己进入 / 退出简单全屏（系统全屏在这里会退不出来）
  wc.on('enter-html-full-screen', () => {
    ctx.fsTab = tab.id;
    hideOverlay(ctx);
    if (IS_MAC && !isFs(ctx.win)) { ctx.htmlFs = true; setFs(ctx.win, true); }
    layout(ctx);
  });
  wc.on('leave-html-full-screen', () => {
    ctx.fsTab = null;
    if (IS_MAC && ctx.htmlFs) { ctx.htmlFs = false; setFs(ctx.win, false); }
    layout(ctx);
  });

  wc.setWindowOpenHandler(({ url: target, disposition }) => {
    if (!/^(https?|about|data|blob|file):/i.test(target)) { shell.openExternal(target).catch(() => {}); return { action: 'deny' }; }
    // 带窗口参数的弹窗（如第三方登录）保持为真实弹窗，自动继承本浏览器的 session
    if (disposition === 'new-window') return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { spellcheck: false } } };
    createTab(ctx, target, { activate: disposition !== 'background-tab', afterId: tab.id });
    return { action: 'deny' };
  });
  wc.on('context-menu', (_e, p) => pageMenu(ctx, tab, p));
  bindShortcuts(ctx, wc);
  load(wc, url);
}

// 长时间没看的标签页“休眠”：释放网页占用的内存和 CPU，点回来时重新加载
function sleepTab(ctx, tab) {
  if (tab.sleep || !alive(tab) || tab.id === ctx.activeId || ctx.fsTab === tab.id) return;
  const wc = tab.view.webContents;
  if (wc.isCurrentlyAudible() || wc.isLoading()) return;
  const url = tab.errorUrl || wc.getURL();
  if (!isWebURL(url)) return;
  tab.sleep = { url, title: wc.getTitle(), favicon: tab.favicon };
  ctx.win.contentView.removeChildView(tab.view);
  wc.close();
  tab.view = null;
  sendState(ctx);
}
function sleepIdleTabs() {
  if (!settings.tabSleep) return;
  const cutoff = Date.now() - (isLite() ? 3 : 20) * 60000;
  for (const ctx of ctxs.values()) {
    for (const t of ctx.tabs) if (t.lastActive < cutoff) sleepTab(ctx, t);
  }
}

// 主页窗口在 Windows 上也要能用切换快捷键
function bindShortcutsLite(wc) {
  if (IS_MAC) return;
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown' || !i.control) return;
    const k = i.key.length === 1 ? i.key.toLowerCase() : i.key;
    let fn = null;
    if (i.alt && k === ']') fn = () => cycleProfile(1);
    else if (i.alt && k === '[') fn = () => cycleProfile(-1);
    else if (i.alt && /^[0-9]$/.test(k)) { const p = profiles[(Number(k) + 9) % 10]; if (p) fn = () => openProfile(p.id); }
    if (fn) { e.preventDefault(); fn(); }
  });
}

function bindShortcuts(ctx, wc) {
  if (IS_MAC) return;
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const k = i.key.length === 1 ? i.key.toLowerCase() : i.key;
    const c = i.control, sh = i.shift, a = i.alt;
    const t = activeTab(ctx);
    const awc = activeWC(ctx);
    const send = (ch, ...x) => ctx.win.webContents.send(ch, ...x);
    let fn = null;
    if (c && a && /^[0-9]$/.test(k)) { const p = profiles[(Number(k) + 9) % 10]; if (p) fn = () => switchToProfile(ctx, p.id); }
    else if (c && !a && k === '`') fn = () => profileMenu(ctx);
    else if (c && a && k === ']') fn = () => cycleProfile(1);
    else if (c && a && k === '[') fn = () => cycleProfile(-1);
    else if (c && a && k === 'b') fn = () => showHome({ batch: { url: t ? tabInfo(t, new Set()).url : '' } });
    else if (c && sh && k === 't') fn = () => reopenClosed(ctx);
    else if (c && sh && k === 'h') fn = () => showHome();
    else if (c && sh && k === 'b') fn = () => setSettings({ bookmarksBar: !settings.bookmarksBar });
    else if (c && sh && k === 'o') fn = () => send('panel', 'bookmarks');
    else if ((c && sh && k === 'i') || k === 'F12') fn = () => awc?.toggleDevTools();
    else if (c && sh && k === 'r') fn = () => t && reloadTab(t, true);
    else if (c && k === 'Tab') fn = () => { const n = ctx.tabs.length; const idx = ctx.tabs.indexOf(t); switchTab(ctx, ctx.tabs[(idx + (sh ? -1 : 1) + n) % n].id); };
    else if (c && !a && /^[1-9]$/.test(k)) fn = () => { const x = k === '9' ? ctx.tabs[ctx.tabs.length - 1] : ctx.tabs[Number(k) - 1]; if (x) switchTab(ctx, x.id); };
    else if (c && !sh && k === 't') fn = () => createTab(ctx, null);
    else if (c && !sh && (k === 'w' || k === 'F4')) fn = () => closeTab(ctx, ctx.activeId);
    else if ((c && k === 'l') || (a && k === 'd') || k === 'F6') fn = () => send('focus-address');
    else if (k === 'F5') fn = () => t && reloadTab(t, c);
    else if (c && k === 'r') fn = () => t && reloadTab(t);
    else if (a && k === 'ArrowLeft') fn = () => awc?.navigationHistory.goBack();
    else if (a && k === 'ArrowRight') fn = () => awc?.navigationHistory.goForward();
    else if (a && k === 'Home') fn = () => awc && load(awc, null);
    else if (c && k === 'h') fn = () => send('panel', 'history');
    else if (c && k === 'j') fn = () => send('panel', 'downloads');
    else if (c && k === 'd') fn = () => toggleBookmark(ctx);
    else if (c && k === 'f') fn = () => send('find');
    else if (c && k === 'p') fn = () => awc?.print();
    else if (c && (k === '=' || k === '+')) fn = () => stepZoom(ctx, awc, 1);
    else if (c && k === '-') fn = () => stepZoom(ctx, awc, -1);
    else if (c && k === '0') fn = () => stepZoom(ctx, awc, 0);
    else if (k === 'F11') fn = () => setFs(ctx.win, !isFs(ctx.win));
    if (fn) { e.preventDefault(); fn(); }
  });
}

function endIntro(ctx) {
  if (!ctx.intro || ctx.win.isDestroyed()) return;
  ctx.intro = false;
  const t = activeTab(ctx);
  if (!t || !alive(t)) return;
  t.view.setVisible(true);
  if (!ctx.win.isFocused()) return; // 后台打开的窗口不抢焦点
  const raw = t.view.webContents.getURL() || t.startUrl;
  if (raw && internalPage(raw) !== 'newtab') t.view.webContents.focus();
  else ctx.win.webContents.send('focus-address');
}

function switchTab(ctx, id) {
  const tab = ctx.tabs.find((t) => t.id === id);
  if (!tab) return;
  const prev = activeTab(ctx);
  if (prev) prev.lastActive = Date.now();
  if (tab.sleep) {
    const { url } = tab.sleep;
    tab.sleep = null;
    attachView(ctx, tab, url);
  }
  ctx.activeId = id;
  tab.lastActive = Date.now();
  for (const t of ctx.tabs) if (alive(t)) t.view.setVisible(t.id === id && !ctx.intro);
  const raw = tab.view.webContents.getURL() || tab.startUrl;
  if (raw && internalPage(raw) !== 'newtab') { if (!ctx.intro) tab.view.webContents.focus(); }
  else ctx.win.webContents.send('focus-address');
  sendState(ctx);
}

function closeTab(ctx, id) {
  const idx = ctx.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const [tab] = ctx.tabs.splice(idx, 1);
  const url = tab.sleep ? tab.sleep.url : (alive(tab) ? tab.errorUrl || tab.view.webContents.getURL() : '');
  if (isWebURL(url)) { ctx.closed.push({ url, index: idx }); if (ctx.closed.length > 25) ctx.closed.shift(); }
  if (alive(tab)) {
    ctx.win.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
  }
  if (ctx.fsTab === id) ctx.fsTab = null;
  if (ctx.tabs.length === 0) { ctx.win.close(); return; }
  if (ctx.activeId === id) switchTab(ctx, ctx.tabs[Math.min(idx, ctx.tabs.length - 1)].id);
  else sendState(ctx);
  notifyHome();
}

function reopenClosed(ctx) {
  const last = ctx.closed.pop();
  if (!last) return;
  const after = ctx.tabs[last.index - 1];
  createTab(ctx, last.url, { afterId: after ? after.id : -1 });
}

function moveTab(ctx, id, to) {
  const from = ctx.tabs.findIndex((t) => t.id === id);
  if (from < 0) return;
  const [t] = ctx.tabs.splice(from, 1);
  ctx.tabs.splice(Math.max(0, Math.min(to, ctx.tabs.length)), 0, t);
  sendState(ctx);
}

function stepZoom(ctx, wc, dir) {
  if (!wc) return;
  const cur = wc.getZoomFactor();
  let next = 1;
  if (dir > 0) next = ZOOMS.find((z) => z > cur + 0.001) || ZOOMS[ZOOMS.length - 1];
  if (dir < 0) next = [...ZOOMS].reverse().find((z) => z < cur - 0.001) || ZOOMS[0];
  wc.setZoomFactor(next);
  sendState(ctx);
}

function reloadTab(tab, ignoreCache = false) {
  if (!alive(tab)) return;
  const wc = tab.view.webContents;
  if (tab.errorUrl && internalPage(wc.getURL()) === 'error') load(wc, tab.errorUrl);
  else if (ignoreCache) wc.reloadIgnoringCache();
  else wc.reload();
}

// ---------- 地址栏联想（悬浮在网页之上的透明视图） ----------
function ensureOverlay(ctx) {
  if (ctx.overlay) return ctx.overlay;
  const v = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload-overlay.js') } });
  v.setBackgroundColor('#00000000');
  v.setVisible(false);
  v.ready = new Promise((r) => v.webContents.once('did-finish-load', r));
  v.webContents.loadFile(path.join(__dirname, 'overlay.html'));
  ctx.win.contentView.addChildView(v);
  ctx.overlay = v;
  return v;
}
async function showOverlay(ctx, { items, sel, rect }) {
  if (!items.length || ctx.fsTab) return hideOverlay(ctx);
  const v = ensureOverlay(ctx);
  await v.ready;
  if (ctx.win.isDestroyed()) return;
  const pad = 12;
  v.setBounds({
    x: Math.round(rect.x - pad), y: Math.round(rect.y + rect.height - 4),
    width: Math.round(rect.width + pad * 2), height: items.length * 46 + 16 + pad * 2,
  });
  v.webContents.send('render', { items, sel, skin: skinPayload(ctx.id), lite: isLite() });
  if (!v.getVisible()) { ctx.win.contentView.addChildView(v); v.setVisible(true); }
}
function hideOverlay(ctx) {
  if (ctx.overlay && ctx.overlay.getVisible()) ctx.overlay.setVisible(false);
}

// ---------- 右键菜单 ----------
function pageMenu(ctx, tab, p) {
  const wc = tab.view.webContents;
  const sep = { type: 'separator' };
  const items = [];
  if (p.linkURL) {
    items.push(
      { label: '在新标签页中打开链接', click: () => createTab(ctx, p.linkURL, { activate: false, afterId: tab.id }) },
      { label: '用其他浏览器打开链接', submenu: otherProfilesMenu(ctx, p.linkURL) },
      { label: '复制链接地址', click: () => clipboard.writeText(p.linkURL) },
      { label: '链接另存为…', click: () => wc.downloadURL(p.linkURL) }, sep);
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push(
      { label: '在新标签页中打开图片', click: () => createTab(ctx, p.srcURL, { activate: false, afterId: tab.id }) },
      { label: '复制图片', click: () => wc.copyImageAt(p.x, p.y) },
      { label: '复制图片地址', click: () => clipboard.writeText(p.srcURL) },
      { label: '图片另存为…', click: () => wc.downloadURL(p.srcURL) }, sep);
  }
  if (p.isEditable) {
    items.push({ label: '撤销', role: 'undo' }, sep, { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }, sep);
  } else if (p.selectionText) {
    const q = p.selectionText.trim();
    items.push({ label: '复制', role: 'copy' },
      { label: `搜索“${q.length > 16 ? `${q.slice(0, 16)}…` : q}”`, click: () => createTab(ctx, searchURL(q), { afterId: tab.id }) }, sep);
  }
  items.push(
    { label: '后退', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
    { label: '前进', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
    { label: '重新加载', click: () => reloadTab(tab) }, sep,
    { label: '打印…', click: () => wc.print() },
    { label: '检查', click: () => wc.inspectElement(p.x, p.y) });
  Menu.buildFromTemplate(items).popup({ window: ctx.win });
}

function tabMenu(ctx, id) {
  const tab = ctx.tabs.find((t) => t.id === id);
  if (!tab) return;
  const wc = alive(tab) ? tab.view.webContents : null;
  const i = ctx.tabs.indexOf(tab);
  const sep = { type: 'separator' };
  Menu.buildFromTemplate([
    { label: '在右侧新建标签页', click: () => createTab(ctx, null, { afterId: id }) },
    ...(isWebURL(tabInfo(tab, new Set()).url) ? [{ label: '用其他浏览器打开', submenu: otherProfilesMenu(ctx, tabInfo(tab, new Set()).url) }] : []),
    sep,
    { label: '重新加载', click: () => reloadTab(tab) },
    { label: '复制标签页', click: () => { const u = tabInfo(tab, new Set()).url; createTab(ctx, u || null, { afterId: id }); } },
    { label: wc?.isAudioMuted() ? '取消静音' : '将此网站静音', enabled: !!wc, click: () => { wc.setAudioMuted(!wc.isAudioMuted()); sendState(ctx); } },
    { label: '让此标签页休眠（释放内存）', enabled: !!wc && id !== ctx.activeId, click: () => sleepTab(ctx, tab) },
    sep,
    { label: '关闭标签页', click: () => closeTab(ctx, id) },
    { label: '关闭其他标签页', enabled: ctx.tabs.length > 1, click: () => ctx.tabs.filter((t) => t.id !== id).forEach((t) => closeTab(ctx, t.id)) },
    { label: '关闭右侧标签页', enabled: i < ctx.tabs.length - 1, click: () => ctx.tabs.slice(i + 1).forEach((t) => closeTab(ctx, t.id)) },
    sep,
    { label: '重新打开关闭的标签页', enabled: ctx.closed.length > 0, click: () => reopenClosed(ctx) },
  ]).popup({ window: ctx.win });
}

async function confirmClearData(ctx) {
  const name = profiles.find((p) => p.id === ctx.id)?.name || '';
  const { response } = await dialog.showMessageBox(ctx.win, {
    type: 'warning', buttons: ['取消', '清除'], defaultId: 1, cancelId: 0,
    message: `清除「${name}」的浏览数据？`,
    detail: '将清除这个浏览器的 Cookie、登录状态、缓存和历史记录。其他浏览器不受影响。',
  });
  if (response !== 1) return;
  await clearProfileData(ctx.id);
  for (const t of ctx.tabs) reloadTab(t);
}

function mainMenu(ctx, x, y) {
  const wc = activeWC(ctx);
  const zoom = wc ? Math.round(wc.getZoomFactor() * 100) : 100;
  const sep = { type: 'separator' };
  Menu.buildFromTemplate([
    { label: '新建标签页', accelerator: 'CmdOrCtrl+T', click: () => createTab(ctx, null) },
    { label: '重新打开关闭的标签页', accelerator: 'CmdOrCtrl+Shift+T', enabled: ctx.closed.length > 0, click: () => reopenClosed(ctx) },
    { label: '切换浏览器…', accelerator: 'CmdOrCtrl+`', click: () => profileMenu(ctx) },
    ...(isWebURL(activeTab(ctx) ? tabInfo(activeTab(ctx), new Set()).url : '') ? [
      { label: '用其他浏览器打开此网页', submenu: otherProfilesMenu(ctx, tabInfo(activeTab(ctx), new Set()).url) },
    ] : []),
    { label: '批量打开网页…', accelerator: 'CmdOrCtrl+Alt+B', click: () => showHome({ batch: { url: activeTab(ctx) ? tabInfo(activeTab(ctx), new Set()).url : '' } }) },
    sep,
    { label: '历史记录', accelerator: HK.history, click: () => ctx.win.webContents.send('panel', 'history') },
    { label: '书签', accelerator: 'CmdOrCtrl+Shift+O', click: () => ctx.win.webContents.send('panel', 'bookmarks') },
    { label: '下载内容', accelerator: HK.downloads, click: () => ctx.win.webContents.send('panel', 'downloads') },
    { label: '为此网页添加书签', accelerator: 'CmdOrCtrl+D', click: () => toggleBookmark(ctx) },
    { label: '显示书签栏', type: 'checkbox', checked: settings.bookmarksBar, click: () => setSettings({ bookmarksBar: !settings.bookmarksBar }) },
    sep,
    { label: `缩放（${zoom}%）`, enabled: false },
    { label: '放大', click: () => stepZoom(ctx, wc, 1) },
    { label: '缩小', click: () => stepZoom(ctx, wc, -1) },
    { label: '恢复到 100%', enabled: zoom !== 100, click: () => stepZoom(ctx, wc, 0) },
    sep,
    { label: isFs(ctx.win) ? '退出全屏' : '全屏', accelerator: IS_MAC ? 'Ctrl+Cmd+F' : 'F11', click: () => setFs(ctx.win, !isFs(ctx.win)) },
    { label: '查找…', accelerator: 'CmdOrCtrl+F', click: () => ctx.win.webContents.send('find') },
    { label: '打印…', accelerator: 'CmdOrCtrl+P', click: () => wc?.print() },
    { label: '开发者工具', click: () => wc?.toggleDevTools() },
    sep,
    {
      label: '主题',
      submenu: [
        { label: `跟随默认主题（${SKINS[settings.skin]?.name || '经典'}）`, type: 'radio', checked: !profiles.find((p) => p.id === ctx.id)?.skin,
          click: () => setProfileSkin(ctx.id, { skin: '' }) },
        { type: 'separator' },
        ...Object.entries(SKINS).map(([sid, k]) => ({
          label: k.name, type: 'radio', checked: profiles.find((p) => p.id === ctx.id)?.skin === sid, click: () => setProfileSkin(ctx.id, { skin: sid }),
        })),
        { type: 'separator' },
        { label: '设置新标签页壁纸…', click: () => pickWallpaper(ctx.id, ctx.win) },
        { label: '移除壁纸', enabled: !!profiles.find((p) => p.id === ctx.id)?.wallpaper, click: () => clearWallpaper(ctx.id) },
      ],
    },
    sep,
    { label: '清除浏览数据…', click: () => confirmClearData(ctx) },
    { label: '设置', accelerator: 'CmdOrCtrl+,', click: () => showHome({ settings: true }) },
  ]).popup({ window: ctx.win, x: Math.round(x), y: Math.round(y) });
}

// ---------- 书签 ----------
function pushBookmarks(pid) {
  const ctx = ctxs.get(pid);
  if (!ctx) return;
  ctx.win.webContents.send('bookmarks', bookmarks(pid).data);
  sendState(ctx);
}
function toggleBookmark(ctx) {
  const t = activeTab(ctx);
  if (!t) return;
  const info = tabInfo(t, new Set());
  if (!info.url) return;
  const s = bookmarks(ctx.id);
  const i = s.data.findIndex((b) => b.url === info.url);
  if (i >= 0) s.data.splice(i, 1);
  else s.data.push({ url: info.url, title: info.title, favicon: info.favicon, time: Date.now() });
  saveStore(s);
  pushBookmarks(ctx.id);
}
function removeBookmark(ctx, url) {
  const s = bookmarks(ctx.id);
  s.data = s.data.filter((b) => b.url !== url);
  saveStore(s);
  pushBookmarks(ctx.id);
}

// ---------- 浏览器 IPC ----------
function onBrowser(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    const ctx = ctxFromSender(e.sender);
    return ctx ? fn(ctx, ...args) : null;
  });
}
const withActive = (fn) => (ctx, ...a) => { const t = activeTab(ctx); if (t && alive(t)) return fn(t.view.webContents, ctx, ...a); };

onBrowser('tab:new', (ctx, url, background) => { createTab(ctx, url ? toURL(url) : null, { activate: !background }); });
onBrowser('tab:close', (ctx, id) => closeTab(ctx, id ?? ctx.activeId));
onBrowser('tab:switch', (ctx, id) => switchTab(ctx, id));
onBrowser('tab:move', (ctx, id, to) => moveTab(ctx, id, to));
onBrowser('tab:menu', (ctx, id) => tabMenu(ctx, id));
onBrowser('tab:mute', (ctx, id) => {
  const t = ctx.tabs.find((x) => x.id === id);
  if (t && alive(t)) { t.view.webContents.setAudioMuted(!t.view.webContents.isAudioMuted()); sendState(ctx); }
});
onBrowser('nav:go', withActive((wc, ctx, text) => { const u = toURL(text); if (u) { load(wc, u); wc.focus(); } }));
onBrowser('nav:back', withActive((wc) => wc.navigationHistory.goBack()));
onBrowser('nav:forward', withActive((wc) => wc.navigationHistory.goForward()));
onBrowser('nav:reload', (ctx) => { const t = activeTab(ctx); if (t) reloadTab(t); });
onBrowser('nav:stop', withActive((wc) => wc.stop()));
onBrowser('nav:newtab', withActive((wc) => load(wc, null)));
onBrowser('zoom:reset', withActive((wc, ctx) => stepZoom(ctx, wc, 0)));
onBrowser('panel:set', (ctx, open) => { ctx.panel = !!open; layout(ctx); });
onBrowser('menu:main', (ctx, x, y) => mainMenu(ctx, x, y));
onBrowser('suggest:query', (ctx, text) => suggestions(ctx.id, text || ''));
onBrowser('suggest:show', (ctx, payload) => showOverlay(ctx, payload));
onBrowser('suggest:hide', (ctx) => hideOverlay(ctx));
onBrowser('overlay:pick', (ctx, i) => { hideOverlay(ctx); ctx.win.webContents.send('suggest-pick', i); });
onBrowser('history:get', (ctx, q) => {
  const query = (q || '').trim().toLowerCase();
  const list = history(ctx.id).data;
  return (query ? list.filter((h) => h.url.toLowerCase().includes(query) || (h.title || '').toLowerCase().includes(query)) : list).slice(0, 600);
});
onBrowser('history:delete', (ctx, time) => {
  const s = history(ctx.id);
  const i = s.data.findIndex((h) => h.time === time);
  if (i >= 0) { s.data.splice(i, 1); saveStore(s); }
});
onBrowser('history:clear', (ctx) => { const s = history(ctx.id); s.data = []; saveStore(s, true); notifyHome(); });
onBrowser('cookies:clear', async (ctx) => {
  await getSession(ctx.id).clearStorageData();
  for (const t of ctx.tabs) reloadTab(t);
});
onBrowser('data:clear', (ctx) => confirmClearData(ctx));
onBrowser('bookmark:toggle', (ctx) => toggleBookmark(ctx));
onBrowser('bookmark:remove', (ctx, url) => removeBookmark(ctx, url));
onBrowser('bookmark:menu', (ctx, url) => {
  Menu.buildFromTemplate([
    { label: '在新标签页中打开', click: () => createTab(ctx, url) },
    { label: '在后台标签页中打开', click: () => createTab(ctx, url, { activate: false }) },
    { label: '复制链接地址', click: () => clipboard.writeText(url) },
    { type: 'separator' },
    { label: '删除书签', click: () => removeBookmark(ctx, url) },
  ]).popup({ window: ctx.win });
});
onBrowser('download:action', (ctx, id, action) => {
  const list = downloads.get(ctx.id) || [];
  const d = list.find((x) => x.id === id);
  if (!d) return;
  const item = dlItems.get(id);
  if (action === 'open') shell.openPath(d.path);
  if (action === 'show') shell.showItemInFolder(d.path);
  if (action === 'cancel') item?.cancel();
  if (action === 'pause') item?.pause();
  if (action === 'resume') item?.resume();
  if (action === 'retry') getSession(ctx.id).downloadURL(d.url);
  if (action === 'remove' && !item) list.splice(list.indexOf(d), 1);
  pushDownloads(ctx.id, true);
});
onBrowser('download:clear', (ctx) => {
  downloads.set(ctx.id, (downloads.get(ctx.id) || []).filter((d) => dlItems.has(d.id)));
  pushDownloads(ctx.id, true);
});
onBrowser('download:folder', () => shell.openPath(app.getPath('downloads')));
onBrowser('home:show', () => showHome());
onBrowser('menu:profiles', (ctx, x, y) => profileMenu(ctx, x, y));
onBrowser('profile:switch', (ctx, id) => switchToProfile(ctx, id));
onBrowser('sidebar:set', (_ctx, on) => setSettings({ sidebar: !!on }));
onBrowser('intro:done', (ctx) => endIntro(ctx));
onBrowser('find:run', withActive((wc, ctx, text, forward) => {
  if (text) wc.findInPage(text, { forward: forward !== false, findNext: true });
  else { wc.stopFindInPage('clearSelection'); ctx.win.webContents.send('find-result', { active: 0, total: 0 }); }
}));
onBrowser('find:stop', withActive((wc) => { wc.stopFindInPage('keepSelection'); wc.focus(); }));

// 新标签页等内置页面的接口（只对内置页面开放）
ipcMain.handle('internal:topsites', (e) => {
  if (!internalPage(e.sender.getURL())) return [];
  const found = tabFromSender(e.sender);
  return found ? topSites(found.ctx.id) : [];
});
// 新标签页上的“主题”面板
const internalCtx = (e) => (internalPage(e.sender.getURL()) === 'newtab' ? tabFromSender(e.sender) : null);
ipcMain.handle('internal:setSkin', (e, skin) => {
  const f = internalCtx(e);
  if (f && (skin === '' || SKINS[skin])) setProfileSkin(f.ctx.id, { skin });
});
ipcMain.handle('internal:pickWallpaper', (e) => { const f = internalCtx(e); return f ? pickWallpaper(f.ctx.id, f.ctx.win) : false; });
ipcMain.handle('internal:clearWallpaper', (e) => { const f = internalCtx(e); if (f) clearWallpaper(f.ctx.id); });
ipcMain.handle('internal:info', (e) => {
  if (!internalPage(e.sender.getURL())) return null;
  const found = tabFromSender(e.sender);
  const p = found && profiles.find((x) => x.id === found.ctx.id);
  return { engine: settings.engine, name: p?.name || '', color: p?.color || COLORS[0], lite: isLite(), skin: found ? skinPayload(found.ctx.id) : null, skins: skinList() };
});

// ---------- 主页 IPC ----------
async function clearProfileData(id) {
  const ses = getSession(id);
  await ses.clearStorageData();
  await ses.clearCache();
  const s = history(id); s.data = []; saveStore(s, true);
  notifyHome();
}

ipcMain.handle('profiles:list', () => profileList());
ipcMain.handle('profiles:create', (_e, name, color, extra = {}) => {
  if (profiles.length >= MAX_PROFILES) return { error: `最多只能创建 ${MAX_PROFILES} 个浏览器` };
  const used = new Set(profiles.map((p) => p.color));
  const p = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: (name || '').trim().slice(0, 20) || `浏览器 ${profiles.length + 1}`,
    color: COLORS.includes(color) ? color : (COLORS.find((c) => !used.has(c)) || COLORS[0]),
    note: String(extra.note || '').trim().slice(0, 40),
    skin: SKINS[extra.skin] ? extra.skin : '',
    startUrl: String(extra.startUrl || '').trim(),
    created: Date.now(),
  };
  profiles.push(p); saveProfiles(); profilesChanged();
  return { profile: p };
});
ipcMain.handle('profiles:update', (_e, id, patch) => {
  const p = profiles.find((x) => x.id === id);
  if (!p) return;
  if (patch.name && patch.name.trim()) p.name = patch.name.trim().slice(0, 20);
  if (COLORS.includes(patch.color)) p.color = patch.color;
  if (typeof patch.note === 'string') p.note = patch.note.trim().slice(0, 40);
  if (typeof patch.startUrl === 'string') p.startUrl = patch.startUrl.trim();
  if (typeof patch.skin === 'string' && (patch.skin === '' || SKINS[patch.skin])) p.skin = patch.skin;
  saveProfiles(); profilesChanged();
  const ctx = ctxs.get(id);
  if (ctx) {
    applySkin(ctx);
    ctx.win.webContents.send('profile-updated', { name: p.name, color: p.color });
    applyWinIcon(ctx);
    sendState(ctx);
  }
});
// 批量改名：[{ id, name }, ...]
ipcMain.handle('profiles:renameMany', (_e, list) => {
  for (const { id, name } of list || []) {
    const p = profiles.find((x) => x.id === id);
    const n = String(name || '').trim().slice(0, 20);
    if (!p || !n) continue;
    p.name = n;
    const ctx = ctxs.get(id);
    if (ctx) { ctx.win.webContents.send('profile-updated', { name: p.name, color: p.color }); applyWinIcon(ctx); sendState(ctx); }
  }
  saveProfiles();
  profilesChanged();
});
ipcMain.handle('profiles:reorder', (_e, ids) => {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const next = ids.map((id) => byId.get(id)).filter(Boolean);
  if (next.length === profiles.length) { profiles = next; saveProfiles(); profilesChanged(); }
});
ipcMain.handle('profiles:open', (_e, id) => openProfile(id));
ipcMain.handle('profiles:openMany', async (_e, ids) => {
  for (const id of ids) {
    if (ctxs.has(id)) continue;
    openProfile(id);
    await new Promise((r) => setTimeout(r, 160));
  }
});
ipcMain.handle('profiles:closeWin', (_e, ids) => {
  for (const id of [].concat(ids)) ctxs.get(id)?.win.close();
});
ipcMain.handle('windows:tile', () => tileWindows());
ipcMain.handle('profiles:openAllBg', () => openAllInBackground());
ipcMain.handle('windows:fullscreenAll', () => fullscreenAll());
ipcMain.handle('windows:fsState', () => {
  const list = [...ctxs.values()].filter((c) => !c.win.isDestroyed());
  return { running: list.length, allFs: list.length > 0 && list.every((c) => isFs(c.win)) };
});
onBrowser('pill:rect', (ctx, r) => { ctx.pill = r; });
ipcMain.handle('batch:open', (_e, opts) => batchOpen(opts || {}));
ipcMain.handle('profiles:clear', async (_e, id) => {
  await clearProfileData(id);
  const ctx = ctxs.get(id);
  if (ctx) for (const t of ctx.tabs) reloadTab(t);
});
ipcMain.handle('profiles:delete', async (_e, id) => {
  const ctx = ctxs.get(id);
  if (ctx) ctx.win.destroy();
  const ses = getSession(id);
  await ses.clearStorageData();
  await ses.clearCache();
  dropStore('history', id);
  dropStore('bookmarks', id);
  downloads.delete(id);
  sessionCache.delete(id);
  fs.rmSync(dataPath('sessions', `${id}.json`), { force: true });
  const wp = profiles.find((x) => x.id === id)?.wallpaper;
  if (wp) fs.rmSync(dataPath('wallpapers', wp), { force: true });
  profiles = profiles.filter((p) => p.id !== id);
  saveProfiles(); profilesChanged();
});
ipcMain.handle('app:info', () => ({
  version: app.getVersion(), chrome: process.versions.chrome, colors: COLORS, max: MAX_PROFILES, credit: CREDIT, skins: skinList(),
  memGB: Math.round(os.totalmem() / 1024 ** 3), cpus: os.cpus().length, gpuOff: app.isHardwareAccelerationEnabled?.() === false,
}));
ipcMain.handle('settings:get', () => publicSettings());
ipcMain.handle('app:relaunch', () => { saveEverything(); app.relaunch(); setTimeout(() => app.exit(0), 300); });
ipcMain.handle('settings:set', (_e, patch) => setSettings(patch));

function setSettings(patch) {
  settings = { ...settings, ...patch };
  if (patch.hardwareAcceleration === true) settings.gpuCrashes = 0;
  saveSettings();
  nativeTheme.themeSource = settings.theme;
  for (const ctx of ctxs.values()) {
    ctx.win.webContents.send('settings', publicSettings());
    applySkin(ctx);
    layout(ctx);
  }
  if (homeWin && !homeWin.isDestroyed()) homeWin.webContents.send('settings', publicSettings());
  buildMenu();
  return publicSettings();
}

// ---------- 菜单与快捷键 ----------
const focusedCtx = () => ctxFromWindow(BrowserWindow.getFocusedWindow());
const withFocused = (fn) => () => { const ctx = focusedCtx(); if (ctx) fn(ctx); };
const nthTab = (n) => withFocused((c) => { const t = n === 9 ? c.tabs[c.tabs.length - 1] : c.tabs[n - 1]; if (t) switchTab(c, t.id); });
const cycleTab = (d) => withFocused((c) => {
  const i = c.tabs.findIndex((t) => t.id === c.activeId);
  switchTab(c, c.tabs[(i + d + c.tabs.length) % c.tabs.length].id);
});

function buildMenu() {
  const template = [
    ...(IS_MAC ? [{
      label: 'YYING浏览器',
      submenu: [
        { label: '关于 YYING浏览器', role: 'about' }, { type: 'separator' },
        { label: '设置…', accelerator: 'Cmd+,', click: () => showHome({ settings: true }) },
        { type: 'separator' },
        { label: '隐藏', role: 'hide' }, { label: '隐藏其他', role: 'hideOthers' },
        { type: 'separator' }, { label: '退出', role: 'quit' },
      ],
    }] : []),
    {
      label: '文件',
      submenu: [
        { label: '新建标签页', accelerator: 'CmdOrCtrl+T', click: withFocused((c) => createTab(c, null)) },
        { label: '重新打开关闭的标签页', accelerator: 'CmdOrCtrl+Shift+T', click: withFocused(reopenClosed) },
        { label: '关闭标签页', accelerator: 'CmdOrCtrl+W', click: () => {
          const ctx = focusedCtx();
          if (ctx) closeTab(ctx, ctx.activeId); else BrowserWindow.getFocusedWindow()?.close();
        } },
        { type: 'separator' },
        { label: '打开地址栏', accelerator: 'CmdOrCtrl+L', click: withFocused((c) => c.win.webContents.send('focus-address')) },
        { label: '选择浏览器（主页）', click: () => showHome() },
        { label: '打印…', accelerator: 'CmdOrCtrl+P', click: withFocused((c) => activeWC(c)?.print()) },
        ...(IS_MAC ? [] : [{ type: 'separator' }, { label: '设置', accelerator: 'Ctrl+,', click: () => showHome({ settings: true }) },
          { label: '退出', role: 'quit' }]),
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' }, { type: 'separator' },
        { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }, { type: 'separator' },
        { label: '查找…', accelerator: 'CmdOrCtrl+F', click: withFocused((c) => c.win.webContents.send('find')) },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: withFocused((c) => { const t = activeTab(c); if (t) reloadTab(t); }) },
        { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', click: withFocused((c) => { const t = activeTab(c); if (t) reloadTab(t, true); }) },
        { type: 'separator' },
        { label: '显示书签栏', type: 'checkbox', checked: settings.bookmarksBar, accelerator: 'CmdOrCtrl+Shift+B',
          click: () => setSettings({ bookmarksBar: !settings.bookmarksBar }) },
        { type: 'separator' },
        { label: '放大', accelerator: 'CmdOrCtrl+=', click: withFocused((c) => stepZoom(c, activeWC(c), 1)) },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', click: withFocused((c) => stepZoom(c, activeWC(c), -1)) },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', click: withFocused((c) => stepZoom(c, activeWC(c), 0)) },
        { type: 'separator' },
        { label: '开发者工具', accelerator: IS_MAC ? 'Alt+Cmd+I' : 'F12', click: withFocused((c) => activeWC(c)?.toggleDevTools()) },
        { label: '进入 / 退出全屏', accelerator: IS_MAC ? 'Ctrl+Cmd+F' : 'F11', click: () => {
          const w = BrowserWindow.getFocusedWindow();
          if (!w) return;
          const c = ctxFromWindow(w);
          if (c) setFs(w, !isFs(w)); else w.setFullScreen(!w.isFullScreen());
        } },
      ],
    },
    {
      label: '历史',
      submenu: [
        { label: '后退', accelerator: 'CmdOrCtrl+[', click: withFocused((c) => activeWC(c)?.navigationHistory.goBack()) },
        { label: '前进', accelerator: 'CmdOrCtrl+]', click: withFocused((c) => activeWC(c)?.navigationHistory.goForward()) },
        { type: 'separator' },
        { label: '显示全部历史记录', accelerator: HK.history, click: withFocused((c) => c.win.webContents.send('panel', 'history')) },
      ],
    },
    {
      label: '书签',
      submenu: [
        { label: '为此网页添加书签', accelerator: 'CmdOrCtrl+D', click: withFocused(toggleBookmark) },
        { label: '书签管理', accelerator: 'CmdOrCtrl+Shift+O', click: withFocused((c) => c.win.webContents.send('panel', 'bookmarks')) },
        { label: '下载内容', accelerator: HK.downloads, click: withFocused((c) => c.win.webContents.send('panel', 'downloads')) },
      ],
    },
    {
      label: '标签页',
      submenu: [
        { label: '下一个标签页', accelerator: 'Ctrl+Tab', click: cycleTab(1) },
        { label: '上一个标签页', accelerator: 'Ctrl+Shift+Tab', click: cycleTab(-1) },
        { label: '下一个标签页', accelerator: 'CmdOrCtrl+Alt+Right', visible: false, click: cycleTab(1) },
        { label: '上一个标签页', accelerator: 'CmdOrCtrl+Alt+Left', visible: false, click: cycleTab(-1) },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ label: `标签页 ${n}`, accelerator: `CmdOrCtrl+${n}`, visible: false, click: nthTab(n) })),
      ],
    },
    {
      label: '浏览器',
      submenu: [
        ...profileItems(focusedCtx()?.id || null).map((it) => ({ ...it, type: 'normal' })),
        { type: 'separator' },
        { label: '切换浏览器…', accelerator: 'CmdOrCtrl+`', click: () => { const c = focusedCtx(); if (c) profileMenu(c); } },
        { label: '下一个浏览器', accelerator: 'CmdOrCtrl+Alt+]', click: () => cycleProfile(1) },
        { label: '上一个浏览器', accelerator: 'CmdOrCtrl+Alt+[', click: () => cycleProfile(-1) },
        { label: '批量打开网页…', accelerator: 'CmdOrCtrl+Alt+B', click: () => showHome({ batch: {} }) },
        { label: '排列所有浏览器窗口', accelerator: 'CmdOrCtrl+Alt+T', click: tileWindows },
        { label: '打开主页', accelerator: 'CmdOrCtrl+Shift+H', click: () => showHome() },
      ],
    },
    { label: '窗口', submenu: [{ label: '最小化', role: 'minimize' }, { label: '缩放', role: 'zoom' }, { type: 'separator' },
      { label: '排列所有浏览器窗口', click: tileWindows }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- 启动 ----------
app.whenReady().then(() => {
  profiles = readJSON(dataPath('profiles.json'), []);
  saveSettings();
  nativeTheme.themeSource = settings.theme;
  setInterval(sleepIdleTabs, 60000);
  // 断电保护：每 15 秒保存一次打开的标签页，每 30 秒把 Cookie（登录状态）写进硬盘
  setInterval(() => { for (const ctx of ctxs.values()) { try { if (!ctx.win.isDestroyed()) saveSession(ctx); } catch {} } }, 15000);
  setInterval(() => { for (const id of readySessions) session.fromPartition(partitionOf(id)).cookies.flushStore().catch(() => {}); }, 30000);
  // 系统关机 / 注销时抢在被结束前保存
  powerMonitor.on('shutdown', saveEverything);
  powerMonitor.on('suspend', saveEverything);
  nativeTheme.on('updated', () => { for (const ctx of ctxs.values()) applySkin(ctx); });
  // 稳定运行 10 分钟没再崩溃，就把显卡崩溃计数清零，避免偶发崩溃累积后误关硬件加速
  setTimeout(() => { if (settings.gpuCrashes && settings.hardwareAcceleration) { settings.gpuCrashes = 0; saveSettings(); } }, 10 * 60000);
  // 拔掉外接显示器后，把跑到屏幕外的窗口拉回来
  screen.on('display-removed', () => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (validBounds(w.getBounds())) continue;
      const a = screen.getPrimaryDisplay().workArea;
      const b = w.getBounds();
      w.setBounds({ x: a.x + 40, y: a.y + 30, width: Math.min(b.width, a.width - 80), height: Math.min(b.height, a.height - 60) });
    }
  });
  if (profiles.length === 0) {
    profiles.push({ id: 'default', name: '浏览器 1', color: COLORS[0], created: Date.now() });
    saveProfiles();
  }
  buildMenu();
  updateDock();
  showHome();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) showHome(); });
});

app.on('web-contents-created', (_e, wc) => {
  // 外部协议（mailto:、weixin: 等）交给系统处理
  wc.on('will-navigate', (ev, url) => {
    if (!/^(https?|file|about|data|blob|chrome|devtools):/i.test(url)) { ev.preventDefault(); shell.openExternal(url); }
  });
});

app.on('before-quit', saveEverything);
app.on('second-instance', () => showHome());
app.on('window-all-closed', () => { if (!IS_MAC) app.quit(); });
