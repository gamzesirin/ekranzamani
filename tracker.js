const { spawn } = require('child_process');
const path = require('path');

// PowerShell izleyicisini başlatır, çıktısını dinler ve süreyi Store'a işler.
class Tracker {
  constructor(store, { interval = 4, idleThreshold = 60 } = {}) {
    this.store = store;
    this.interval = interval;
    this.idleThreshold = idleThreshold;
    this.tracking = true;
    this.currentApp = null;
    this.currentIdle = 0;
    this.currentSelf = false; // öndeki pencere bu uygulamanın kendisi mi
    this.lastSampleTime = null;
    this.lastApp = null; // bir önceki örneklemede öndeki uygulama
    this.maxDt = interval * 2.5 * 1000; // uyku/askıya alma sonrası dev sıçramaları sınırla
    this.proc = null;
    this.stopping = false;
    this.listeners = new Set();
  }

  on(cb) {
    this.listeners.add(cb);
  }

  emit() {
    const status = {
      tracking: this.tracking,
      currentApp: this.currentApp,
      currentIdle: this.currentIdle,
      currentSelf: this.currentSelf,
    };
    for (const cb of this.listeners) {
      try { cb(status); } catch {}
    }
  }

  setTracking(val) {
    this.tracking = !!val;
    this.emit();
  }

  start() {
    if (this.stopping) return;
    // Paketlenince (asar) script gerçek dosya sistemine açılır; PowerShell asar içini okuyamaz.
    const scriptPath = path
      .join(__dirname, 'scripts', 'tracker.ps1')
      .replace('app.asar', 'app.asar.unpacked');
    this.proc = spawn(
      'powershell.exe',
      [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
        '-Interval', String(this.interval),
        // Bu süreç ölürse script kendini kapatsın (yetim powershell kalmasın)
        '-ParentPid', String(process.pid),
      ],
      { windowsHide: true }
    );

    let buf = '';
    // Parçalar arasında bölünen çok baytlı karakterler bozulmasın
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) this.handleLine(line);
      }
    });

    this.proc.on('exit', () => {
      this.proc = null;
      // beklenmedik kapanmada yeniden başlat
      if (!this.stopping) setTimeout(() => this.start(), 2000);
    });

    this.proc.on('error', () => {
      // powershell bulunamazsa vb.
    });
  }

  handleLine(line) {
    let data;
    try { data = JSON.parse(line); } catch { return; }

    const now = Date.now();
    const app = (data.app || 'Unknown').toString().trim() || 'Unknown';
    const idle = Number(data.idle) || 0;

    // Bir önceki örneklemeden bu yana geçen süreyi, o aralıkta önde olan (önceki) uygulamaya yaz
    if (this.lastSampleTime !== null && this.tracking) {
      let dt = now - this.lastSampleTime;
      if (dt > this.maxDt) dt = this.maxDt;
      const active = idle < this.idleThreshold && this.lastApp !== null;
      if (dt > 0 && active) {
        this.store.addTime(this.lastApp, dt / 1000);
      }
    }

    this.lastSampleTime = now;
    this.currentIdle = idle;
    this.currentSelf = !!data.self;
    this.lastApp = app !== 'Unknown' ? app : null;
    this.currentApp = idle < this.idleThreshold && app !== 'Unknown' ? app : null;
    this.emit();
  }

  stop() {
    this.stopping = true;
    if (this.proc) {
      try { this.proc.kill(); } catch {}
      this.proc = null;
    }
  }
}

module.exports = Tracker;
