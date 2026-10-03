const fs = require('fs');

// Kullanım verisini lokal JSON dosyasında saklar. Hiçbir şey dışarı gönderilmez.
class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { days: {}, meta: {} };
    this.dirty = false;
    this.load();
    // Periyodik olarak diske yaz (veri kaybını önlemek için)
    this.saveTimer = setInterval(() => this.flush(), 15000);
    if (this.saveTimer.unref) this.saveTimer.unref();
  }

  static dateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  todayStr() {
    return Store.dateStr(new Date());
  }

  load() {
    this.data = { days: {}, meta: {} };
    let raw;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch {
      return; // dosya henüz yok (ilk çalıştırma)
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('geçersiz veri');
      this.data = parsed;
      if (!this.data.days) this.data.days = {};
      if (!this.data.meta) this.data.meta = {};
    } catch {
      // Bozuk dosyanın üzerine yazma; kurtarılabilsin diye kenara al
      try { fs.renameSync(this.filePath, `${this.filePath}.bozuk-${Date.now()}`); } catch {}
    }
  }

  // Bir uygulamaya bugüne 'seconds' saniye ekler
  addTime(app, seconds) {
    if (!app || seconds <= 0) return;
    const day = this.todayStr();
    if (!this.data.days[day]) this.data.days[day] = {};
    this.data.days[day][app] = (this.data.days[day][app] || 0) + seconds;
    this.dirty = true;
  }

  // Belirli bir günün özetini döndürür
  getDay(dateStr) {
    const apps = this.data.days[dateStr] || {};
    const list = Object.entries(apps)
      .map(([name, seconds]) => ({ name, seconds }))
      .filter((a) => a.seconds >= 1)
      .sort((a, b) => b.seconds - a.seconds);
    const total = list.reduce((s, a) => s + a.seconds, 0);
    return {
      date: dateStr,
      total,
      apps: list.map((a) => ({
        name: a.name,
        seconds: a.seconds,
        percent: total > 0 ? (a.seconds / total) * 100 : 0,
      })),
    };
  }

  // Son N günün toplamları (haftalık mini grafik için)
  getDailyTotals(days) {
    const res = [];
    const base = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const ds = Store.dateStr(d);
      const dayApps = this.data.days[ds] || {};
      const total = Object.values(dayApps).reduce((s, v) => s + v, 0);
      res.push({ date: ds, total });
    }
    return res;
  }

  availableDates() {
    return Object.keys(this.data.days).sort();
  }

  // CSV raporu için satırlar: her (gün, uygulama) çifti bir kayıt
  exportRows() {
    const rows = [];
    for (const date of this.availableDates()) {
      const apps = this.data.days[date] || {};
      const list = Object.entries(apps)
        .map(([name, seconds]) => ({ name, seconds: Math.round(seconds) }))
        .filter((a) => a.seconds >= 1)
        .sort((a, b) => b.seconds - a.seconds);
      for (const a of list) rows.push({ date, name: a.name, seconds: a.seconds });
    }
    return rows;
  }

  flush() {
    if (!this.dirty) return;
    try {
      // Önce geçici dosyaya yaz, sonra yeniden adlandır: yazma yarıda kesilse de asıl dosya bozulmaz
      const tmpPath = this.filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(this.data));
      fs.renameSync(tmpPath, this.filePath);
      this.dirty = false;
    } catch (e) {
      // sessizce geç; sonraki denemede tekrar yazmayı dener
    }
  }
}

module.exports = Store;
