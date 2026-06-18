/**
 * Dịch transcript qua ChatGPT web (webview) — batch ~50 dòng/lần.
 */
window.ChatGptBatchTranslator = (function chatGptBatchTranslator() {
  const BATCH_SIZE = 50;
  const BATCH_TIMEOUT_MS = 120000;
  const MAX_BATCH_ATTEMPTS = 3;
  const TARGET_LABELS = {
    vi: 'Tiếng Việt',
    en: 'English',
    zh: '简体中文',
    ja: '日本語',
    ko: '한국어',
    th: 'ภาษาไทย',
    id: 'Bahasa Indonesia',
    fr: 'Français',
    es: 'Español',
  };

  const COMPOSER_PROBE = `(function() {
    try {
      const selectors = [
        '#prompt-textarea',
        'textarea#prompt-textarea',
        'div#prompt-textarea',
        'textarea[data-id="root"]',
        'div[contenteditable="true"]#prompt-textarea',
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][data-placeholder]',
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="message"]',
      ];
      for (const sel of selectors) {
        if (document.querySelector(sel)) return { found: true, selector: sel };
      }
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      for (const el of editables) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 80 && rect.height > 16) return { found: true, selector: 'contenteditable' };
      }
      return { found: false };
    } catch (e) {
      return { found: false, error: String(e.message || e) };
    }
  })()`;

  const RESPONSE_STATE_PROBE = `(function() {
    try {
      const generating = !!document.querySelector(
        '[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="Dừng"]',
      );
      const nodes = document.querySelectorAll('[data-message-author-role="assistant"]');
      const count = nodes.length;
      let latestText = '';
      const last = nodes[nodes.length - 1];
      if (last) {
        const md = last.querySelector('.markdown, [class*="markdown"]');
        const prose = last.querySelector('.prose, [class*="prose"]');
        const root = md || prose || last;
        latestText = root.innerText.trim();
      }
      return { generating, count, latestText };
    } catch (e) {
      return { generating: false, count: 0, latestText: '' };
    }
  })()`;

  let webviewPrimed = false;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function buildPrompt(lines, targetLang) {
    const target = TARGET_LABELS[targetLang] || targetLang;
    const body = lines.map((text, index) => `${index + 1}. ${text}`).join('\n');
    return `Dịch sát nghĩa đoạn thoại phim Trung sang ${target}.
Trả về đúng ${lines.length} dòng, giữ số thứ tự (1. 2. 3...), chỉ bản dịch, không giải thích.

${body}`;
  }

  function buildPromptPreview(targetLang) {
    const target = TARGET_LABELS[targetLang] || targetLang;
    return `Dịch sát thoại phim Trung sang ${target}.
• Đọc ngữ cảnh, dịch tự nhiên
• Sửa lỗi nhận dạng sai
• Đúng ${BATCH_SIZE} dòng, số thứ tự. Chỉ trả bản dịch.`;
  }

  function splitPlainLines(text) {
    return text
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^(quy định|quy tắc|dịch sát|chỉ trả)/i.test(line))
      .map((line) => line.replace(/^\d+[\.\):\-]\s*/, '').trim())
      .filter(Boolean);
  }

  function parseResponse(text, expectedCount) {
    const results = Array.from({ length: expectedCount }, () => '');
    const cleaned = String(text || '').replace(/\r/g, '').trim();
    if (!cleaned) return results;

    const numbered = /^\s*(\d+)[\.\):\-]\s*(.+)$/gm;
    let match = numbered.exec(cleaned);
    while (match) {
      const index = parseInt(match[1], 10) - 1;
      if (index >= 0 && index < expectedCount) {
        results[index] = match[2].trim();
      }
      match = numbered.exec(cleaned);
    }

    const numberedFilled = results.filter(Boolean).length;
    if (numberedFilled >= Math.max(1, Math.floor(expectedCount * 0.6))) {
      return results;
    }

    const plainLines = splitPlainLines(cleaned);
    if (plainLines.length === expectedCount) {
      return plainLines;
    }

    if (plainLines.length >= Math.floor(expectedCount * 0.85)) {
      return plainLines.slice(0, expectedCount);
    }

    for (let i = 0; i < expectedCount && i < plainLines.length; i += 1) {
      if (!results[i]) results[i] = plainLines[i];
    }
    return results;
  }

  async function waitForWebview(webview, fast = false) {
    await new Promise((resolve) => {
      if (webview.getWebContentsId && webview.getWebContentsId() > 0) {
        resolve();
        return;
      }
      webview.addEventListener('dom-ready', resolve, { once: true });
    });
    if (!fast) await sleep(webviewPrimed ? 200 : 600);
  }

  async function execute(webview, code) {
    const guestId = webview.getWebContentsId?.();
    if (window.api?.webviewExec && guestId) {
      const result = await window.api.webviewExec(guestId, code);
      if (result && result.__execError) {
        throw new Error(result.__execError);
      }
      return result;
    }
    return webview.executeJavaScript(code, true);
  }

  function guestId(webview) {
    return webview.getWebContentsId?.();
  }

  const CHATGPT_DOM_HELPERS = `
    function dismissPopups() {
      const closeSelectors = [
        'button[aria-label="Close"]',
        'button[aria-label="Dismiss"]',
        'button[data-testid="close-button"]',
      ];
      for (var i = 0; i < closeSelectors.length; i++) {
        document.querySelectorAll(closeSelectors[i]).forEach(function(btn) {
          try { btn.click(); } catch (e) {}
        });
      }
      document.querySelectorAll('button, [role="button"]').forEach(function(btn) {
        var label = (btn.getAttribute('aria-label') || btn.textContent || '').trim();
        if (/^(close|dismiss|later|skip|not now|no thanks|đóng|bỏ qua)$/i.test(label)) {
          try { btn.click(); } catch (e) {}
        }
      });
    }

    function findComposer() {
      var selectors = [
        '#prompt-textarea',
        'textarea#prompt-textarea',
        'div#prompt-textarea',
        'textarea[data-id="root"]',
        'div[contenteditable="true"]#prompt-textarea',
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][data-placeholder]',
        'textarea[placeholder*="Message"]',
        'textarea[placeholder*="message"]',
        'textarea[placeholder*="Ask"]',
      ];
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (el) return el;
      }
      var editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      for (var j = 0; j < editables.length; j++) {
        var rect = editables[j].getBoundingClientRect();
        if (rect.width > 80 && rect.height > 16) return editables[j];
      }
      return null;
    }

    function findSendButton(input) {
      var direct = [
        '[data-testid="send-button"]',
        '[data-testid="composer-send-button"]',
        'button[data-testid*="send"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Send message"]',
        'button[aria-label*="Send"]',
        'button[aria-label*="Gửi"]',
      ];
      for (var i = 0; i < direct.length; i++) {
        var btn = document.querySelector(direct[i]);
        if (btn) return btn;
      }
      var form = input ? input.closest('form') : null;
      if (form) {
        var formButtons = form.querySelectorAll('button');
        for (var k = formButtons.length - 1; k >= 0; k--) {
          var fb = formButtons[k];
          if (!fb.disabled && fb.querySelector('svg')) return fb;
        }
      }
      var node = input;
      for (var depth = 0; depth < 10 && node; depth++) {
        var buttons = node.querySelectorAll ? node.querySelectorAll('button') : [];
        for (var b = buttons.length - 1; b >= 0; b--) {
          var sb = buttons[b];
          var label = (sb.getAttribute('aria-label') || '').toLowerCase();
          if (sb.disabled) continue;
          if (sb.querySelector('svg') || label.indexOf('send') >= 0 || label.indexOf('gửi') >= 0) {
            return sb;
          }
        }
        node = node.parentElement;
      }
      if (input) {
        var inputRect = input.getBoundingClientRect();
        var candidates = Array.from(document.querySelectorAll('button')).filter(function(btn) {
          if (btn.disabled) return false;
          var rect = btn.getBoundingClientRect();
          if (rect.width < 20 || rect.height < 20) return false;
          return Math.abs(rect.top - inputRect.bottom) < 140 && rect.left > inputRect.left - 40;
        });
        return candidates[candidates.length - 1] || null;
      }
      return null;
    }

    function rectInfo(el) {
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, disabled: !!el.disabled };
    }

    function getComposerText(el) {
      if (!el) return '';
      if (el.tagName === 'TEXTAREA') return el.value || '';
      return el.innerText || el.textContent || '';
    }

    function setComposerValue(el, text) {
      el.focus();
      if (el.tagName === 'TEXTAREA') {
        var desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        if (desc && desc.set) desc.set.call(el, text);
        else el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      try {
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, text);
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        return;
      } catch (e1) {}
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }

    function clickByLabel(patterns) {
      var nodes = document.querySelectorAll('button, a, [role="button"], [role="menuitem"]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var label = (el.getAttribute('aria-label') || el.textContent || '').trim();
        for (var j = 0; j < patterns.length; j++) {
          if (patterns[j].test(label)) {
            try { el.click(); return true; } catch (e) {}
          }
        }
      }
      return false;
    }

    function openConversationMenu() {
      if (clickByLabel([/^open conversation options$/i, /^conversation options$/i])) return true;

      var active = document.querySelector('nav a[aria-current="page"]')
        || document.querySelector('nav a[data-active="true"]');
      if (!active) {
        var links = document.querySelectorAll('nav a[href*="/c/"]');
        for (var k = 0; k < links.length; k++) {
          var row = links[k].closest('li') || links[k].parentElement;
          if (row && /bg-|surface-secondary|active/i.test(row.className || '')) {
            active = links[k];
            break;
          }
        }
      }
      if (!active) return false;

      var container = active.closest('li') || active.parentElement;
      if (!container) return false;
      container.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      container.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      var menuBtn = container.querySelector('button[aria-label*="conversation" i]')
        || container.querySelector('button[aria-haspopup="menu"]')
        || container.querySelector('button[data-testid*="options"]');
      if (menuBtn) {
        try { menuBtn.click(); return true; } catch (e) {}
      }
      return false;
    }
  `;

  async function checkSendState(webview) {
    return execute(
      webview,
      `(function() {
        ${CHATGPT_DOM_HELPERS}
        try {
          var input = findComposer();
          var sendBtn = findSendButton(input);
          return {
            sendRect: rectInfo(sendBtn),
            sendDisabled: sendBtn ? !!sendBtn.disabled : true,
            textLen: getComposerText(input).trim().length,
            generating: !!document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop"]'),
          };
        } catch (e) {
          return { sendRect: null, sendDisabled: true, textLen: 0, generating: false };
        }
      })()`,
    );
  }

  async function verifySent(webview) {
    const state = await checkSendState(webview);
    if (state.generating) return true;
    if (state.textLen < 30) return true;
    if (state.sendDisabled && state.textLen > 0) return true;
    return false;
  }

  async function nativeClickSend(webview, sendRect) {
    const id = guestId(webview);
    if (!sendRect || !id || !window.api?.webviewClick) return false;
    const cx = Math.round(sendRect.x + sendRect.w / 2);
    const cy = Math.round(sendRect.y + sendRect.h / 2);
    await window.api.webviewClick(id, cx, cy);
    return true;
  }

  async function nativeEnterSend(webview) {
    const id = guestId(webview);
    if (!id || !window.api?.webviewKey) return false;
    await execute(
      webview,
      `(function() {
        ${CHATGPT_DOM_HELPERS}
        var input = findComposer();
        if (input) input.focus();
        return true;
      })()`,
    );
    await sleep(120);
    await window.api.webviewKey(id, 'Enter');
    return true;
  }

  async function waitForComposer(webview, timeoutMs = 90000) {
    const start = Date.now();
    const pollMs = webviewPrimed ? 600 : 1200;
    while (Date.now() - start < timeoutMs) {
      const probe = await execute(webview, COMPOSER_PROBE);
      if (probe && probe.found) return;
      await sleep(pollMs);
    }
    throw new Error('ChatGPT chưa sẵn sàng — hãy đăng nhập và mở một cuộc chat trong khung bên dưới.');
  }

  async function sendPrompt(webview, prompt, primed = false) {
    const payload = JSON.stringify(prompt);
    const prep = await execute(
      webview,
      `(function() {
        ${CHATGPT_DOM_HELPERS}
        try {
          dismissPopups();
          var text = ${payload};
          var input = findComposer();
          if (!input) {
            return { ok: false, error: 'Chưa thấy ô chat. Hãy đăng nhập ChatGPT và mở một cuộc chat.' };
          }
          setComposerValue(input, text);
          input.focus();
          var sendBtn = findSendButton(input);
          return {
            ok: true,
            sendRect: rectInfo(sendBtn),
            sendDisabled: sendBtn ? !!sendBtn.disabled : true,
            textLen: getComposerText(input).trim().length,
          };
        } catch (e) {
          return { ok: false, error: String(e.message || e) };
        }
      })()`,
    );

    if (!prep || !prep.ok) {
      throw new Error((prep && prep.error) || 'Không gửi được prompt tới ChatGPT');
    }

    let sendRect = prep.sendRect;
    let sendDisabled = prep.sendDisabled;

    for (let i = 0; i < 8; i += 1) {
      if (sendRect && !sendDisabled && prep.textLen > 10) break;
      await sleep(400);
      const state = await checkSendState(webview);
      sendRect = state.sendRect;
      sendDisabled = state.sendDisabled;
      if (state.textLen > 10 && sendRect && !sendDisabled) break;
    }

    const settleMs = primed ? 500 : 900;

    if (sendRect && !sendDisabled) {
      await nativeClickSend(webview, sendRect);
    } else {
      await nativeEnterSend(webview);
    }

    await sleep(settleMs);

    if (!(await verifySent(webview))) {
      await nativeEnterSend(webview);
      await sleep(settleMs);
    }

    if (!(await verifySent(webview))) {
      const state = await checkSendState(webview);
      if (state.sendRect && !state.sendDisabled) {
        await nativeClickSend(webview, state.sendRect);
        await sleep(settleMs);
      }
    }

    if (!(await verifySent(webview))) {
      throw new Error('Prompt chưa gửi — đóng popup Free offer, mở chat mới, rồi bấm Dịch ChatGPT lại');
    }

    return true;
  }

  async function waitForResponse(webview, prevCount, timeoutMs = 240000, expectedLines = 0) {
    const start = Date.now();
    let lastText = '';
    let stableTicks = 0;
    const needLines = Number(expectedLines) || 0;
    const needStable = needLines > 20 ? 3 : 2;
    const pollMs = 700;

    while (Date.now() - start < timeoutMs) {
      let state;
      try {
        state = await execute(webview, RESPONSE_STATE_PROBE);
      } catch {
        await sleep(pollMs);
        continue;
      }

      if (!state || state.count <= prevCount) {
        await sleep(pollMs);
        continue;
      }

      if (state.generating) {
        stableTicks = 0;
        lastText = state.latestText || '';
        await sleep(pollMs);
        continue;
      }

      const text = state.latestText || '';
      const lineCount = splitPlainLines(text).length;

      if (needLines > 1 && lineCount < needLines) {
        stableTicks = 0;
        lastText = text;
        await sleep(pollMs);
        continue;
      }

      if (needLines > 5 && lineCount < Math.min(needLines, Math.max(3, Math.floor(needLines * 0.2)))) {
        stableTicks = 0;
        lastText = text;
        await sleep(pollMs);
        continue;
      }

      if (text && text === lastText) {
        stableTicks += 1;
        if (stableTicks >= needStable && text.length > 3) return text;
      } else {
        stableTicks = 0;
        lastText = text;
      }

      await sleep(pollMs);
    }
    throw new Error('Timeout chờ ChatGPT trả lời');
  }

  async function openNewChat(webview) {
    await waitForWebview(webview);
    const clicked = await execute(
      webview,
      `(function() {
        ${CHATGPT_DOM_HELPERS}
        dismissPopups();
        if (clickByLabel([/^new chat$/i, /^chat mới$/i])) return { ok: true };
        return { ok: false };
      })()`,
    );

    if (!clicked || !clicked.ok) {
      try {
        webview.loadURL('https://chatgpt.com/');
      } catch (e) {
        await execute(webview, `window.location.href = 'https://chatgpt.com/'`);
      }
    }

    await sleep(2000);
    await waitForComposer(webview);
    webviewPrimed = true;
    await execute(
      webview,
      `(function() { ${CHATGPT_DOM_HELPERS} dismissPopups(); return true; })()`,
    );
    await sleep(300);
  }

  async function deleteCurrentChat(webview) {
    const onChatPage = await execute(
      webview,
      `(function() {
        try {
          return /\\/c\\//.test(location.pathname) || document.querySelector('[data-message-author-role="assistant"]');
        } catch (e) { return false; }
      })()`,
    );
    if (!onChatPage) return false;

    const menuOpened = await execute(
      webview,
      `(function() {
        ${CHATGPT_DOM_HELPERS}
        dismissPopups();
        return { opened: openConversationMenu() };
      })()`,
    );

    if (!menuOpened || !menuOpened.opened) return false;
    await sleep(700);

    const deleteClicked = await execute(
      webview,
      `(function() {
        ${CHATGPT_DOM_HELPERS}
        return {
          clicked: clickByLabel([/^delete( chat)?$/i, /^delete conversation$/i, /^xóa/i]),
        };
      })()`,
    );

    if (!deleteClicked || !deleteClicked.clicked) return false;
    await sleep(700);

    await execute(
      webview,
      `(function() {
        ${CHATGPT_DOM_HELPERS}
        clickByLabel([/^delete$/i, /^xóa$/i, /^confirm$/i]);
        return true;
      })()`,
    );

    await sleep(1200);
    return true;
  }

  async function translateBatch(webview, lines, targetLang, options = {}) {
    const timeoutMs = options.batchTimeoutMs || BATCH_TIMEOUT_MS;
    const maxAttempts = options.maxBatchAttempts || MAX_BATCH_ATTEMPTS;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (options.shouldStop && options.shouldStop()) {
        throw new Error('Đã dừng dịch');
      }

      if (attempt > 1) {
        if (options.onBatchRetry) {
          const reason = lastError && /thiếu dòng/i.test(String(lastError.message))
            ? 'incomplete'
            : 'timeout';
          options.onBatchRetry(attempt, maxAttempts, lastError, reason);
        }
        await openNewChat(webview);
      } else if (!options.primed) {
        await waitForWebview(webview, true);
      }

      try {
        await waitForComposer(webview, options.primed || attempt > 1 ? 20000 : 90000);
        const probe = await execute(webview, RESPONSE_STATE_PROBE);
        const prevCount = Number(probe && probe.count) || 0;
        await sendPrompt(
          webview,
          options.customPrompt || buildPrompt(lines, targetLang),
          options.primed || attempt > 1,
        );
        const response = await waitForResponse(webview, prevCount, timeoutMs, lines.length);
        const parsed = parseResponse(response, lines.length);
        const filled = parsed.filter(Boolean).length;
        if (filled < lines.length) {
          throw new Error(`ChatGPT trả về thiếu dòng (${filled}/${lines.length})`);
        }
        return parsed;
      } catch (err) {
        lastError = err;
        const msg = String(err.message || err);
        const timedOut = /timeout/i.test(msg);
        const incomplete = /thiếu dòng/i.test(msg);
        const isLast = attempt >= maxAttempts;
        const shouldRetry = (timedOut || incomplete) && !isLast;

        if (!shouldRetry) {
          if (timedOut && isLast) {
            throw new Error(`Timeout ${Math.round(timeoutMs / 1000)}s/batch sau ${maxAttempts} lần thử — kiểm tra ChatGPT và dịch lại`);
          }
          if (incomplete && isLast) {
            throw new Error(`${msg} — đã thử ${maxAttempts} lần, hãy dịch lại batch`);
          }
          throw err;
        }
      }
    }

    throw lastError || new Error('Dịch batch thất bại');
  }

  async function retranslateLine(webview, text, targetLang, options = {}) {
    const line = String(text || '').trim();
    if (!line) throw new Error('Dòng trống — không có nội dung để dịch');

    const results = await translateBatch(webview, [line], targetLang, {
      primed: true,
      shouldStop: options.shouldStop,
      maxBatchAttempts: options.maxBatchAttempts || 2,
      batchTimeoutMs: options.batchTimeoutMs || 90000,
      customPrompt: options.customPrompt,
    });

    const translated = results[0];
    if (!translated) {
      throw new Error('ChatGPT không trả về bản dịch cho dòng này');
    }
    return translated;
  }

  async function translateAll(webview, entryTexts, targetLang, options = {}) {
    const batchSize = options.batchSize || BATCH_SIZE;
    const batches = [];
    for (let i = 0; i < entryTexts.length; i += batchSize) {
      batches.push(entryTexts.slice(i, i + batchSize));
    }

    await openNewChat(webview);

    const allResults = [];
    let completed = false;
    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        if (options.shouldStop && options.shouldStop()) break;
        const batch = batches[batchIndex];
        if (options.onBatchStart) {
          options.onBatchStart(batchIndex + 1, batches.length, batch.length);
        }
        const translated = await translateBatch(webview, batch, targetLang, {
          primed: true,
          shouldStop: options.shouldStop,
          onBatchRetry: options.onBatchRetry,
        });
        allResults.push(...translated);
        if (options.onBatchDone) {
          options.onBatchDone(batchIndex + 1, batches.length, translated, batchIndex * batchSize);
        }
        if (batchIndex + 1 < batches.length) await sleep(1000);
      }
      completed = !(options.shouldStop && options.shouldStop());
      return allResults;
    } finally {
      webviewPrimed = false;
      if (completed) {
        try {
          await deleteCurrentChat(webview);
        } catch (e) {
          /* xóa chat thất bại không chặn kết quả dịch */
        }
      }
    }
  }

  async function probeLoginStatus(webview) {
    try {
      const guest = guestId(webview);
      if (!guest || guest <= 0) return { status: 'loading' };
      const result = await execute(webview, COMPOSER_PROBE);
      if (result && result.found) return { status: 'ready' };
      return { status: 'loading' };
    } catch (e) {
      return { status: 'loading' };
    }
  }

  function buildLinePrompt(text, targetLang) {
    const line = String(text || '').trim();
    return buildPrompt([line], targetLang);
  }

  async function isComposerReady(webview) {
    const result = await probeLoginStatus(webview);
    return result.status === 'ready';
  }

  return {
    BATCH_SIZE,
    BATCH_TIMEOUT_MS,
    MAX_BATCH_ATTEMPTS,
    TARGET_LABELS,
    buildPrompt,
    buildLinePrompt,
    buildPromptPreview,
    parseResponse,
    splitPlainLines,
    translateBatch,
    retranslateLine,
    translateAll,
    openNewChat,
    deleteCurrentChat,
    probeLoginStatus,
    isComposerReady,
  };
}());
