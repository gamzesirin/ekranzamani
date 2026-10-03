const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./store');
const Tracker = require('./tracker');

let mainWindow = null;
let tray = null;
let store = null;
let tracker = null;
let isQuiting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 360,
    minHeight: 480,
    // Tamamen boş başlıkta Windows görev çubuğunda exe adını ("Electron") gösteriyor; boşluk bunu engeller
    title: ' ',
    backgroundColor: '#121010',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.setMenuBarVisibility(false);
  // Başlık çubuğunda yazı görünmesin (sayfanın <title>'ı pencere başlığını değiştirmesin)
  mainWindow.on('page-title-updated', (e) => e.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Kapatınca çıkma, tepsiye gizle
  mainWindow.on('close', (e) => {
    if (!isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Windows kapanırken/oturum kapatılırken before-quit tetiklenmez; veriyi burada yaz
  mainWindow.on('session-end', () => {
    if (store) store.flush();
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Ekran Zamanını Aç', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    {
      label: 'Takibi Duraklat',
      type: 'checkbox',
      checked: tracker ? !tracker.tracking : false,
      click: (item) => tracker && tracker.setTracking(!item.checked),
    },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { isQuiting = true; app.quit(); } },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico'));
  tray = new Tray(icon);
  tray.setToolTip('Ekran Zamanı — kullanım takibi');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => mainWindow && mainWindow.show());
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}sa ${String(m).padStart(2, '0')}dk`;
  if (m > 0) return `${m}dk ${String(s).padStart(2, '0')}sn`;
  return `${s}sn`;
}

// Alanı gerekiyorsa (ayraç, tırnak veya satır sonu içeriyorsa) tırnakla
function csvCell(v) {
  let s = String(v);
  // Excel'in hücreyi formül olarak çalıştırmasını engelle
  if (/^[=+@\t\r-]/.test(s)) s = "'" + s;
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCsv(rows) {
  const lines = [['Tarih', 'Uygulama', 'Saniye', 'Süre'].join(';')];
  for (const r of rows) {
    lines.push([r.date, csvCell(r.name), r.seconds, fmtDuration(r.seconds)].join(';'));
  }
  return lines.join('\r\n');
}

function registerIpc() {
  ipcMain.handle('get-day', (_e, dateStr) => store.getDay(dateStr));
  ipcMain.handle('get-week', () => store.getDailyTotals(7));
  ipcMain.handle('get-summary', () => ({
    today: Store.dateStr(new Date()),
    dates: store.availableDates(),
    tracking: tracker.tracking,
    currentApp: tracker.currentApp,
    currentIdle: tracker.currentIdle,
    currentSelf: tracker.currentSelf,
  }));
  ipcMain.handle('set-tracking', (_e, val) => {
    tracker.setTracking(val);
    if (tray) tray.setContextMenu(buildTrayMenu());
    return tracker.tracking;
  });
  ipcMain.handle('export-csv', async () => {
    const rows = store.exportRows();
    if (!rows.length) return { ok: false, reason: 'empty' };

    const defaultName = `ekran-zamani-rapor-${Store.dateStr(new Date())}.csv`;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Raporu dışa aktar',
      defaultPath: defaultName,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return { ok: false, reason: 'canceled' };

    try {
      // BOM + UTF-8: Excel'de Türkçe karakterler doğru görünsün
      fs.writeFileSync(filePath, '﻿' + buildCsv(rows), 'utf8');
      return { ok: true, filePath, count: rows.length };
    } catch (e) {
      return { ok: false, reason: 'write', message: String((e && e.message) || e) };
    }
  });
}

// İkinci örnek kapanırken izleyici/depo başlatmasın
if (gotLock) app.whenReady().then(() => {
  const dataPath = path.join(app.getPath('userData'), 'usage-data.json');
  store = new Store(dataPath);
  tracker = new Tracker(store, { interval: 4, idleThreshold: 60 });

  tracker.on((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tick', status);
    }
  });

  registerIpc();
  tracker.start();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Tepside çalışmaya devam et — pencereler kapansa da çıkma
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  isQuiting = true;
  if (tracker) tracker.stop();
  if (store) store.flush();
});
