const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openSrtDialog: () => ipcRenderer.invoke('open-srt-dialog'),
  exportSrt: (data) => ipcRenderer.invoke('export-srt', data),
  openChatgptLogin: () => ipcRenderer.invoke('open-chatgpt-login'),
  onChatgptLoginClosed: (callback) => {
    ipcRenderer.on('chatgpt-login-closed', () => callback());
  },
  webviewExec: (guestId, code) => ipcRenderer.invoke('webview-exec', guestId, code),
  webviewClick: (guestId, x, y) => ipcRenderer.invoke('webview-click', guestId, x, y),
  webviewKey: (guestId, key) => ipcRenderer.invoke('webview-key', guestId, key),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, payload) => callback(payload));
  },
});
