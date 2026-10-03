const el = (id) => document.getElementById(id);

let selectedDate = null;
let todayStr = null;
let tracking = true;

// ---- yardımcılar ----
function pad(n) { return String(n).padStart(2, '0'); }
function dateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

function fmt(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}sa ${pad(m)}dk`;
  if (m > 0) return `${m}dk ${pad(s)}sn`;
  return `${s}sn`;
}
function fmtShort(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}s ${m}d`;
  if (m > 0) return `${m}d`;
  return `${sec}sn`;
}

const GUNLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function relLabel(ds) {
  if (ds === todayStr) return 'Bugün';
  const today = parseDate(todayStr);
  const d = parseDate(ds);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 1) return 'Dün';
  if (diff > 1 && diff < 7) return `${diff} gün önce`;
  return '';
}

// İsimden tutarlı bir renk üret
function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 62%, 60%)`;
}

// ---- render ----
async function renderDay() {
  const day = await window.api.getDay(selectedDate);
  el('totalTime').textContent = fmt(day.total);

  const d = parseDate(selectedDate);
  el('dateMain').textContent = `${GUNLER[d.getDay()]}, ${d.getDate()} ${AYLAR[d.getMonth()]}`;
  el('dateRel').textContent = relLabel(selectedDate);

  // sonraki gün butonu bugünden ileri gitmesin
  el('nextDay').disabled = selectedDate >= todayStr;
  el('nextDay').style.opacity = selectedDate >= todayStr ? 0.35 : 1;

  const list = el('appList');
  const empty = el('emptyState');
  list.innerHTML = '';

  if (!day.apps.length) {
    empty.hidden = false;
    el('appCount').textContent = '';
  } else {
    empty.hidden = true;
    el('appCount').textContent = `${day.apps.length} uygulama`;
    const maxSec = day.apps[0].seconds || 1;
    day.apps.forEach((a, i) => {
      const c = colorFor(a.name);
      const row = document.createElement('div');
      row.className = 'approw';
      row.innerHTML = `
        <div class="rank">${i + 1}</div>
        <div class="appmid">
          <div class="appname"><span class="swatch" style="background:${c}"></span>${escapeHtml(a.name)}</div>
          <div class="track"><div class="fill" style="width:${(a.seconds / maxSec) * 100}%;background:${c}"></div></div>
        </div>
        <div class="apptime"><div class="t">${fmt(a.seconds)}</div><div class="p">%${a.percent.toFixed(0)}</div></div>
      `;
      list.appendChild(row);
    });
  }
}

async function renderWeek() {
  const week = await window.api.getWeek();
  const max = Math.max(1, ...week.map((w) => w.total));
  const wrap = el('weekBars');
  wrap.innerHTML = '';
  week.forEach((w) => {
    const d = parseDate(w.date);
    const col = document.createElement('div');
    col.className = 'wcol' + (w.date === selectedDate ? ' active' : '');
    const hpct = w.total > 0 ? Math.max(6, (w.total / max) * 100) : 2;
    col.innerHTML = `
      <div class="wval">${w.total > 0 ? fmtShort(w.total) : ''}</div>
      <div class="wbar-wrap"><div class="wbar" style="height:${hpct}%"></div></div>
      <div class="wlabel">${GUNLER[d.getDay()]}</div>
    `;
    col.addEventListener('click', () => { selectedDate = w.date; refresh(); });
    wrap.appendChild(col);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function refresh() {
  await renderDay();
  await renderWeek();
}

function setLive(status) {
  tracking = status.tracking;
  const dot = el('liveDot');
  const txt = el('liveText');
  const btn = el('pauseBtn');
  if (!tracking) {
    dot.className = 'dot paused';
    txt.textContent = 'Takip duraklatıldı';
    btn.textContent = '▶ Takibi Sürdür';
    btn.classList.add('paused');
  } else {
    btn.textContent = '⏸ Takibi Duraklat';
    btn.classList.remove('paused');
    if (status.currentApp) {
      dot.className = 'dot on';
      // Öndeki pencere bu uygulamanın kendisiyse kendi süreç adını ("Electron") gösterme
      txt.textContent = status.currentSelf ? 'Takip ediliyor' : 'Şu an: ' + status.currentApp;
    } else {
      dot.className = 'dot';
      txt.textContent = 'Boşta (aktivite bekleniyor)';
    }
  }
}

// ---- olaylar ----
el('prevDay').addEventListener('click', () => {
  const d = parseDate(selectedDate); d.setDate(d.getDate() - 1);
  selectedDate = dateStr(d); refresh();
});
el('nextDay').addEventListener('click', () => {
  if (selectedDate >= todayStr) return;
  const d = parseDate(selectedDate); d.setDate(d.getDate() + 1);
  selectedDate = dateStr(d); refresh();
});
el('todayBtn').addEventListener('click', () => { selectedDate = todayStr; refresh(); });
el('pauseBtn').addEventListener('click', async () => {
  // Arayüz, ana süreçten gelen 'tick' ile güncellenir
  await window.api.setTracking(!tracking);
});
el('exportBtn').addEventListener('click', async () => {
  const btn = el('exportBtn');
  const original = btn.textContent;
  btn.disabled = true;
  try {
    const res = await window.api.exportCsv();
    if (res.ok) {
      btn.textContent = `✓ ${res.count} kayıt kaydedildi`;
    } else if (res.reason === 'empty') {
      btn.textContent = 'Aktarılacak veri yok';
    } else if (res.reason === 'canceled') {
      btn.textContent = original;
      btn.disabled = false;
      return;
    } else {
      btn.textContent = 'Kaydedilemedi';
    }
  } catch {
    btn.textContent = 'Kaydedilemedi';
  }
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500);
});

// ---- başlangıç ----
(async function init() {
  const s = await window.api.getSummary();
  todayStr = s.today;
  selectedDate = s.today;
  setLive(s);
  await refresh();

  window.api.onTick((status) => {
    setLive(status);
    // Bugünü izliyorsak canlı güncelle
    if (selectedDate === todayStr) refresh();
  });

  // Gece yarısı geçişini yakala
  setInterval(async () => {
    const nowStr = dateStr(new Date());
    if (nowStr !== todayStr) {
      // Kullanıcı geçmiş bir güne bakıyorsa görünümü zorla bugüne taşıma
      const wasToday = selectedDate === todayStr;
      todayStr = nowStr;
      if (wasToday) selectedDate = nowStr;
      refresh();
    }
  }, 30000);
})();
