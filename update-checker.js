const https = require('https');
const { app, dialog, shell, BrowserWindow } = require('electron');
const pkg = require('./package.json');

let autoUpdater = null;

function getAutoUpdater() {
  if (!app.isPackaged) return null;
  if (!autoUpdater) {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  }
  return autoUpdater;
}

function parseGitHubRepo() {
  const candidates = [
    pkg.repository?.url,
    typeof pkg.repository === 'string' ? pkg.repository : null,
    pkg.homepage,
    process.env.SRT_TRANSLATOR_GITHUB_REPO,
  ].filter(Boolean);

  for (const raw of candidates) {
    const text = String(raw);
    const slashMatch = text.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (slashMatch) {
      return { owner: slashMatch[1], repo: slashMatch[2] };
    }
    const urlMatch = text.match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
    if (urlMatch) {
      return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, '') };
    }
  }
  return null;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'SRT-Translator',
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Timeout'));
    });
  });
}

function normalizeVersion(version) {
  return String(version || '').trim().replace(/^v/i, '');
}

function compareVersions(a, b) {
  const pa = normalizeVersion(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = normalizeVersion(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function notifyRenderer(parentWindow, payload) {
  if (parentWindow && !parentWindow.isDestroyed()) {
    parentWindow.webContents.send('update-status', payload);
  }
}

function setupAutoUpdaterListeners(parentWindow) {
  const updater = getAutoUpdater();
  if (!updater || updater.__listenersReady) return updater;

  updater.on('update-available', (info) => {
    notifyRenderer(parentWindow, {
      status: 'available',
      current: pkg.version,
      latest: normalizeVersion(info.version),
      name: info.releaseName,
    });
  });

  updater.on('update-downloaded', (info) => {
    const win = parentWindow && !parentWindow.isDestroyed()
      ? parentWindow
      : BrowserWindow.getFocusedWindow();

    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Đã tải bản cập nhật',
      message: `SRT Translator v${normalizeVersion(info.version)} sẵn sàng cài đặt`,
      detail: 'Khởi động lại app để áp dụng bản mới.',
      buttons: ['Khởi động lại', 'Để sau'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        updater.quitAndInstall(false, true);
      }
    }).catch(() => {});
  });

  updater.on('error', () => {
    /* lỗi mạng — im lặng khi check nền */
  });

  updater.__listenersReady = true;
  return updater;
}

async function checkWithAutoUpdater(parentWindow, options = {}) {
  const updater = setupAutoUpdaterListeners(parentWindow);
  if (!updater) {
    return checkForUpdates();
  }

  try {
    const result = await updater.checkForUpdates();
    const remote = result?.updateInfo;
    const latest = normalizeVersion(remote?.version);
    const current = normalizeVersion(pkg.version);

    if (latest && compareVersions(latest, current) > 0) {
      const payload = {
        status: 'available',
        current,
        latest,
        name: remote?.releaseName || `v${latest}`,
        body: String(remote?.releaseNotes || '').trim(),
      };

      if (options.manual) {
        await dialog.showMessageBox(parentWindow, {
          type: 'info',
          title: 'Đang tải bản cập nhật',
          message: `SRT Translator v${latest} đã có.`,
          detail: 'App đang tải bản mới ở nền. Khi xong sẽ hỏi khởi động lại.',
          buttons: ['OK'],
        });
      }

      notifyRenderer(parentWindow, payload);
      return payload;
    }

    if (options.manual) {
      await dialog.showMessageBox(parentWindow, {
        type: 'info',
        title: 'Đã là bản mới nhất',
        message: `SRT Translator v${current} đã cập nhật.`,
        buttons: ['OK'],
      });
    }

    return { status: 'current', current, latest: latest || current };
  } catch (err) {
    if (options.manual) {
      await dialog.showMessageBox(parentWindow, {
        type: 'warning',
        title: 'Không kiểm tra được cập nhật',
        message: String(err.message || err),
        buttons: ['OK'],
      });
    }
    return { status: 'error', message: String(err.message || err), current: pkg.version };
  }
}

async function checkForUpdates() {
  const repo = parseGitHubRepo();
  if (!repo) {
    return { status: 'no-repo', current: pkg.version };
  }

  const current = normalizeVersion(pkg.version);
  const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`;

  try {
    const release = await fetchJson(apiUrl);
    const latest = normalizeVersion(release.tag_name);
    if (!latest) {
      return { status: 'error', message: 'Release không có tag', current };
    }

    if (compareVersions(latest, current) > 0) {
      return {
        status: 'available',
        current,
        latest,
        url: release.html_url,
        name: release.name || release.tag_name,
        body: String(release.body || '').trim(),
      };
    }

    return { status: 'current', current, latest };
  } catch (err) {
    return { status: 'error', message: String(err.message || err), current };
  }
}

async function promptUpdateIfAvailable(parentWindow, options = {}) {
  if (app.isPackaged) {
    return checkWithAutoUpdater(parentWindow, options);
  }

  const result = await checkForUpdates();
  if (result.status !== 'available') {
    return result;
  }

  const win = parentWindow && !parentWindow.isDestroyed()
    ? parentWindow
    : BrowserWindow.getFocusedWindow();

  const detailParts = [
    `Phiên bản hiện tại: v${result.current}`,
    `Phiên bản mới: v${result.latest}`,
  ];
  if (result.body) {
    detailParts.push('', result.body.slice(0, 500) + (result.body.length > 500 ? '…' : ''));
  }

  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'Có bản cập nhật mới',
    message: `SRT Translator v${result.latest} đã có trên GitHub`,
    detail: detailParts.join('\n'),
    buttons: ['Mở trang tải về', 'Để sau'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (response === 0 && result.url) {
    shell.openExternal(result.url).catch(() => {});
  }

  if (options.notifyRenderer) {
    notifyRenderer(win, result);
  }

  return result;
}

module.exports = {
  checkForUpdates,
  checkWithAutoUpdater,
  promptUpdateIfAvailable,
  setupAutoUpdaterListeners,
  getAppVersion: () => pkg.version,
};
