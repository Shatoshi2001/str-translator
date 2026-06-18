const { app, BrowserWindow, dialog, ipcMain, webContents, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { promptUpdateIfAvailable, getAppVersion } = require('./update-checker');

const CHATGPT_PARTITION = 'persist:chatgpt-srt';
const CHATGPT_EMAIL_LOGIN_URL = 'https://auth.openai.com/log-in-or-create-account';
const GOOGLE_AUTH_RE = /accounts\.google\.com|google\.com\/signin/i;

let mainWindow = null;
let loginWindow = null;
let chatgptSession = null;

function buildExportFilename(sourcePath) {
  const base = sourcePath
    ? path.basename(sourcePath, path.extname(sourcePath))
    : 'translated';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `${base} - ${date} - ${time}.srt`;
}

function setupChatgptSession() {
  chatgptSession = session.fromPartition(CHATGPT_PARTITION);

  chatgptSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true);
  });

  chatgptSession.setPermissionCheckHandler(() => true);
}

function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }

  const win = new BrowserWindow({
    width: 480,
    height: 720,
    title: 'Đăng nhập ChatGPT',
    autoHideMenuBar: true,
    webPreferences: {
      partition: CHATGPT_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  loginWindow = win;

  const blockGoogle = (event, url) => {
    if (!url || !GOOGLE_AUTH_RE.test(url)) return;
    event.preventDefault();
    dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Không dùng Google',
      message: 'Google chặn đăng nhập trong app.',
      detail: 'Hãy đăng nhập bằng email + mật khẩu ChatGPT.',
      buttons: ['Đã hiểu'],
    }).catch(() => {});
    win.loadURL(CHATGPT_EMAIL_LOGIN_URL).catch(() => {});
  };

  win.webContents.on('will-navigate', blockGoogle);
  win.webContents.on('will-redirect', blockGoogle);

  win.webContents.on('did-navigate', (_event, url) => {
    if (url.startsWith('https://chatgpt.com') || url.startsWith('https://chat.openai.com')) {
      setTimeout(() => {
        if (!win.isDestroyed()) win.close();
      }, 600);
    }
  });

  win.loadURL(CHATGPT_EMAIL_LOGIN_URL);

  win.on('closed', () => {
    loginWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('chatgpt-login-closed');
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1100,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    title: 'SRT Translator',
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
}

function setupApplicationMenu() {
  Menu.setApplicationMenu(null);
}

function scheduleUpdateCheck() {
  if (app.isPackaged) {
    try {
      require('update-electron-app')({
        repo: 'Shatoshi2001/str-translator',
        updateInterval: '4 hours',
      });
    } catch (e) {
      /* update-electron-app không chặn khởi động app */
    }
  }

  setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    promptUpdateIfAvailable(mainWindow, { notifyRenderer: true }).catch(() => {});
  }, 4000);
}

app.whenReady().then(() => {
  setupApplicationMenu();
  setupChatgptSession();
  createWindow();
  scheduleUpdateCheck();
});

app.commandLine.appendSwitch('disable-renderer-backgrounding');

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  contents.setBackgroundThrottling(false);

  contents.setWindowOpenHandler(({ url }) => {
    contents.loadURL(url).catch(() => {});
    return { action: 'deny' };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('open-chatgpt-login', () => {
  openLoginWindow();
  return true;
});

ipcMain.handle('open-srt-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'SubRip (SRT)', extensions: ['srt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const content = await fs.promises.readFile(filePath, 'utf8');
  return { filePath, content };
});

ipcMain.handle('export-srt', async (_event, { content, sourcePath }) => {
  const defaultPath = buildExportFilename(sourcePath);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [{ name: 'SubRip (SRT)', extensions: ['srt'] }],
  });
  if (result.canceled || !result.filePath) return false;
  await fs.promises.writeFile(result.filePath, content, 'utf8');
  return true;
});

ipcMain.handle('webview-exec', async (_event, guestId, code) => {
  const wc = webContents.fromId(Number(guestId));
  if (!wc || wc.isDestroyed()) {
    return { __execError: 'Webview ChatGPT chưa sẵn sàng' };
  }
  try {
    return await wc.executeJavaScript(code, true);
  } catch (err) {
    return { __execError: String(err.message || err) };
  }
});

ipcMain.handle('webview-click', async (_event, guestId, x, y) => {
  const wc = webContents.fromId(Number(guestId));
  if (!wc || wc.isDestroyed()) return { ok: false };
  const px = Math.round(Number(x));
  const py = Math.round(Number(y));
  wc.sendInputEvent({ type: 'mouseMove', x: px, y: py });
  wc.sendInputEvent({ type: 'mouseDown', x: px, y: py, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: px, y: py, button: 'left', clickCount: 1 });
  return { ok: true };
});

ipcMain.handle('webview-key', async (_event, guestId, key) => {
  const wc = webContents.fromId(Number(guestId));
  if (!wc || wc.isDestroyed()) return { ok: false };
  if (key === 'Enter') {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  }
  return { ok: true };
});

ipcMain.handle('get-app-version', () => getAppVersion());

ipcMain.handle('check-for-updates', async () => {
  return promptUpdateIfAvailable(mainWindow, { manual: true, notifyRenderer: true });
});
