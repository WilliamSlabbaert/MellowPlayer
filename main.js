const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// ponytail: last-resort crash log so a startup failure isn't a silent exit.
// Attached BEFORE the sql.js require, which is the most likely thing to throw.
function logCrash(err) {
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'crash.log'),
      new Date().toISOString() + '\n' + (err && err.stack || String(err)) + '\n');
  } catch {}
}
process.on('uncaughtException', logCrash);
process.on('unhandledRejection', logCrash);

const initSqlJs = require('sql.js');

let db;
let dbPath;

async function initDb() {
  const SQL = await initSqlJs({
    locateFile: f => path.join(__dirname, 'node_modules', 'sql.js', 'dist', f),
  });
  dbPath = path.join(app.getPath('userData'), 'vault.db');
  console.log('[db] path:', dbPath);
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      size INTEGER,
      duration REAL,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      start REAL NOT NULL,
      end_ REAL NOT NULL,
      position INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_chapters_video ON chapters(video_id);
    PRAGMA foreign_keys = ON;
  `);
  persist();
}

function persist() {
  // ponytail: whole-DB write on every mutation. Fine for hundreds of vaults; move to WAL/incremental if it ever matters.
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function rows(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

function upsertVideoByPath(p, name, size) {
  const existing = rows('SELECT id FROM videos WHERE path = ?', [p])[0];
  if (existing) {
    db.run('UPDATE videos SET name=?, size=?, updated_at=? WHERE id=?',
      [name, size, Date.now(), existing.id]);
    return existing.id;
  }
  db.run('INSERT INTO videos (path, name, size, duration, updated_at) VALUES (?, ?, ?, 0, ?)',
    [p, name, size, Date.now()]);
  return rows('SELECT last_insert_rowid() AS id')[0].id;
}

function recordFor(id) {
  const v = rows('SELECT * FROM videos WHERE id = ?', [id])[0];
  if (!v) return null;
  const chapters = rows(
    'SELECT id, title, start, end_ AS end FROM chapters WHERE video_id = ? ORDER BY start',
    [id]
  );
  return {
    id: v.id,
    path: v.path,
    fileUrl: pathToFileURL(v.path).href,
    name: v.name,
    size: v.size,
    duration: v.duration,
    updatedAt: v.updated_at,
    chapters,
  };
}

/* --- IPC --- */
ipcMain.handle('vault:list', () => rows(`
  SELECT v.id, v.path, v.name, v.size, v.duration, v.updated_at AS updatedAt,
         (SELECT COUNT(*) FROM chapters c WHERE c.video_id = v.id) AS chapterCount
  FROM videos v
  ORDER BY v.updated_at DESC
`));

ipcMain.handle('vault:pick', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Open video',
    properties: ['openFile'],
    filters: [{ name: 'Video', extensions: ['mp4','mov','mkv','webm','avi','m4v','ogv','wmv'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  const stat = fs.statSync(p);
  const id = upsertVideoByPath(p, path.basename(p), stat.size);
  persist();
  return recordFor(id);
});

ipcMain.handle('vault:addFromPath', (_e, p) => {
  if (!p || !fs.existsSync(p)) return null;
  const stat = fs.statSync(p);
  const id = upsertVideoByPath(p, path.basename(p), stat.size);
  persist();
  return recordFor(id);
});

ipcMain.handle('vault:open', (_e, id) => recordFor(id));

ipcMain.handle('vault:setDuration', (_e, id, duration) => {
  db.run('UPDATE videos SET duration = ?, updated_at = ? WHERE id = ?', [duration, Date.now(), id]);
  persist();
});

ipcMain.handle('vault:saveChapters', (_e, videoId, chapters) => {
  db.run('BEGIN');
  try {
    db.run('DELETE FROM chapters WHERE video_id = ?', [videoId]);
    const ins = db.prepare('INSERT INTO chapters (video_id, title, start, end_, position) VALUES (?, ?, ?, ?, ?)');
    chapters.forEach((c, i) => ins.run([videoId, c.title, c.start, c.end, i]));
    ins.free();
    db.run('UPDATE videos SET updated_at = ? WHERE id = ?', [Date.now(), videoId]);
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK'); throw e;
  }
  persist();
  return rows('SELECT id, title, start, end_ AS end FROM chapters WHERE video_id = ? ORDER BY start', [videoId]);
});

ipcMain.handle('vault:delete', (_e, id) => {
  db.run('DELETE FROM chapters WHERE video_id = ?', [id]);
  db.run('DELETE FROM videos WHERE id = ?', [id]);
  persist();
});

ipcMain.handle('vault:pickJson', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Import chapters JSON',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return fs.readFileSync(r.filePaths[0], 'utf8');
});

/* --- Window --- */
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1115',
    title: 'MellowPlayer',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('console-message', (_e, level, msg, line, src) => {
    const tag = ['LOG','WARN','ERR','INFO','DEBUG'][level] || 'LOG';
    console.log(`[renderer/${tag}] ${msg}${src ? ` (${src}:${line})` : ''}`);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.error('[render-process-gone]', d));
  win.loadFile('index.html');
}

process.on('unhandledRejection', r => console.error('[unhandledRejection]', r));
process.on('uncaughtException',   e => console.error('[uncaughtException]', e));

app.whenReady().then(async () => {
  try { await initDb(); } catch (e) { console.error('[initDb] failed:', e); }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
