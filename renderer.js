const subtitleList = document.getElementById('subtitle-list');
const cueCount = document.getElementById('cue-count');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const footerPct = document.getElementById('footer-pct');
const progressPct = document.getElementById('progress-pct');
const progressSub = document.getElementById('progress-sub');
const progressRingFill = document.getElementById('progress-ring-fill');
const statusText = document.getElementById('status-text');
const errorBanner = document.getElementById('error-banner');
const systemLog = document.getElementById('system-log');
const promptPreview = document.getElementById('prompt-preview');
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');

const statFileName = document.getElementById('stat-file-name');
const statFilePath = document.getElementById('stat-file-path');
const statTotal = document.getElementById('stat-total');
const statDone = document.getElementById('stat-done');
const statRemaining = document.getElementById('stat-remaining');
const statElapsed = document.getElementById('stat-elapsed');
const statEta = document.getElementById('stat-eta');
const statLang = document.getElementById('stat-lang');
const statBatch = document.getElementById('stat-batch');

const btnOpen = document.getElementById('btn-open');
const btnTranslate = document.getElementById('btn-translate');
const btnStop = document.getElementById('btn-stop');
const btnExport = document.getElementById('btn-export');
const translateToSelect = document.getElementById('translate-to');
const chatgptWebview = document.getElementById('chatgpt-webview');
const chatgptSection = document.getElementById('chatgpt-section');
const mainLayout = document.getElementById('main-layout');
const btnToggleChatgpt = document.getElementById('btn-toggle-chatgpt');
const btnChatgptEmail = document.getElementById('btn-chatgpt-email');
const loginBanner = document.getElementById('login-banner');

const retranslateModal = document.getElementById('retranslate-modal');
const retranslateModalTitle = document.getElementById('retranslate-modal-title');
const retranslateOriginal = document.getElementById('retranslate-original');
const retranslateCustomToggle = document.getElementById('retranslate-custom-toggle');
const retranslatePromptInput = document.getElementById('retranslate-prompt');
const retranslateCancelBtn = document.getElementById('retranslate-cancel');
const retranslateConfirmBtn = document.getElementById('retranslate-confirm');

const RENDER_CHUNK = 120;
const VIRTUAL_THRESHOLD = 200;
const RING_CIRCUMFERENCE = 326;
const LOG_MAX = 60;

let cues = [];
let sourcePath = null;
let isTranslating = false;
let translateAbort = false;
let translatedCount = 0;
let loginBannerTimer = null;
let searchTimer = null;
let translateStartTime = 0;
let activeBatchStart = -1;
let activeBatchEnd = -1;
let searchQuery = '';
let statusFilter = 'all';
let elapsedTimer = null;
let editingIndex = -1;
let retranslatingIndex = -1;
let retranslateModalIndex = -1;

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.remove('hidden');
  setStatus('Lỗi', 'danger');
}

function hideError() {
  errorBanner.classList.add('hidden');
  errorBanner.textContent = '';
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = '';
  if (window.AppIcons) {
    if (type === 'success') icon = window.AppIcons.check();
    else if (type === 'error') icon = window.AppIcons.circle();
  }
  toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 280);
  }, 2200);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRange(start, end) {
  return `${window.SrtParser.formatTime(start)} → ${window.SrtParser.formatTime(end)}`;
}

function countTranslatedCues() {
  return cues.filter((c) => c.translation && String(c.translation).trim()).length;
}

function isFullyTranslated() {
  return cues.length > 0 && countTranslatedCues() === cues.length;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

function basename(path) {
  if (!path) return 'Chưa mở file';
  const parts = String(path).replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function addLog(message) {
  if (!systemLog) return;
  const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-time">${time}</span>${escapeHtml(message)}`;
  systemLog.prepend(entry);
  while (systemLog.children.length > LOG_MAX) {
    systemLog.lastElementChild?.remove();
  }
}

function setStatus(label, mode = 'normal') {
  if (!statusText) return;
  statusText.textContent = label;
  statusText.className = 'status-text';
  if (mode === 'busy') statusText.style.color = '#93c5fd';
  else if (mode === 'done') statusText.style.color = '#86efac';
  else if (mode === 'danger') statusText.style.color = '#fca5a5';
  else statusText.style.color = '';
}

function setProgress(pct, detail) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  if (progressFill) progressFill.style.width = `${clamped}%`;
  if (footerPct) footerPct.textContent = `${clamped}%`;
  if (progressPct) progressPct.textContent = `${clamped}%`;
  if (progressRingFill) {
    progressRingFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - clamped / 100));
  }
  if (progressSub) {
    progressSub.textContent = `${translatedCount} / ${cues.length} dòng`;
  }
  if (detail && progressText) progressText.textContent = detail;
}

function updateDashboard() {
  const total = cues.length;
  const remaining = Math.max(0, total - translatedCount);

  if (statTotal) statTotal.textContent = String(total);
  if (statDone) statDone.textContent = String(translatedCount);
  if (statRemaining) statRemaining.textContent = String(remaining);
  if (cueCount) cueCount.textContent = `${total} dòng`;

  const pct = total > 0 ? (translatedCount / total) * 100 : 0;
  setProgress(pct);

  if (isTranslating && translateStartTime > 0) {
    const elapsed = (Date.now() - translateStartTime) / 1000;
    if (statElapsed) statElapsed.textContent = formatDuration(elapsed);
    if (translatedCount > 0 && remaining > 0 && statEta) {
      const perLine = elapsed / translatedCount;
      statEta.textContent = formatDuration(perLine * remaining);
    }
  } else if (!isTranslating && translateStartTime === 0) {
    statElapsed.textContent = '00:00:00';
    if (statEta) statEta.textContent = '—';
  }

  updatePromptPreview();
}

function updatePromptPreview() {
  if (!promptPreview || !window.ChatGptBatchTranslator?.buildPromptPreview) return;
  const target = translateToSelect?.value || 'vi';
  promptPreview.textContent = window.ChatGptBatchTranslator.buildPromptPreview(target);
  if (statLang && translateToSelect) {
    const label = translateToSelect.options[translateToSelect.selectedIndex]?.text || target;
    statLang.textContent = `Gốc → ${label}`;
  }
  if (statBatch && window.ChatGptBatchTranslator.BATCH_SIZE) {
    const sec = Math.round((window.ChatGptBatchTranslator.BATCH_TIMEOUT_MS || 120000) / 1000);
    statBatch.textContent = `${window.ChatGptBatchTranslator.BATCH_SIZE} dòng · ${sec}s/batch`;
  }
}

function cueStatus(cue, index) {
  if (retranslatingIndex === index) return 'translating';
  if (cue.translation) return 'done';
  if (isTranslating) {
    if (index >= activeBatchStart && index < activeBatchEnd) return 'translating';
    return 'waiting';
  }
  return 'waiting';
}

function isCueActionsLocked() {
  return isTranslating || retranslatingIndex >= 0 || editingIndex >= 0 || retranslateModalIndex >= 0;
}

function statusBadgeInner(cue, status) {
  const I = window.AppIcons;
  if (!I) {
    if (status === 'done' && cue.edited) return 'Đã sửa';
    if (status === 'done') return 'Đã dịch';
    if (status === 'translating') return 'Đang dịch';
    return 'Chờ dịch';
  }
  if (status === 'done' && cue.edited) {
    return `<span class="cue-status-icon">${I.pencil()}</span><span>Đã sửa</span>`;
  }
  if (status === 'done') {
    return `<span class="cue-status-icon">${I.check()}</span><span>Đã dịch</span>`;
  }
  if (status === 'translating') {
    return `<span class="cue-status-icon spin">${I.loader()}</span><span>Đang dịch</span>`;
  }
  return `<span class="cue-status-icon">${I.circle()}</span><span>Chờ dịch</span>`;
}

function statusBadgeClass(cue, status) {
  if (status === 'done' && cue.edited) return 'edited';
  return status;
}

function matchesFilter(cue, index) {
  const status = cueStatus(cue, index);
  if (statusFilter === 'done' && status !== 'done') return false;
  if (statusFilter === 'edited' && !cue.edited) return false;
  if (statusFilter === 'translating' && status !== 'translating') return false;
  if (statusFilter === 'waiting' && status !== 'waiting') return false;
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  const hay = `${cue.text} ${cue.translation || ''}`.toLowerCase();
  return hay.includes(q);
}

function translationHtml(cue, index) {
  if (cue.translation) {
    const editable = !isCueActionsLocked() ? ' editable' : '';
    const action = !isCueActionsLocked() ? ' data-action="edit"' : '';
    return `<div class="cue-translation${editable}"${action} title="Bấm để sửa">${escapeHtml(cue.translation)}</div>`;
  }
  const status = cueStatus(cue, index);
  if (status === 'translating') {
    return '<div class="cue-translation pending">Đang dịch...</div>';
  }
  if (!isTranslating && retranslatingIndex < 0) {
    return '<div class="cue-translation editable empty" data-action="edit" title="Bấm để thêm bản dịch"><span class="muted">Chưa có bản dịch — bấm để nhập</span></div>';
  }
  return '';
}

function cueItemHtml(cue, i) {
  const status = cueStatus(cue, i);
  const badgeClass = statusBadgeClass(cue, status);
  const hidden = matchesFilter(cue, i) ? '' : ' hidden-by-filter';
  const num = String(i + 1).padStart(3, '0');
  const I = window.AppIcons;
  const editIcon = I ? I.edit() : 'Sửa';
  const copyIcon = I ? I.copy() : 'Copy';
  const retranslateIcon = I ? I.retranslate() : '↻';
  const actionsLocked = isCueActionsLocked();
  return `
    <div class="cue-item status-${status}${hidden}" data-index="${i}">
      <div class="cue-header">
        <span class="cue-num">${num}</span>
        <span class="cue-time">${formatRange(cue.start, cue.end)}</span>
        <span class="cue-status ${badgeClass}">${statusBadgeInner(cue, status)}</span>
      </div>
      <div class="cue-original">${escapeHtml(cue.text)}</div>
      ${translationHtml(cue, i)}
      <div class="cue-actions">
        <button type="button" class="cue-action-btn${retranslatingIndex === i ? ' active' : ''}" data-action="retranslate" title="Dịch lại bằng ChatGPT" aria-label="Dịch lại" ${actionsLocked ? 'disabled' : ''}>${retranslateIcon}</button>
        <button type="button" class="cue-action-btn" data-action="edit" title="Sửa bản dịch" aria-label="Sửa bản dịch" ${actionsLocked ? 'disabled' : ''}>${editIcon}</button>
        <button type="button" class="cue-action-btn" data-action="copy" title="Sao chép" aria-label="Sao chép">${copyIcon}</button>
      </div>
    </div>`;
}

function syncCueActionButtons() {
  const locked = isCueActionsLocked();
  subtitleList.querySelectorAll('.cue-action-btn').forEach((btn) => {
    const action = btn.dataset.action;
    if (action === 'copy') return;
    btn.disabled = locked;
  });
  subtitleList.querySelectorAll('.cue-action-btn[data-action="retranslate"]').forEach((btn) => {
    const item = btn.closest('.cue-item');
    const index = item ? Number(item.dataset.index) : -1;
    btn.classList.toggle('active', index === retranslatingIndex);
  });
}

function updateActionButtons() {
  translatedCount = countTranslatedCues();
  btnTranslate.disabled = cues.length === 0 || isTranslating;
  btnExport.disabled = !isFullyTranslated() || isTranslating;
  if (btnExport) {
    btnExport.title = isFullyTranslated()
      ? 'Xuất file SRT đã dịch'
      : cues.length > 0
        ? `Cần dịch đủ ${cues.length} dòng (${translatedCount}/${cues.length})`
        : 'Mở file SRT trước';
  }
  if (searchInput) searchInput.disabled = cues.length === 0;
  if (filterStatus) filterStatus.disabled = cues.length === 0;
  syncCueActionButtons();
  updateDashboard();
}

function applyListFilters() {
  subtitleList.querySelectorAll('.cue-item').forEach((el) => {
    const index = Number(el.dataset.index);
    const cue = cues[index];
    if (!cue) return;
    const visible = matchesFilter(cue, index);
    el.classList.toggle('hidden-by-filter', !visible);
    const status = cueStatus(cue, index);
    el.className = `cue-item status-${status}${visible ? '' : ' hidden-by-filter'}`;
    const badge = el.querySelector('.cue-status');
    if (badge) {
      badge.className = `cue-status ${statusBadgeClass(cue, status)}`;
      badge.innerHTML = statusBadgeInner(cue, status);
    }
  });
}

function renderCuesChunked(start = 0) {
  if (cues.length === 0) {
    subtitleList.innerHTML = '<p class="empty-state">Mở file .srt để bắt đầu dịch phụ đề.</p>';
    updateActionButtons();
    return;
  }

  if (start === 0) {
    subtitleList.innerHTML = '';
    subtitleList.classList.toggle('virtual-list', cues.length > VIRTUAL_THRESHOLD);
  }

  const end = Math.min(start + RENDER_CHUNK, cues.length);
  const fragment = document.createDocumentFragment();
  const wrap = document.createElement('div');
  wrap.innerHTML = cues.slice(start, end).map((cue, i) => cueItemHtml(cue, start + i)).join('');
  while (wrap.firstChild) fragment.appendChild(wrap.firstChild);
  subtitleList.appendChild(fragment);

  if (end < cues.length) {
    requestAnimationFrame(() => renderCuesChunked(end));
    return;
  }

  updateActionButtons();
}

function renderCues() {
  renderCuesChunked(0);
}

function refreshCueItem(index) {
  if (editingIndex === index) return;
  const el = subtitleList.querySelector(`.cue-item[data-index="${index}"]`);
  const cue = cues[index];
  if (!el || !cue) return;

  const status = cueStatus(cue, index);
  const visible = matchesFilter(cue, index);
  el.className = `cue-item status-${status}${visible ? '' : ' hidden-by-filter'}`;

  const badge = el.querySelector('.cue-status');
  if (badge) {
    badge.className = `cue-status ${statusBadgeClass(cue, status)}`;
    badge.innerHTML = statusBadgeInner(cue, status);
  }

  const retranslateBtn = el.querySelector('.cue-action-btn[data-action="retranslate"]');
  if (retranslateBtn) {
    retranslateBtn.classList.toggle('active', retranslatingIndex === index);
    retranslateBtn.disabled = isCueActionsLocked();
  }
  const editBtn = el.querySelector('.cue-action-btn[data-action="edit"]');
  if (editBtn) editBtn.disabled = isCueActionsLocked();

  const oldBlock = el.querySelector('.cue-translation, .cue-edit');
  const html = translationHtml(cue, index);
  if (html) {
    if (oldBlock) oldBlock.outerHTML = html;
    else el.querySelector('.cue-actions')?.insertAdjacentHTML('beforebegin', html);
  } else if (oldBlock) {
    oldBlock.remove();
  }
}

function mountEditForm(index) {
  const el = subtitleList.querySelector(`.cue-item[data-index="${index}"]`);
  const cue = cues[index];
  if (!el || !cue || isTranslating || retranslatingIndex >= 0 || retranslateModalIndex >= 0) return;

  let oldBlock = el.querySelector('.cue-translation, .cue-edit');
  if (!oldBlock) {
    const actions = el.querySelector('.cue-actions');
    if (!actions) return;
    oldBlock = document.createElement('div');
    oldBlock.className = 'cue-translation editable empty';
    actions.insertAdjacentElement('beforebegin', oldBlock);
  }

  const wrap = document.createElement('div');
  wrap.className = 'cue-edit';
  wrap.dataset.index = String(index);
  wrap.innerHTML = `
    <textarea class="cue-edit-input" rows="2" aria-label="Bản dịch dòng ${index + 1}"></textarea>
    <div class="cue-edit-actions">
      <button type="button" class="cue-edit-btn save" data-action="save-edit">Lưu</button>
      <button type="button" class="cue-edit-btn cancel" data-action="cancel-edit">Hủy</button>
    </div>
    <div class="cue-edit-hint">Enter lưu · Shift+Enter xuống dòng · Esc hủy</div>`;

  const textarea = wrap.querySelector('.cue-edit-input');
  textarea.value = cue.translation || '';

  oldBlock.replaceWith(wrap);
  editingIndex = index;

  el.querySelector('.cue-action-btn[data-action="edit"]')?.classList.add('active');

  requestAnimationFrame(() => {
    textarea.focus();
    const len = textarea.value.length;
    textarea.setSelectionRange(len, len);
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(52, textarea.scrollHeight)}px`;
  });
}

function cancelEditCue(index) {
  if (editingIndex !== index) return;
  editingIndex = -1;
  refreshCueItem(index);
  const el = subtitleList.querySelector(`.cue-item[data-index="${index}"]`);
  el?.querySelector('.cue-action-btn[data-action="edit"]')?.classList.remove('active');
}

function saveEditCue(index) {
  const el = subtitleList.querySelector(`.cue-item[data-index="${index}"]`);
  const cue = cues[index];
  if (!el || !cue || editingIndex !== index) return;

  const textarea = el.querySelector('.cue-edit-input');
  if (!textarea) return;

  const trimmed = textarea.value.trim();
  if (!trimmed) {
    showError('Bản dịch không được để trống.');
    textarea.focus();
    return;
  }

  const wasEmpty = !cue.translation;
  const changed = cue.translation !== trimmed;
  cue.translation = trimmed;
  cue.edited = true;

  if (wasEmpty) translatedCount += 1;
  editingIndex = -1;
  refreshCueItem(index);
  el?.querySelector('.cue-action-btn[data-action="edit"]')?.classList.remove('active');
  updateActionButtons();

  if (changed) addLog(`Đã sửa thủ công dòng ${index + 1}`);
}

function startEditCue(index) {
  if (isTranslating || retranslatingIndex >= 0 || retranslateModalIndex >= 0) return;
  if (editingIndex === index) return;
  if (editingIndex >= 0) cancelEditCue(editingIndex);
  mountEditForm(index);
}

function closeRetranslateModal() {
  retranslateModalIndex = -1;
  if (retranslateModal) retranslateModal.classList.add('hidden');
  syncCueActionButtons();
}

function openRetranslateModal(index) {
  const target = translateToSelect?.value;
  if (!target || !chatgptWebview || isTranslating || retranslatingIndex >= 0) return;
  if (editingIndex >= 0) cancelEditCue(editingIndex);

  const cue = cues[index];
  if (!cue || !String(cue.text || '').trim()) {
    showError('Dòng không có nội dung để dịch.');
    return;
  }

  const buildLinePrompt = window.ChatGptBatchTranslator?.buildLinePrompt;
  if (!retranslateModal || !buildLinePrompt) {
    runRetranslateCue(index);
    return;
  }

  retranslateModalIndex = index;
  retranslateModalTitle.textContent = `Dịch lại dòng ${index + 1}`;
  retranslateOriginal.textContent = cue.text;
  retranslateCustomToggle.checked = false;
  retranslatePromptInput.value = buildLinePrompt(cue.text, target);
  retranslatePromptInput.disabled = true;
  retranslateModal.classList.remove('hidden');
  syncCueActionButtons();
  retranslateConfirmBtn.focus();
}

function confirmRetranslateModal() {
  if (retranslateModalIndex < 0) return;
  const index = retranslateModalIndex;
  let customPrompt = null;
  if (retranslateCustomToggle.checked) {
    customPrompt = String(retranslatePromptInput.value || '').trim();
    if (!customPrompt) {
      showError('Nhập prompt hoặc bỏ chọn "Tùy chỉnh prompt".');
      retranslatePromptInput.focus();
      return;
    }
  }
  runRetranslateCue(index, customPrompt);
}

async function runRetranslateCue(index, customPrompt = null) {
  const target = translateToSelect?.value;
  if (!target || !chatgptWebview || isTranslating || retranslatingIndex >= 0) return;

  closeRetranslateModal();

  const cue = cues[index];
  if (!cue || !String(cue.text || '').trim()) {
    showError('Dòng không có nội dung để dịch.');
    return;
  }

  setChatgptCollapsed(false);
  hideError();

  const hadTranslation = !!cue.translation;
  const previousTranslation = cue.translation;

  retranslatingIndex = index;
  cue.translation = null;
  refreshCueItem(index);
  syncCueActionButtons();
  setStatus('Đang dịch lại', 'busy');
  addLog(
    customPrompt
      ? `Dịch lại dòng ${index + 1} (prompt tùy chỉnh)...`
      : `Dịch lại dòng ${index + 1} qua ChatGPT...`,
  );

  try {
    const { status } = await window.ChatGptBatchTranslator.probeLoginStatus(chatgptWebview);
    if (status !== 'ready') {
      throw new Error('ChatGPT chưa sẵn sàng — hãy đăng nhập ở panel bên phải.');
    }

    const line = await window.ChatGptBatchTranslator.retranslateLine(
      chatgptWebview,
      cue.text,
      target,
      customPrompt ? { customPrompt } : {},
    );

    cue.translation = line;
    cue.edited = false;
    if (!hadTranslation) translatedCount += 1;

    refreshCueItem(index);
    updateActionButtons();
    setStatus('Sẵn sàng');
    addLog(`Đã dịch lại dòng ${index + 1}`);
    showToast('Đã dịch lại');
  } catch (err) {
    if (previousTranslation) {
      cue.translation = previousTranslation;
    }
    refreshCueItem(index);
    updateActionButtons();
    showError(String(err.message || err));
    addLog(`Lỗi dịch lại dòng ${index + 1}: ${err.message || err}`);
    setStatus('Lỗi', 'danger');
  } finally {
    const idx = retranslatingIndex;
    retranslatingIndex = -1;
    syncCueActionButtons();
    if (idx >= 0) refreshCueItem(idx);
  }
}

async function retranslateCue(index) {
  openRetranslateModal(index);
}

function applyBatchTranslations(startIndex, translatedLines) {
  const indices = [];
  for (let i = 0; i < translatedLines.length; i += 1) {
    const cue = cues[startIndex + i];
    const line = translatedLines[i];
    if (!cue || !line) continue;
    if (!cue.translation) translatedCount += 1;
    cue.translation = line;
    cue.edited = false;
    indices.push(startIndex + i);
  }
  activeBatchStart = -1;
  activeBatchEnd = -1;
  if (!indices.length) return;
  requestAnimationFrame(() => {
    for (let j = 0; j < indices.length; j += 1) {
      refreshCueItem(indices[j]);
    }
    updateActionButtons();
  });
}

subtitleList.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger || !subtitleList.contains(trigger)) return;

  const action = trigger.dataset.action;
  if (!action) return;

  if (action === 'edit' && isCueActionsLocked()) return;

  const item = trigger.closest('.cue-item');
  if (!item) return;
  const index = Number(item.dataset.index);
  if (!Number.isFinite(index) || index < 0) return;
  const cue = cues[index];
  if (!cue) return;

  if (action === 'copy') {
    event.preventDefault();
    const text = cue.translation || cue.text;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Đã sao chép');
    }).catch(() => {
      showToast('Không sao chép được', 'error');
    });
    return;
  }

  if (action === 'save-edit') {
    event.preventDefault();
    saveEditCue(index);
    return;
  }

  if (action === 'cancel-edit') {
    event.preventDefault();
    cancelEditCue(index);
    return;
  }

  if (action === 'retranslate') {
    event.preventDefault();
    retranslateCue(index);
    return;
  }

  if (action === 'edit') {
    event.preventDefault();
    startEditCue(index);
  }
});

subtitleList.addEventListener('keydown', (event) => {
  const textarea = event.target.closest('.cue-edit-input');
  if (!textarea) return;
  const item = textarea.closest('.cue-item');
  if (!item) return;
  const index = Number(item.dataset.index);

  if (event.key === 'Escape') {
    event.preventDefault();
    cancelEditCue(index);
    return;
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    saveEditCue(index);
  }
});

subtitleList.addEventListener('input', (event) => {
  const textarea = event.target.closest('.cue-edit-input');
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(52, textarea.scrollHeight)}px`;
});

searchInput?.addEventListener('input', () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery = (searchInput.value || '').trim();
    applyListFilters();
  }, 200);
});

filterStatus?.addEventListener('change', () => {
  statusFilter = filterStatus.value || 'all';
  applyListFilters();
});

translateToSelect?.addEventListener('change', updatePromptPreview);

(function initChatgptWebview() {
  if (!chatgptWebview) return;

  let webviewLoadAttempts = 0;
  const WEBVIEW_MAX_RETRIES = 3;
  const CHATGPT_URL = 'https://chatgpt.com/';

  function showWebviewLoadError(message) {
    if (!loginBanner) return;
    loginBanner.classList.remove('hidden');
    loginBanner.innerHTML = `${escapeHtml(message)} — <strong>bấm Đăng nhập</strong> hoặc khởi động lại app khi mạng ổn định.`;
  }

  function reloadChatgptWebview() {
    try {
      chatgptWebview.loadURL(CHATGPT_URL);
    } catch (e) {
      chatgptWebview.src = CHATGPT_URL;
    }
  }

  async function refreshLoginBanner() {
    if (!window.ChatGptBatchTranslator?.probeLoginStatus) return;
    const { status } = await window.ChatGptBatchTranslator.probeLoginStatus(chatgptWebview);
    loginBanner?.classList.toggle('hidden', status === 'ready');
  }

  function refreshLoginBannerDebounced(delay = 800) {
    if (loginBannerTimer) clearTimeout(loginBannerTimer);
    loginBannerTimer = setTimeout(refreshLoginBanner, delay);
  }

  chatgptWebview.addEventListener('dom-ready', () => {
    webviewLoadAttempts = 0;
    try {
      chatgptWebview.setZoomFactor(1);
    } catch (e) {
      /* ignore */
    }
    refreshLoginBannerDebounced(300);
  });

  chatgptWebview.addEventListener('did-fail-load', (event) => {
    if (event.isMainFrame === false) return;
    const code = event.errorCode;
    if (code === -3) return; // ERR_ABORTED — navigation cancelled

    webviewLoadAttempts += 1;
    const errLabel = event.errorDescription || `mã ${code}`;
    addLog(`ChatGPT load lỗi: ${errLabel} (lần ${webviewLoadAttempts})`);

    if (webviewLoadAttempts <= WEBVIEW_MAX_RETRIES) {
      showWebviewLoadError(`Không tải được ChatGPT (${errLabel}) — thử lại ${webviewLoadAttempts}/${WEBVIEW_MAX_RETRIES}...`);
      setTimeout(reloadChatgptWebview, 2500 * webviewLoadAttempts);
      return;
    }

    showWebviewLoadError(`Không tải được ChatGPT (${errLabel})`);
  });

  chatgptWebview.addEventListener('did-stop-loading', () => {
    refreshLoginBannerDebounced();
  });

  if (window.api?.onChatgptLoginClosed) {
    window.api.onChatgptLoginClosed(() => {
      try {
        chatgptWebview.loadURL('https://chatgpt.com/');
      } catch (e) {
        chatgptWebview.src = 'https://chatgpt.com/';
      }
      refreshLoginBannerDebounced(1200);
      addLog('Đăng nhập ChatGPT thành công');
    });
  }
})();

async function openEmailLogin() {
  setChatgptCollapsed(false);
  if (window.api?.openChatgptLogin) {
    await window.api.openChatgptLogin();
  }
}

function setChatgptWebviewVisible(visible) {
  if (!chatgptWebview) return;
  chatgptWebview.classList.toggle('webview-hidden', !visible);
}

function setChatgptCollapsed(collapsed) {
  if (!chatgptSection || !mainLayout) return;

  chatgptSection.classList.toggle('collapsed', collapsed);
  mainLayout.classList.toggle('chatgpt-collapsed', collapsed);
  setChatgptWebviewVisible(!collapsed);

  if (btnToggleChatgpt) {
    const title = collapsed ? 'Mở rộng ChatGPT' : 'Thu gọn ChatGPT';
    btnToggleChatgpt.title = title;
    btnToggleChatgpt.setAttribute('aria-label', title);
    setChatgptToggleIcon(collapsed);
  }

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

btnChatgptEmail?.addEventListener('click', openEmailLogin);

if (btnToggleChatgpt && chatgptSection) {
  function setChatgptToggleIcon(collapsed) {
    const I = window.AppIcons;
    if (!I) {
      btnToggleChatgpt.textContent = collapsed ? '▸' : '◂';
      return;
    }
    btnToggleChatgpt.innerHTML = collapsed ? I.chevronLeft() : I.chevronRight();
  }

  btnToggleChatgpt.addEventListener('click', () => {
    const collapsed = !chatgptSection.classList.contains('collapsed');
    setChatgptCollapsed(collapsed);
  });

  setChatgptCollapsed(false);
}

async function startTranslation() {
  const target = translateToSelect?.value;
  if (!target || cues.length === 0 || !chatgptWebview) return;
  if (isTranslating) return;

  translateAbort = false;
  isTranslating = true;
  translatedCount = 0;
  translateStartTime = Date.now();
  activeBatchStart = 0;
  activeBatchEnd = Math.min(window.ChatGptBatchTranslator.BATCH_SIZE, cues.length);

  btnTranslate.disabled = true;
  btnStop.disabled = false;
  btnOpen.disabled = true;
  btnExport.disabled = true;
  hideError();
  setStatus('Đang dịch', 'busy');
  addLog(`Bắt đầu dịch ${cues.length} dòng sang ${translateToSelect?.options[translateToSelect.selectedIndex]?.text}`);

  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = setInterval(updateDashboard, 1000);

  cues.forEach((cue) => {
    cue.translation = null;
    cue.edited = false;
  });
  editingIndex = -1;
  renderCues();

  const texts = cues.map((c) => c.text);

  try {
    await window.ChatGptBatchTranslator.translateAll(chatgptWebview, texts, target, {
      batchSize: window.ChatGptBatchTranslator.BATCH_SIZE,
      shouldStop: () => translateAbort,
      onBatchStart: (current, total, size) => {
        activeBatchStart = (current - 1) * window.ChatGptBatchTranslator.BATCH_SIZE;
        activeBatchEnd = activeBatchStart + size;
        for (let i = activeBatchStart; i < activeBatchEnd; i += 1) refreshCueItem(i);
        applyListFilters();
        const pct = Math.round(((current - 1) / total) * 100);
        setProgress(pct, `Batch ${current}/${total} (${size} dòng)...`);
        addLog(`Đang xử lý batch ${current}/${total}`);
      },
      onBatchRetry: (attempt, maxAttempts, _err, reason) => {
        if (reason === 'incomplete') {
          addLog(`ChatGPT trả thiếu dòng — gửi lại batch (lần ${attempt}/${maxAttempts})`);
          setProgress(
            cues.length > 0 ? Math.round((translatedCount / cues.length) * 100) : 0,
            `Thiếu dòng — prompt lại batch (${attempt}/${maxAttempts})...`,
          );
          return;
        }
        const sec = Math.round((window.ChatGptBatchTranslator.BATCH_TIMEOUT_MS || 120000) / 1000);
        addLog(`Batch quá ${sec}s chưa có kết quả — thử lại lần ${attempt}/${maxAttempts}`);
        const pct = cues.length > 0 ? Math.round((translatedCount / cues.length) * 100) : 0;
        setProgress(pct, `Thử lại batch (lần ${attempt}/${maxAttempts})...`);
      },
      onBatchDone: (current, total, translatedLines, startIndex) => {
        applyBatchTranslations(startIndex, translatedLines);
        const pct = Math.round((current / total) * 100);
        setProgress(pct, `Batch ${current}/${total} xong`);
        addLog(`Batch ${current}/${total} hoàn tất`);
      },
    });
    setProgress(100, `Hoàn tất — ${cues.length} dòng`);
    setStatus('Hoàn tất', 'done');
    addLog('Dịch hoàn tất');
  } catch (err) {
    showError(String(err.message || err));
    setProgress(translatedCount > 0 ? (translatedCount / cues.length) * 100 : 0, 'Lỗi dịch');
    addLog(`Lỗi: ${err.message || err}`);
  } finally {
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
    isTranslating = false;
    translateAbort = false;
    activeBatchStart = -1;
    activeBatchEnd = -1;
    btnStop.disabled = true;
    btnOpen.disabled = false;
    applyListFilters();
    updateActionButtons();
  }
}

btnOpen.addEventListener('click', async () => {
  const result = await window.api.openSrtDialog();
  if (!result) return;

  hideError();
  sourcePath = result.filePath;
  statFileName.textContent = basename(result.filePath);
  statFilePath.textContent = result.filePath;
  cues = window.SrtParser.parse(result.content);
  translatedCount = 0;
  translateStartTime = 0;
  editingIndex = -1;
  retranslateModalIndex = -1;
  if (retranslateModal) retranslateModal.classList.add('hidden');
  searchQuery = '';
  if (searchInput) searchInput.value = '';
  if (filterStatus) filterStatus.value = 'all';
  statusFilter = 'all';

  if (cues.length === 0) {
    showError('Không đọc được phụ đề từ file SRT. Kiểm tra định dạng file.');
    renderCues();
    return;
  }

  renderCues();
  setProgress(0, `Đã tải ${cues.length} dòng — đăng nhập ChatGPT rồi bấm Dịch`);
  setStatus('Sẵn sàng');
  addLog(`Đã tải file ${basename(result.filePath)} (${cues.length} dòng)`);
});

btnTranslate.addEventListener('click', () => {
  startTranslation();
});

btnStop.addEventListener('click', () => {
  translateAbort = true;
  isTranslating = false;
  activeBatchStart = -1;
  activeBatchEnd = -1;
  btnStop.disabled = true;
  setProgress(translatedCount > 0 ? (translatedCount / cues.length) * 100 : 0, 'Đã dừng');
  setStatus('Đã dừng');
  addLog('Người dùng dừng dịch');
  applyListFilters();
  updateActionButtons();
});

btnExport.addEventListener('click', async () => {
  if (!cues.length) return;
  if (!isFullyTranslated()) {
    const done = countTranslatedCues();
    showToast(`Cần dịch đủ ${cues.length} dòng (hiện ${done}/${cues.length})`, 'error');
    return;
  }
  const content = window.SrtParser.serialize(cues, true);
  const ok = await window.api.exportSrt({ content, sourcePath });
  if (ok) {
    setProgress(100, 'Đã xuất file SRT');
    setStatus('Đã xuất', 'done');
    addLog('Xuất file SRT thành công');
  }
});

function initToolbarIcons() {
  const I = window.AppIcons;
  if (!I) return;
  btnOpen?.querySelector('.btn-icon')?.insertAdjacentHTML('afterbegin', I.folder());
  btnTranslate?.querySelector('.btn-icon')?.insertAdjacentHTML('afterbegin', I.play());
  btnStop?.querySelector('.btn-icon')?.insertAdjacentHTML('afterbegin', I.stop());
  btnExport?.querySelector('.btn-icon')?.insertAdjacentHTML('afterbegin', I.export());
}

function initRetranslateModal() {
  if (!retranslateModal) return;

  retranslateCancelBtn?.addEventListener('click', () => closeRetranslateModal());
  retranslateConfirmBtn?.addEventListener('click', () => confirmRetranslateModal());

  retranslateCustomToggle?.addEventListener('change', () => {
    const custom = retranslateCustomToggle.checked;
    retranslatePromptInput.disabled = !custom;
    if (!custom && retranslateModalIndex >= 0) {
      const cue = cues[retranslateModalIndex];
      const target = translateToSelect?.value;
      if (cue && target && window.ChatGptBatchTranslator?.buildLinePrompt) {
        retranslatePromptInput.value = window.ChatGptBatchTranslator.buildLinePrompt(cue.text, target);
      }
    }
    if (custom) {
      requestAnimationFrame(() => retranslatePromptInput.focus());
    }
  });

  retranslatePromptInput?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      confirmRetranslateModal();
    }
  });

  retranslateModal.addEventListener('click', (event) => {
    if (event.target === retranslateModal) closeRetranslateModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && retranslateModalIndex >= 0) {
      event.preventDefault();
      closeRetranslateModal();
    }
  });
}

async function initAppVersion() {
  const btn = document.getElementById('btn-check-update');
  if (!btn || !window.api?.getAppVersion) return;
  try {
    const version = await window.api.getAppVersion();
    if (version) btn.textContent = `v${version}`;
  } catch (e) {
    /* ignore */
  }

  btn.addEventListener('click', async () => {
    if (!window.api?.checkForUpdates) return;
    btn.disabled = true;
    try {
      await window.api.checkForUpdates();
    } finally {
      btn.disabled = false;
    }
  });

  window.api.onUpdateStatus?.((info) => {
    if (info?.status === 'available') {
      addLog(`Có bản mới v${info.latest} trên GitHub`);
    }
  });
}

updatePromptPreview();
initToolbarIcons();
initAppVersion();
initRetranslateModal();
renderCues();
