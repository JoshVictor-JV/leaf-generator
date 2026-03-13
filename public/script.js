// ── STORAGE KEY ──────────────────────────────────────────────────
const HISTORY_KEY = 'leaf_history';
let lastResult = '';
let currentHistoryId = null;

// ── HISTORY HELPERS ───────────────────────────────────────────────
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

function addToHistory(idea, tone, scriptStyle, numVideos, result) {
  const items = loadHistory();
  const id = Date.now().toString();
  items.unshift({
    id,
    idea,
    tone,
    scriptStyle,
    numVideos,
    result,
    timestamp: new Date().toISOString(),
  });
  // Keep last 50
  if (items.length > 50) items.splice(50);
  saveHistory(items);
  currentHistoryId = id;
  renderHistoryList();
  updateHistoryCount();
}

function deleteHistoryItem(id) {
  const items = loadHistory().filter(i => i.id !== id);
  saveHistory(items);
  renderHistoryList();
  updateHistoryCount();
}

function clearHistory() {
  if (!confirm('Delete all history? This cannot be undone.')) return;
  localStorage.removeItem(HISTORY_KEY);
  currentHistoryId = null;
  renderHistoryList();
  updateHistoryCount();
}

function updateHistoryCount() {
  const count = loadHistory().length;
  document.getElementById('historyCount').textContent = count;
}

// ── RENDER HISTORY LIST ───────────────────────────────────────────
function renderHistoryList() {
  const list = document.getElementById('historyList');
  const items = loadHistory();

  if (items.length === 0) {
    list.innerHTML = '<div class="history-empty">No history yet. Generate some content first.</div>';
    return;
  }

  list.innerHTML = items.map(item => {
    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleDateString('en-US', { month:'short', day:'numeric' }) +
                    ' · ' + date.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    const isActive = item.id === currentHistoryId;
    const shortIdea = item.idea.length > 60 ? item.idea.slice(0, 60) + '…' : item.idea;

    return `
      <div class="history-item ${isActive ? 'active' : ''}" id="hitem-${item.id}">
        <div class="history-item-idea" title="${escapeAttr(item.idea)}">${escapeHtml(shortIdea)}</div>
        <div class="history-item-meta">
          <span class="history-tag">${escapeHtml(item.tone)}</span>
          <span class="history-tag">${escapeHtml(item.scriptStyle)}</span>
          <span class="history-tag">${item.numVideos} video${item.numVideos > 1 ? 's' : ''}</span>
          <span class="history-time">${timeStr}</span>
        </div>
        <div class="history-item-actions">
          <button class="history-action-btn" onclick="loadHistoryItem('${item.id}')">Load</button>
          <button class="history-action-btn" onclick="copyHistoryItem('${item.id}', this)">Copy All</button>
          <button class="history-action-btn danger" onclick="deleteHistoryItem('${item.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function loadHistoryItem(id) {
  const item = loadHistory().find(i => i.id === id);
  if (!item) return;

  // Restore inputs
  document.getElementById('idea').value       = item.idea;
  document.getElementById('tone').value       = item.tone;
  document.getElementById('scriptStyle').value = item.scriptStyle;
  document.getElementById('numVideos').value  = item.numVideos;

  // Restore output
  lastResult = item.result;
  currentHistoryId = id;
  renderResults(item.result);
  renderHistoryList();

  // Close drawer
  toggleHistory(false);
  setStatus('ready', 'Loaded from history — ' + new Date(item.timestamp).toLocaleString());
}

function copyHistoryItem(id, btn) {
  const item = loadHistory().find(i => i.id === id);
  if (!item) return;
  copyTextToClipboard(item.result, btn, 'Copy All');
}

// ── HISTORY DRAWER ────────────────────────────────────────────────
function toggleHistory(forceOpen) {
  const drawer   = document.getElementById('historyDrawer');
  const backdrop = document.getElementById('historyBackdrop');
  const isOpen   = drawer.classList.contains('open');
  const open     = forceOpen !== undefined ? forceOpen : !isOpen;

  drawer.classList.toggle('open', open);
  backdrop.classList.toggle('open', open);

  if (open) renderHistoryList();
}

// ── STATUS ────────────────────────────────────────────────────────
function setStatus(state, text) {
  document.getElementById('statusDot').className = 'status-dot ' + state;
  document.getElementById('statusText').textContent = text;
}

// ── GENERATE ─────────────────────────────────────────────────────
async function generate() {
  const idea        = document.getElementById('idea').value.trim();
  const tone        = document.getElementById('tone').value;
  const scriptStyle = document.getElementById('scriptStyle').value;
  const numVideos   = document.getElementById('numVideos').value;

  if (!idea) { showError('Please enter a content idea before generating.'); return; }

  document.getElementById('emptyState').style.display  = 'none';
  document.getElementById('results').style.display     = 'none';
  document.getElementById('errorBox').classList.remove('active');
  document.getElementById('loadingOverlay').classList.add('active');

  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.classList.add('loading');
  btn.innerHTML = '⏳ Generating...';
  setStatus('busy', 'Sending to Groq AI…');

  try {
    const res  = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea, tone, scriptStyle, numVideos }),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Server error');

    lastResult = data.result;
    addToHistory(idea, tone, scriptStyle, numVideos, data.result);
    renderResults(data.result);
    setStatus('ready', 'Done — ' + new Date().toLocaleTimeString());

  } catch (err) {
    showError(err.message);
    setStatus('error', 'Error: ' + err.message.slice(0, 70));
  } finally {
    document.getElementById('loadingOverlay').classList.remove('active');
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.innerHTML = '<span class="btn-icon">🌿</span> Generate Content';
  }
}

// ── COPY ALL ─────────────────────────────────────────────────────
function copyAll() {
  const btn = document.getElementById('copyAllBtn');
  // Build clean formatted text from all visible sections
  const sections = document.querySelectorAll('#sectionsContainer .section');
  let fullText = '🌿 LEAF GENERATOR — FULL OUTPUT\n';
  fullText += '═'.repeat(50) + '\n\n';

  sections.forEach(sec => {
    const title  = sec.querySelector('.section-title')?.innerText || '';
    const label  = sec.querySelector('.section-label')?.innerText || '';
    const content = sec.querySelector('.content-block')?.innerText || '';
    fullText += `${'═'.repeat(50)}\n${label.toUpperCase()} — ${title.toUpperCase()}\n${'═'.repeat(50)}\n\n`;
    fullText += content.trim() + '\n\n';
  });

  copyTextToClipboard(fullText, btn, '📋 Copy All');
}

// ── COPY HELPER ───────────────────────────────────────────────────
function copyTextToClipboard(text, btn, originalLabel) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      btn.textContent = '✓ Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = originalLabel || 'Copy';
        btn.classList.remove('copied');
      }, 2000);
    }
  });
}

// ── RENDER RESULTS ────────────────────────────────────────────────
function renderResults(raw) {
  const container = document.getElementById('sectionsContainer');
  const tabs      = document.getElementById('sectionTabs');
  container.innerHTML = '';
  tabs.innerHTML      = '';

  const SECTIONS = [
    { id:'hooks',    label:'Hooks',      title:'Hook Generator',    icon:'🎯', num:1 },
    { id:'lab',      label:'Hook Lab',   title:'Hook Testing Lab',  icon:'🧪', num:2 },
    { id:'scripts',  label:'Scripts',    title:'Video Scripts',     icon:'🎬', num:3 },
    { id:'skit',     label:'Skit',       title:'Skit Mode',         icon:'🎭', num:4 },
    { id:'captions', label:'Captions',   title:'Captions',          icon:'✍️',  num:5 },
    { id:'visual',   label:'Visual',     title:'Visual Hook Ideas', icon:'👁',  num:6 },
    { id:'batch',    label:'Batch Plan', title:'Batch Summary',     icon:'📅', num:7 },
  ];

  const extracted = extractSections(raw, SECTIONS);
  let firstTab = true;

  SECTIONS.forEach((sec, i) => {
    const content = extracted[sec.id];
    if (!content || content.trim().length < 10) return;

    const tab = document.createElement('button');
    tab.className = 'tab-btn' + (firstTab ? ' active' : '');
    tab.textContent = sec.icon + ' ' + sec.label;
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById('sec-' + sec.id)?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
    tabs.appendChild(tab);

    const div = document.createElement('div');
    div.className = 'section';
    div.id = 'sec-' + sec.id;
    div.style.animationDelay = (i * 0.07) + 's';
    div.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-label">${sec.icon} ${sec.label}</div>
          <div class="section-title">${sec.title}</div>
        </div>
        <button class="copy-btn" data-id="${sec.id}">Copy</button>
      </div>
      <div class="content-block" id="content-${sec.id}">${highlight(content)}</div>
    `;
    container.appendChild(div);
    firstTab = false;
  });

  // Fallback
  if (container.children.length === 0) {
    const div = document.createElement('div');
    div.className = 'section';
    div.innerHTML = `
      <div class="section-header">
        <div><div class="section-label">🌿 Output</div><div class="section-title">Generated Content</div></div>
        <button class="copy-btn" data-id="all">Copy</button>
      </div>
      <div class="content-block" id="content-all">${highlight(raw)}</div>
    `;
    container.appendChild(div);
    const tab = document.createElement('button');
    tab.className = 'tab-btn active';
    tab.textContent = '🌿 Output';
    tabs.appendChild(tab);
  }

  // Section copy buttons
  container.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.id;
      const el  = document.getElementById('content-' + id);
      const txt = el ? el.innerText : lastResult;
      copyTextToClipboard(txt, btn, 'Copy');
    });
  });

  document.getElementById('results').style.display = 'block';
}

// ── EXTRACT SECTIONS ─────────────────────────────────────────────
function extractSections(text, sections) {
  const result = {};
  for (let i = 0; i < sections.length; i++) {
    const cur  = sections[i];
    const next = sections[i + 1];
    const startRe = new RegExp(`##?\\s*SECTION\\s*${cur.num}`, 'i');
    const start = text.search(startRe);
    if (start === -1) { result[cur.id] = ''; continue; }
    let end = text.length;
    if (next) {
      const endRe = new RegExp(`##?\\s*SECTION\\s*${next.num}`, 'i');
      const m = text.search(endRe);
      if (m > start) end = m;
    }
    let chunk = text.slice(start, end).trim();
    chunk = chunk.replace(/^##?\s*SECTION\s*\d+.*$/im, '').trim();
    result[cur.id] = chunk;
  }
  return result;
}

// ── HIGHLIGHT ─────────────────────────────────────────────────────
function highlight(text) {
  if (!text) return '';
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^(#{1,3}\s+.+)$/gm, '<span style="color:var(--leaf);font-weight:700">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<span style="color:var(--leaf);font-weight:600">$1</span>')
    .replace(/(\d+\/10)/g, '<span style="color:var(--amber);font-weight:700">$1</span>')
    .replace(/\[(CONTRARIAN|CURIOSITY|WARNING\/FEAR|WARNING|FEAR|RELATABLE|AUTHORITY)\s*(HOOK)?\]/gi,
      '<span style="color:var(--leaf);background:rgba(184,245,90,0.08);padding:1px 5px;border-radius:2px;font-weight:700">[$1 $2]</span>')
    .replace(/^(PRESENT SELF|FUTURE SELF):/gm,
      '<span style="color:var(--amber);font-weight:700">$1:</span>')
    .replace(/(🎬|🧲|💡|🥊|📣)/g, '<span>$1</span>')
    .replace(/(HOOK STRENGTH|REASON):/gi,
      '<span style="color:var(--muted);font-size:0.88em">$1:</span>');
}

// ── UTILS ─────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(s) {
  return String(s).replace(/"/g,'&quot;');
}

// ── ERROR ─────────────────────────────────────────────────────────
function showError(msg) {
  const box = document.getElementById('errorBox');
  box.textContent = `⚠️  ${msg}\n\nIf you see "GROQ_API_KEY not set" — add your Groq API key in Railway environment variables and redeploy.`;
  box.classList.add('active');
  document.getElementById('emptyState').style.display = 'none';
}

// ── KEYBOARD SHORTCUT ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generate();
  if (e.key === 'Escape') toggleHistory(false);
});

// ── INIT ──────────────────────────────────────────────────────────
updateHistoryCount();
setStatus('ready', 'Ready — Enter a content idea and press Generate');
