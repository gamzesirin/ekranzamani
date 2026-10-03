const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getDay: (dateStr) => ipcRenderer.invoke('get-day', dateStr),
  getSummary: () => ipcRenderer.invoke('get-summary'),
  getWeek: () => ipcRenderer.invoke('get-week'),
  setTracking: (val) => ipcRenderer.invoke('set-tracking', val),
  exportCsv: () => ipcRenderer.invoke('export-csv'),
  onTick: (cb) => ipcRenderer.on('tick', (_e, data) => cb(data)),
});
