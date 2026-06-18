const https = require('https');
const { app, dialog, shell, BrowserWindow } = require('electron');
const pkg = require('./package.json');

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
  const result = await checkForUpdates();

  if (result.status === 'no-repo') {
    if (options.manual) {
      await dialog.showMessageBox(parentWindow, {
        type: 'warning',
        title: 'Chưa cấu hình GitHub',
        message: 'Chưa thiết lập repository GitHub trong package.json.',
        buttons: ['OK'],
      });
    }
    return result;
  }

  if (result.status === 'error') {
    if (options.manual) {
      await dialog.showMessageBox(parentWindow, {
        type: 'warning',
        title: 'Không kiểm tra được cập nhật',
        message: result.message || 'Lỗi không xác định',
        buttons: ['OK'],
      });
    }
    return result;
  }

  if (result.status === 'current') {
    if (options.manual) {
      await dialog.showMessageBox(parentWindow, {
        type: 'info',
        title: 'Đã là bản mới nhất',
        message: `SRT Translator v${result.current} đã cập nhật.`,
        buttons: ['OK'],
      });
    }
    return result;
  }

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
  if (app.isPackaged) {
    detailParts.push('', 'App đã bật tự cập nhật — bản mới sẽ được tải ở nền.');
  }
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
  promptUpdateIfAvailable,
  getAppVersion: () => pkg.version,
};
