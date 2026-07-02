const vault = window.api;

const $ = id => document.getElementById(id);
const video = $('player');
const brand = $('brand');
const videoName = $('videoName');
const titleInput = $('titleInput');
const startInput = $('startInput');
const endInput = $('endInput');
const grabStart = $('grabStart');
const grabEnd = $('grabEnd');
const addBtn = $('addBtn');
const formError = $('formError');
const chapterList = $('chapterList');
const track = $('track');
const playhead = $('playhead');
const timeline = $('timeline');
const hoverLine = $('hoverLine');
const tooltip = $('tooltip');
const openBtn = $('openBtn');
const importBtn = $('importBtn');
const libraryBtn = $('libraryBtn');
const nowTitle = $('nowTitle');
const nowTime = $('nowTime');
const vaultView = $('vaultView');
const playerView = $('playerView');
const vaultGrid = $('vaultGrid');
const vaultEmpty = $('vaultEmpty');
const vaultSearch = $('vaultSearch');
const templateBtn = $('templateBtn');
const templateDialog = $('templateDialog');
const templateJson = $('templateJson');
const copyTemplate = $('copyTemplate');
const downloadTemplate = $('downloadTemplate');
const closeTemplate = $('closeTemplate');
const playerWrap = $('playerWrap');

let currentVideo = null;   // full record from vault.open / vault.pick
let chapters = [];
let vaultCache = [];       // for search filter without re-hitting DB

/* --- time helpers --- */
function parseTime(s) {
  if (typeof s === 'number') return isFinite(s) ? s : NaN;
  s = String(s ?? '').trim();
  if (!s) return NaN;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const parts = s.split(':').map(p => p.trim());
  if (parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return NaN;
  const nums = parts.map(Number);
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return NaN;
}
function fmt(t) {
  if (!isFinite(t)) return '0:00';
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function relTime(ts) {
  if (!ts) return 'never';
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

/* --- view switch --- */
function showVault() {
  currentVideo = null;
  chapters = [];
  if (video.src) { try { URL.revokeObjectURL(video.src); } catch {} }
  video.removeAttribute('src'); video.load();
  document.body.classList.remove('has-video');
  vaultView.classList.remove('hidden');
  playerView.classList.add('hidden');
  videoName.textContent = 'No video loaded';
  renderVault();
}
function showPlayer(record) {
  currentVideo = record;
  chapters = record.chapters.map(c => ({ ...c }));
  video.src = record.fileUrl;
  video.load();
  document.body.classList.add('has-video');
  vaultView.classList.add('hidden');
  playerView.classList.remove('hidden');
  videoName.textContent = record.name;
  render();
}

/* --- vault grid --- */
async function refreshVault() {
  vaultCache = await vault.list();
  renderVault();
}
// ponytail: deterministic hue per title so a video's brick color is stable across renders.
function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function renderVault() {
  const q = (vaultSearch.value || '').toLowerCase().trim();
  const filtered = q ? vaultCache.filter(v => v.name.toLowerCase().includes(q)) : vaultCache;
  vaultGrid.innerHTML = '';

  // "Open a video" tile — always first
  const add = document.createElement('div');
  add.className = 'vault-card add';
  add.innerHTML = `<div class="thumb"></div><div class="info"><div class="name">Open video…</div><div class="meta"><span>Pick a local file</span></div></div>`;
  add.addEventListener('click', pickNewVideo);
  vaultGrid.appendChild(add);

  filtered.forEach(v => {
    const card = document.createElement('div');
    card.className = 'vault-card';
    card.innerHTML = `
      <div class="thumb"><span class="thumb-title"></span><span class="badge-dur"></span></div>
      <div class="info">
        <div class="name"></div>
        <div class="meta"><span class="count"></span><span class="time"></span></div>
      </div>
      <button class="del" title="Delete from library">✕</button>
    `;
    const hue = hashHue(v.name);
    card.querySelector('.thumb').style.background = `hsl(${hue} 55% 42%)`;
    card.querySelector('.thumb-title').textContent = v.name;
    card.querySelector('.name').textContent = v.name;
    card.querySelector('.badge-dur').textContent = fmt(v.duration);
    card.querySelector('.count').textContent = `${v.chapterCount} chapter${v.chapterCount === 1 ? '' : 's'}`;
    card.querySelector('.time').textContent = relTime(v.updatedAt);
    card.title = v.path;
    card.addEventListener('click', ev => {
      if (ev.target.closest('.del')) return;
      openVaultEntry(v.id);
    });
    card.querySelector('.del').addEventListener('click', async ev => {
      ev.stopPropagation();
      if (!confirm(`Remove "${v.name}" from the library? Chapters will be lost.`)) return;
      await vault.remove(v.id);
      await refreshVault();
    });
    vaultGrid.appendChild(card);
  });

  vaultEmpty.classList.toggle('on', filtered.length === 0 && !q);
}
vaultSearch.addEventListener('input', renderVault);

async function openVaultEntry(id) {
  const record = await vault.open(id);
  if (!record) return;
  // Existence check happens indirectly — video element will error if file is gone.
  showPlayer(record);
}

async function pickNewVideo() {
  const record = await vault.pick();
  if (record) { showPlayer(record); refreshVault(); }
}

/* --- add chapter (video-loaded view) --- */
grabStart.addEventListener('click', e => { e.preventDefault(); startInput.value = fmt(video.currentTime); });
grabEnd.addEventListener('click', e => { e.preventDefault(); endInput.value = fmt(video.currentTime); });

/* Live time mask: strip non-digits, regroup right-to-left as h:mm:ss / m:ss. */
function maskTime(raw) {
  const d = String(raw).replace(/\D/g, '').slice(-6);
  if (!d) return '';
  if (d.length <= 2) return d;
  const ss = d.slice(-2), mm = d.slice(-4, -2), hh = d.slice(0, -4);
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}
[startInput, endInput].forEach(el => {
  el.setAttribute('inputmode', 'numeric');
  el.addEventListener('input', () => { el.value = maskTime(el.value); });
});

function showError(msg, ok = false) {
  formError.textContent = msg;
  formError.style.color = ok ? 'var(--ok)' : '';
  if (msg) setTimeout(() => { if (formError.textContent === msg) { formError.textContent = ''; formError.style.color = ''; } }, 3500);
}

async function persistChapters() {
  if (!currentVideo) return;
  chapters = await vault.saveChapters(currentVideo.id, chapters);
  chapters.sort((a, b) => a.start - b.start);
}

addBtn.addEventListener('click', async () => {
  if (!currentVideo) return showError('Load a video first.');
  const title = titleInput.value.trim();
  const start = parseTime(startInput.value);
  const end = parseTime(endInput.value);
  const dur = isFinite(video.duration) ? video.duration : Infinity;
  if (!title) return showError('Title required.');
  if (!isFinite(start) || !isFinite(end)) return showError('Bad time format. Use 1:23 or 0:01:23.');
  if (end <= start) return showError('End must be after start.');
  if (start < 0 || end > dur + 0.5) return showError(`Out of range (video is ${fmt(dur)}).`);
  chapters.push({ title, start, end });
  chapters.sort((a, b) => a.start - b.start);
  await persistChapters();
  titleInput.value = ''; startInput.value = ''; endInput.value = '';
  showError('');
  render();
  titleInput.focus();
});

[titleInput, startInput, endInput].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); })
);

/* --- render (player view) --- */
function render() {
  chapterList.innerHTML = '';
  chapters.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'chapter';
    li.dataset.idx = i;
    li.innerHTML = `
      <div class="num">${i + 1}</div>
      <div class="body">
        <div class="title"></div>
        <div class="range"></div>
      </div>
      <button class="del" title="Delete">✕</button>
    `;
    li.querySelector('.title').textContent = c.title;
    li.querySelector('.range').textContent = `${fmt(c.start)} – ${fmt(c.end)}`;
    li.addEventListener('click', ev => {
      if (ev.target.classList.contains('del')) return;
      video.currentTime = c.start;
      video.play().catch(() => {});
    });
    li.querySelector('.del').addEventListener('click', async ev => {
      ev.stopPropagation();
      if (!confirm(`Delete chapter "${c.title}"?`)) return;
      chapters.splice(i, 1);
      await persistChapters();
      render();
    });
    chapterList.appendChild(li);
  });

  track.innerHTML = '';
  const dur = video.duration;
  if (isFinite(dur) && dur > 0) {
    chapters.forEach(c => {
      const seg = document.createElement('div');
      seg.className = 'seg';
      seg.style.left = (c.start / dur * 100) + '%';
      seg.style.width = Math.max(0.5, (c.end - c.start) / dur * 100) + '%';
      seg.title = `${c.title} (${fmt(c.start)}–${fmt(c.end)})`;
      const lbl = document.createElement('span');
      lbl.className = 'lbl'; lbl.textContent = c.title;
      seg.appendChild(lbl);
      seg.addEventListener('click', () => { video.currentTime = c.start; video.play().catch(() => {}); });
      track.appendChild(seg);
    });
  }
  updateActive();
}

function updateActive() {
  const t = video.currentTime;
  const dur = video.duration;
  nowTime.textContent = `${fmt(t)} / ${fmt(dur)}`;
  playhead.style.left = (isFinite(dur) && dur > 0 ? (t / dur * 100) : 0) + '%';
  let activeIdx = -1;
  for (let i = 0; i < chapters.length; i++) if (t >= chapters[i].start && t < chapters[i].end) { activeIdx = i; break; }
  nowTitle.textContent = activeIdx >= 0 ? chapters[activeIdx].title : (chapters.length ? '—' : 'No chapters');
  chapterList.querySelectorAll('.chapter').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.idx) === activeIdx);
  });
}

video.addEventListener('timeupdate', updateActive);
video.addEventListener('loadedmetadata', async () => {
  if (currentVideo && isFinite(video.duration)) {
    await vault.setDuration(currentVideo.id, video.duration);
    currentVideo.duration = video.duration;
  }
  render();
});
video.addEventListener('error', () => {
  if (currentVideo) {
    showError(`Couldn't load "${currentVideo.name}". The file may have moved.`);
  }
});

/* --- timeline hover / click-to-seek --- */
function timelineFrac(e) {
  const r = timeline.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
}
timeline.addEventListener('mousemove', e => {
  const dur = video.duration;
  if (!isFinite(dur) || dur <= 0) return;
  const frac = timelineFrac(e);
  const t = frac * dur;
  const pct = frac * 100 + '%';
  hoverLine.style.left = pct;
  tooltip.style.left = pct;
  const hit = chapters.find(c => t >= c.start && t < c.end);
  tooltip.innerHTML = hit ? `<span class="t-title"></span><span class="t-time"></span>` : `<span class="t-time"></span>`;
  if (hit) tooltip.querySelector('.t-title').textContent = hit.title;
  tooltip.querySelector('.t-time').textContent = fmt(t);
  tooltip.classList.add('on');
});
timeline.addEventListener('mouseleave', () => tooltip.classList.remove('on'));
timeline.addEventListener('click', e => {
  const dur = video.duration;
  if (!isFinite(dur) || dur <= 0) return;
  if (e.target.closest('.seg')) return;
  video.currentTime = timelineFrac(e) * dur;
});

/* --- drag & drop (anywhere) --- */
['dragenter', 'dragover'].forEach(ev =>
  document.addEventListener(ev, e => {
    if (![...e.dataTransfer?.types || []].includes('Files')) return;
    e.preventDefault();
    (playerWrap || document.body).classList.add('drag-over');
  })
);
['dragleave', 'drop'].forEach(ev =>
  document.addEventListener(ev, e => {
    e.preventDefault();
    (playerWrap || document.body).classList.remove('drag-over');
  })
);
document.addEventListener('drop', async e => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f || !f.type.startsWith('video/')) return;
  const p = vault.pathFor(f);
  if (!p) return showError('Could not resolve file path.');
  const record = await vault.addFromPath(p);
  if (record) { showPlayer(record); refreshVault(); }
});

/* --- JSON import --- */
importBtn.addEventListener('click', async () => {
  if (!currentVideo) return showError('Load a video first.');
  const text = await vault.pickJson();
  if (!text) return;
  try {
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : Array.isArray(data.chapters) ? data.chapters : null;
    if (!items) throw new Error('Expected an array, or { "chapters": [...] }.');
    const dur = isFinite(video.duration) ? video.duration : Infinity;
    const added = [], errors = [];
    items.forEach((it, i) => {
      const title = String(it.title ?? it.name ?? '').trim();
      const start = parseTime(it.start ?? it.startTime ?? it.from);
      const end = parseTime(it.end ?? it.endTime ?? it.to);
      if (!title) return errors.push(`#${i + 1}: missing title`);
      if (!isFinite(start) || !isFinite(end)) return errors.push(`#${i + 1} "${title}": bad time`);
      if (end <= start) return errors.push(`#${i + 1} "${title}": end ≤ start`);
      if (start < 0 || end > dur + 0.5) return errors.push(`#${i + 1} "${title}": out of range`);
      added.push({ title, start, end });
    });
    if (!added.length) throw new Error(errors[0] || 'No valid chapters found.');
    chapters.push(...added);
    chapters.sort((a, b) => a.start - b.start);
    await persistChapters();
    render();
    showError(errors.length
      ? `Imported ${added.length}, skipped ${errors.length} (${errors[0]})`
      : `Imported ${added.length} chapter${added.length === 1 ? '' : 's'}.`, !errors.length);
  } catch (err) {
    showError('Import failed: ' + err.message);
  }
});

/* --- template dialog --- */
const TEMPLATE = [
  { title: "Intro",      start: "0:00",  end: "1:30" },
  { title: "Main topic", start: "1:30",  end: "10:00" },
  { title: "Outro",      start: 600,     end: 720 }
];
templateJson.textContent = JSON.stringify(TEMPLATE, null, 2);
templateBtn.addEventListener('click', () => templateDialog.showModal());
closeTemplate.addEventListener('click', () => templateDialog.close());
templateDialog.addEventListener('click', e => { if (e.target === templateDialog) templateDialog.close(); });
copyTemplate.addEventListener('click', async () => {
  await navigator.clipboard.writeText(templateJson.textContent);
  copyTemplate.textContent = 'Copied';
  setTimeout(() => { copyTemplate.textContent = 'Copy'; }, 1200);
});
downloadTemplate.addEventListener('click', () => {
  const blob = new Blob([templateJson.textContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'chapters-template.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

/* --- home navigation --- */
openBtn.addEventListener('click', pickNewVideo);
libraryBtn.addEventListener('click', showVault);
brand.addEventListener('click', () => { if (currentVideo) showVault(); });

/* --- keyboard --- */
document.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'Escape' && currentVideo) { showVault(); return; }
  if (!currentVideo) return;
  if (e.code === 'Space') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  else if (e.key === 'ArrowLeft') video.currentTime -= 5;
  else if (e.key === 'ArrowRight') video.currentTime += 5;
  else if (e.key === 'j') video.currentTime -= 10;
  else if (e.key === 'l') video.currentTime += 10;
});

/* --- boot --- */
showVault();
refreshVault();
