(() => {
  if (globalThis.__quickTranslatorLoaded) return;
  globalThis.__quickTranslatorLoaded = true;

  const DEFAULTS = {
    targetLang: 'ru',
    autoTranslateSelection: true,
    uiLang: 'ru'
  };

  const LOCALES = {
    ru: 'ru-RU',
    uk: 'uk-UA',
    en: 'en-US'
  };

  const SELECTION_LIMIT = 10000;
  const MAX_NODE_LENGTH = 18000;
  const PAGE_MAX_NODES = 2500;
  const PAGE_GROUP_CHARS = 3200;
  const PAGE_GROUP_NODES = 40;
  const PAGE_CONCURRENCY = 3;
  const SKIP_TAGS = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEMPLATE',
    'CODE',
    'PRE',
    'KBD',
    'SAMP',
    'TEXTAREA',
    'CANVAS',
    'SVG',
    'MATH',
    'IFRAME',
    'OBJECT',
    'EMBED'
  ]);
  const SKIP_TAG_SELECTOR = [
    'script',
    'style',
    'noscript',
    'template',
    'code',
    'pre',
    'kbd',
    'samp',
    'textarea',
    'canvas',
    'svg',
    'math',
    'iframe',
    'object',
    'embed'
  ].join(',');
  const SKIP_SELECTOR = [
    '[contenteditable]:not([contenteditable="false"])',
    '[translate="no"]',
    '.notranslate',
    '[aria-hidden="true"]',
    '[hidden]',
    '[inert]',
    'input',
    'textarea',
    'select',
    'option',
    '[role="textbox"]'
  ].join(',');
  const LETTER_PATTERN = /[\p{L}\p{N}]/u;

  const bubbleMarkup = `
    <div class="qt-bubble" role="dialog" aria-label="Перевод" hidden>
      <div class="qt-head">
        <div class="qt-heading">
          <span class="qt-mark">A</span>
          <span class="qt-title">Перевод</span>
          <span class="qt-langs"></span>
        </div>
        <button type="button" class="qt-icon" data-action="close" aria-label="Закрыть">×</button>
      </div>
      <div class="qt-body">
        <div class="qt-result" aria-live="polite"></div>
      </div>
      <div class="qt-actions">
        <button type="button" class="qt-btn qt-primary" data-action="translate" hidden>Перевести</button>
        <button type="button" class="qt-btn" data-action="copy" hidden>Копировать</button>
        <button type="button" class="qt-btn" data-action="replace" hidden>Заменить</button>
        <span class="qt-status"></span>
      </div>
    </div>
    <div class="qt-toast" hidden role="status">
      <span class="qt-spinner"></span>
      <span class="qt-toast-text"></span>
      <button type="button" class="qt-toast-action" data-action="toast-cancel" hidden></button>
      <button type="button" class="qt-toast-close" data-action="toast-close" aria-label="Закрыть">×</button>
    </div>
  `;

  const bubbleCss = `
    :host {
      all: initial;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    .qt-bubble,
    .qt-toast {
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
      color: #f4f4f4;
      -webkit-font-smoothing: antialiased;
      pointer-events: auto;
      user-select: text;
    }
    .qt-bubble[hidden],
    .qt-toast[hidden] {
      display: none !important;
    }
    .qt-bubble {
      position: fixed;
      width: max-content;
      min-width: 250px;
      max-width: min(390px, calc(100vw - 16px));
      background: #050505;
      border: 1px solid #333333;
      border-radius: 0;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.38);
      overflow: hidden;
      animation: qt-pop 0.1s linear;
    }
    .qt-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 40px;
      padding: 7px 8px 7px 12px;
      border-bottom: 1px solid #262626;
      background: #0b0b0b;
    }
    .qt-heading {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .qt-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      flex: 0 0 22px;
      border: 1px solid #454545;
      border-radius: 0;
      background: #111111;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
    }
    .qt-title {
      flex: 0 0 auto;
      font-size: 12px;
      font-weight: 650;
      letter-spacing: 0.02em;
    }
    .qt-langs {
      overflow: hidden;
      color: #8c8c8c;
      font-size: 11px;
      line-height: 1.3;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .qt-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      flex: 0 0 26px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: #8c8c8c;
      cursor: pointer;
      font: 20px/1 Arial, sans-serif;
    }
    .qt-icon:hover {
      background: #161616;
      color: #ffffff;
    }
    .qt-body {
      max-height: 42vh;
      overflow: auto;
      padding: 13px;
    }
    .qt-result {
      min-height: 20px;
      color: #f4f4f4;
      direction: auto;
      font-size: 14px;
      line-height: 1.55;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .qt-result.qt-muted {
      color: #8c8c8c;
      font-size: 12.5px;
    }
    .qt-result.qt-error {
      color: #ff6262;
      font-size: 12.5px;
    }
    .qt-loading {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #8c8c8c;
      font-size: 12.5px;
    }
    .qt-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      flex: 0 0 12px;
      border: 1.5px solid #2e2e2e;
      border-top-color: #ffffff;
      border-radius: 0;
      animation: qt-spin 0.8s linear infinite;
    }
    .qt-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 40px;
      padding: 7px 9px 8px;
      border-top: 1px solid #222222;
      background: #050505;
    }
    .qt-btn {
      appearance: none;
      padding: 6px 9px;
      border: 1px solid #3a3a3a;
      border-radius: 0;
      background: #0d0d0d;
      color: #d4d4d4;
      cursor: pointer;
      font: 600 11px/1.3 "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
      letter-spacing: 0.03em;
      transition: background 0.12s linear, border-color 0.12s linear, color 0.12s linear;
    }
    .qt-btn:hover {
      border-color: #777777;
      background: #171717;
      color: #ffffff;
    }
    .qt-btn.qt-primary {
      border-color: #ffffff;
      background: #ffffff;
      color: #000000;
    }
    .qt-btn.qt-primary:hover {
      border-color: #d8d8d8;
      background: #d8d8d8;
      color: #000000;
    }
    .qt-status {
      margin-left: auto;
      color: #bdbdbd;
      font-size: 10.5px;
      white-space: nowrap;
    }
    .qt-toast {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 9px;
      max-width: min(430px, calc(100vw - 32px));
      padding: 10px 11px;
      border: 1px solid #333333;
      border-radius: 0;
      background: #050505;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.38);
      color: #f4f4f4;
      font-size: 12px;
      line-height: 1.4;
      animation: qt-pop 0.1s linear;
    }
    .qt-toast:not(.qt-working) .qt-spinner {
      display: none;
    }
    .qt-toast-text {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .qt-toast-action {
      appearance: none;
      flex: 0 0 auto;
      padding: 5px 8px;
      border: 1px solid #ffffff;
      border-radius: 0;
      background: #ffffff;
      color: #000000;
      cursor: pointer;
      font: 600 11px/1.2 "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
    }
    .qt-toast-action:hover {
      border-color: #d8d8d8;
      background: #d8d8d8;
    }
    .qt-toast-close {
      appearance: none;
      width: 24px;
      height: 24px;
      flex: 0 0 24px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: #8c8c8c;
      cursor: pointer;
      font: 18px/1 Arial, sans-serif;
    }
    .qt-toast-close:hover {
      background: #161616;
      color: #ffffff;
    }
    .qt-bubble button:focus-visible,
    .qt-toast button:focus-visible {
      outline: 1px solid #ffffff;
      outline-offset: 1px;
    }
    @keyframes qt-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes qt-pop {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .qt-bubble,
      .qt-toast,
      .qt-spinner {
        animation: none;
      }
    }
  `;

  let settings = { ...DEFAULTS };
  let host = null;
  let shadow = null;
  let bubbleEl = null;
  let resultEl = null;
  let langEl = null;
  let statusEl = null;
  let translateBtn = null;
  let copyBtn = null;
  let replaceBtn = null;
  let toastEl = null;
  let toastTextEl = null;
  let toastActionEl = null;
  let toastTimer = null;
  let statusTimer = null;
  let selectionTimer = null;
  let bubbleToken = 0;
  let bubbleState = null;
  let languageNames = null;
  let languageNamesLang = '';
  let pageState = null;
  let pageBusy = false;
  let pageToken = 0;
  let pageProgress = { done: 0, total: 0 };
  let pageTruncated = false;
  let localTranslators = new Map();
  let localTranslatorPromises = new Map();
  let localDetector = null;
  let localDetectorPromise = null;
  let localProgressHandler = null;
  let toastActionHandler = null;

  chrome.storage.sync.get(DEFAULTS, (value) => {
    if (chrome.runtime.lastError) return;
    settings = {
      ...DEFAULTS,
      ...value,
      uiLang: QT.normalizeUiLang(value.uiLang)
    };
    applyContentStrings();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    if (changes.targetLang) {
      settings.targetLang = changes.targetLang.newValue || DEFAULTS.targetLang;
      updateBubbleMeta();
    }
    if (changes.autoTranslateSelection) {
      settings.autoTranslateSelection = changes.autoTranslateSelection.newValue !== false;
    }
    if (changes.uiLang) {
      settings.uiLang = QT.normalizeUiLang(changes.uiLang.newValue);
      applyContentStrings();
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || sender?.id !== chrome.runtime.id) return false;

    if (message.type === 'translateCurrentSelection') {
      if (!shadow) createUi();
      const info = getSelectionInfo();
      if (!info) {
        showToast(t('selectFirst'), { duration: 3200 });
        sendResponse({ ok: false, error: 'no-selection' });
        return false;
      }
      showSelectionBubble(info, true);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'togglePageTranslation') {
      if (pageBusy) {
        cancelPageTranslation();
        sendResponse({ ok: true, state: 'restored' });
        return false;
      }
      if (pageState) {
        restorePage();
        sendResponse({ ok: true, state: 'restored' });
        return false;
      }
      const target = normalizeLanguage(message.targetLang) || settings.targetLang;
      startPageTranslation(target).catch((error) => {
        console.error('Quick Translator: page translation crashed', error);
        pageToken += 1;
        restoreItems(pageState);
        pageState = null;
        pageBusy = false;
        pageProgress = { done: 0, total: 0 };
        showToast(t('pageFailed'), { duration: 5000 });
      });
      sendResponse({ ok: true, state: 'translating' });
      return false;
    }

    if (message.type === 'getStatus') {
      sendResponse({
        ok: true,
        translated: Boolean(pageState),
        translating: pageBusy,
        target: pageState ? pageState.target : settings.targetLang,
        done: pageProgress.done,
        total: pageProgress.total
      });
      return false;
    }

    return false;
  });

  init();

  function init() {
    if (!document.body || !document.documentElement) {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }
    if (!host) createUi();
  }

  function createUi() {
    if (host || !document.documentElement) return;

    host = document.createElement('div');
    host.id = 'quick-translator-root';
    host.style.cssText = [
      'all: initial',
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 0',
      'height: 0',
      'z-index: 2147483647',
      'pointer-events: none'
    ].join(';');

    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = bubbleMarkup;

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(bubbleCss);
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = bubbleCss;
      shadow.appendChild(style);
    }

    bubbleEl = shadow.querySelector('.qt-bubble');
    resultEl = shadow.querySelector('.qt-result');
    langEl = shadow.querySelector('.qt-langs');
    statusEl = shadow.querySelector('.qt-status');
    translateBtn = shadow.querySelector('[data-action="translate"]');
    copyBtn = shadow.querySelector('[data-action="copy"]');
    replaceBtn = shadow.querySelector('[data-action="replace"]');
    toastEl = shadow.querySelector('.qt-toast');
    toastTextEl = shadow.querySelector('.qt-toast-text');
    toastActionEl = shadow.querySelector('.qt-toast-action');

    document.documentElement.appendChild(host);
    bindEvents();
    applyContentStrings();
  }

  function bindEvents() {
    shadow.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const action = button.dataset.action;
      if (action === 'close') {
        hideBubble();
      } else if (action === 'translate') {
        translateCurrentBubble();
      } else if (action === 'copy') {
        copyTranslation();
      } else if (action === 'replace') {
        replaceSelection();
      } else if (action === 'toast-close') {
        hideToast();
      } else if (action === 'toast-cancel') {
        const handler = toastActionHandler;
        toastActionHandler = null;
        hideToast();
        if (handler) handler();
        else cancelPageTranslation();
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (isInsideHost(event)) return;
      if (bubbleEl && !bubbleEl.hidden) hideBubble();
    }, true);

    document.addEventListener('mouseup', (event) => {
      if (isInsideHost(event) || event.button !== 0) return;
      scheduleSelectionCheck();
    }, true);

    document.addEventListener('keyup', (event) => {
      if (event.key === 'Escape') {
        hideBubble();
        hideToast();
        return;
      }
      if (isInsideHost(event)) return;
      scheduleSelectionCheck();
    }, true);

    window.addEventListener('resize', () => {
      if (bubbleEl && !bubbleEl.hidden) positionBubble(bubbleState?.anchor);
    }, { passive: true });
  }

  function scheduleSelectionCheck() {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const info = getSelectionInfo();
      if (!info) {
        if (bubbleEl && !bubbleEl.hidden) hideBubble();
        return;
      }
      if (settings.autoTranslateSelection === false) return;
      if (bubbleEl && !bubbleEl.hidden && bubbleState && bubbleState.text === info.text) {
        return;
      }
      showSelectionBubble(info, true);
    }, 140);
  }

  function getSelectionInfo() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    const text = selection.toString().replace(/\u200b/g, '').trim();
    if (!text) return null;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

    if (container && container.closest && container.closest(SKIP_SELECTOR)) {
      return null;
    }

    const rects = range.getClientRects();
    const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return null;

    return {
      text,
      range: range.cloneRange(),
      anchor: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      }
    };
  }

  function showSelectionBubble(info, auto) {
    if (!shadow) createUi();
    if (!shadow) return;

    bubbleToken += 1;
    const token = bubbleToken;
    bubbleState = {
      text: info.text,
      range: info.range,
      anchor: info.anchor,
      translation: '',
      detectedLang: '',
      actionKey: 'translate'
    };

    bubbleEl.hidden = false;
    updateBubbleMeta();
    translateBtn.hidden = true;
    copyBtn.hidden = true;
    replaceBtn.hidden = true;
    clearStatus();
    resultEl.className = 'qt-result';
    resultEl.textContent = '';

    if (info.text.length > SELECTION_LIMIT) {
      showBubbleError(t('selectionTooLong', { count: formatNumber(SELECTION_LIMIT) }));
      positionBubble(info.anchor);
      return;
    }

    if (auto) {
      translateWithToken(token);
    } else {
      resultEl.classList.add('qt-muted');
      resultEl.textContent = t('selectedChars', { count: formatNumber(info.text.length) });
      translateBtn.textContent = t('translate');
      translateBtn.hidden = false;
      positionBubble(info.anchor);
    }
  }

  function translateCurrentBubble() {
    if (!bubbleState) return;
    if (bubbleState.text.length > SELECTION_LIMIT) return;
    const options = bubbleState.localSetup
      ? { localOnly: true, allowLocalDownload: true }
      : {};
    translateWithToken(bubbleToken, options);
  }

  async function translateWithToken(token, options = {}) {
    if (!bubbleState || token !== bubbleToken) return;

    const downloading = options.allowLocalDownload === true;
    const previousProgressHandler = localProgressHandler;
    let progressHandler = null;
    showBubbleLoading(downloading ? t('downloadingModel') : t('translating'));
    positionBubble(bubbleState.anchor);

    if (downloading) {
      progressHandler = (ratio) => {
        if (token !== bubbleToken || !bubbleState) return;
        resultEl.className = 'qt-result qt-muted';
        resultEl.textContent = t('downloadingProgress', {
          percent: Math.round(ratio * 100)
        });
      };
      localProgressHandler = progressHandler;
    }

    try {
      const response = await requestTranslation(bubbleState.text, settings.targetLang, options);
      if (token !== bubbleToken || !bubbleState) return;

      bubbleState.translation = response.text;
      bubbleState.detectedLang = response.detectedLang || '';
      bubbleState.localSetup = false;
      resultEl.className = 'qt-result';
      resultEl.textContent = response.text;
      translateBtn.hidden = true;
      copyBtn.hidden = false;
      replaceBtn.hidden = !canReplaceSelection(bubbleState.range);
      updateBubbleMeta();
      positionBubble(bubbleState.anchor);
    } catch (error) {
      if (token !== bubbleToken) return;

      if (options.localOnly) {
        bubbleState.actionKey = 'retry';
        showBubbleError(error.message || t('localEnableFailed'));
        translateBtn.textContent = t('retry');
        translateBtn.hidden = false;
        positionBubble(bubbleState.anchor);
        return;
      }

      if (canOfferLocalSetup()) {
        bubbleState.localSetup = true;
        bubbleState.actionKey = 'downloadOffline';
        const message = error.code === 'ALL_PROVIDERS_LIMITED'
          ? t('localLimits')
          : t('onlineUnavailable');
        showBubbleError(message);
        translateBtn.textContent = t('downloadOffline');
        translateBtn.hidden = false;
        positionBubble(bubbleState.anchor);
        return;
      }

      bubbleState.actionKey = 'retry';
      showBubbleError(error.message || t('genericFail'));
      translateBtn.textContent = t('retry');
      translateBtn.hidden = false;
      positionBubble(bubbleState.anchor);
    } finally {
      if (progressHandler && localProgressHandler === progressHandler) {
        localProgressHandler = previousProgressHandler;
      }
    }
  }

  function showBubbleLoading(message = t('translating')) {
    resultEl.className = 'qt-result';
    resultEl.innerHTML = '';
    const loading = document.createElement('span');
    loading.className = 'qt-loading';
    const spinner = document.createElement('span');
    spinner.className = 'qt-spinner';
    loading.appendChild(spinner);
    loading.appendChild(document.createTextNode(message));
    resultEl.appendChild(loading);
    translateBtn.hidden = true;
    copyBtn.hidden = true;
    replaceBtn.hidden = true;
    clearStatus();
  }

  function showBubbleError(message) {
    resultEl.className = 'qt-result qt-error';
    resultEl.textContent = message;
    copyBtn.hidden = true;
    replaceBtn.hidden = true;
  }

  function hideBubble() {
    if (!bubbleEl) return;
    bubbleToken += 1;
    bubbleEl.hidden = true;
    bubbleState = null;
    clearStatus();
  }

  async function copyTranslation() {
    if (!bubbleState || !bubbleState.translation) return;
    try {
      await copyText(bubbleState.translation);
      showStatus(t('copyDone'));
    } catch {
      showStatus(t('copyFailed'));
    }
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {}
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('copy failed');
  }

  function canReplaceSelection(range) {
    if (!range) return false;
    const container = range.commonAncestorContainer;
    return Boolean(container && container.isConnected);
  }

  function replaceSelection() {
    if (!bubbleState || !bubbleState.translation || !canReplaceSelection(bubbleState.range)) {
      showStatus(t('replaceFailed'));
      return;
    }

    try {
      const range = bubbleState.range;
      range.deleteContents();
      range.insertNode(document.createTextNode(bubbleState.translation));
      window.getSelection()?.removeAllRanges();
      hideBubble();
      showToast(t('replaceDone'), { duration: 2600 });
    } catch {
      showStatus(t('replaceFailed'));
    }
  }

  function showStatus(text) {
    clearTimeout(statusTimer);
    statusEl.textContent = text;
    statusTimer = setTimeout(() => {
      statusEl.textContent = '';
    }, 1800);
  }

  function clearStatus() {
    clearTimeout(statusTimer);
    if (statusEl) statusEl.textContent = '';
  }

  function positionBubble(anchor) {
    if (!bubbleEl || bubbleEl.hidden) return;
    const rect = anchor || bubbleState?.anchor;
    if (!rect) return;

    bubbleEl.style.visibility = 'hidden';
    bubbleEl.style.left = '0px';
    bubbleEl.style.top = '0px';

    const width = bubbleEl.offsetWidth;
    const height = bubbleEl.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 8;
    const gap = 10;

    let left = rect.left;
    if (width >= viewportWidth - margin * 2) {
      left = margin;
    } else {
      left = Math.min(Math.max(margin, left), viewportWidth - width - margin);
    }

    let top = rect.bottom + gap;
    if (top + height > viewportHeight - margin) {
      top = rect.top - height - gap;
    }
    if (top < margin) {
      top = Math.max(margin, viewportHeight - height - margin);
    }

    bubbleEl.style.left = `${Math.round(left)}px`;
    bubbleEl.style.top = `${Math.round(top)}px`;
    bubbleEl.style.visibility = '';
  }

  function showToast(message, options = {}) {
    if (!toastEl) createUi();
    if (!toastEl) return;

    const { sticky = false, action = '', duration = 4200, onAction = null } = options;
    clearTimeout(toastTimer);
    toastTextEl.textContent = message;
    toastEl.classList.toggle('qt-working', sticky);
    toastEl.hidden = false;
    toastActionHandler = typeof onAction === 'function' ? onAction : null;

    if (action) {
      toastActionEl.textContent = action;
      toastActionEl.hidden = false;
    } else {
      toastActionEl.hidden = true;
      toastActionEl.textContent = '';
    }

    if (!sticky) {
      toastTimer = setTimeout(hideToast, duration);
    }
  }

  function hideToast() {
    if (!toastEl) return;
    clearTimeout(toastTimer);
    toastEl.hidden = true;
    toastActionHandler = null;
  }

  function updatePageProgress() {
    if (!pageBusy) return;
    showToast(
      t('pageProgress', {
        done: formatNumber(pageProgress.done),
        total: formatNumber(pageProgress.total)
      }),
      { sticky: true, action: t('cancel'), onAction: cancelPageTranslation }
    );
  }

  async function startPageTranslation(targetLang, options = {}) {
    if (pageBusy || pageState) return;
    if (!document.body) return;

    hideBubble();
    const target = normalizeLanguage(targetLang) || settings.targetLang;
    const collected = collectPageItems();

    if (collected.items.length === 0) {
      showToast(t('noText'), { duration: 4000 });
      return;
    }

    pageBusy = true;
    pageToken += 1;
    const token = pageToken;
    pageTruncated = collected.truncated;
    pageProgress = { done: 0, total: collected.items.length };
    pageState = {
      items: collected.items,
      target,
      replaced: new Set()
    };

    const runOptions = { ...options };
    const previousProgressHandler = localProgressHandler;
    let progressHandler = null;

    if (runOptions.allowLocalDownload) {
      progressHandler = (ratio) => {
        if (!pageBusy || token !== pageToken) return;
        showToast(
          t('downloadingProgress', { percent: Math.round(ratio * 100) }),
          { sticky: true, action: t('cancel'), onAction: cancelPageTranslation }
        );
      };
      localProgressHandler = progressHandler;
    }

    let localSetupError = null;

    try {
      const sample = collected.items
        .slice(0, 12)
        .map((item) => item.core)
        .join(' ')
        .slice(0, 3000);

      if (canOfferLocalSetup() && !runOptions.sourceLang) {
        if (runOptions.allowLocalDownload) {
          const source = inferSourceLanguage(sample);
          if (source) runOptions.sourceLang = source;
        } else {
          try {
            const source = await detectLocalSource(sample);
            if (source) runOptions.sourceLang = source;
          } catch {}
        }
      }

      if (runOptions.allowLocalDownload && runOptions.sourceLang) {
        const localSource = toLocalLanguage(runOptions.sourceLang);
        const localTarget = toLocalLanguage(target);
        if (localSource && localSource !== localTarget) {
          try {
            await getLocalTranslator(localSource, localTarget, true);
          } catch (error) {
            localSetupError = error;
          }
        }
      }

      updatePageProgress();

      const groups = buildGroups(collected.items);
      const failureCount = { value: 0 };
      let nextGroup = 0;

      const worker = async () => {
        while (true) {
          if (token !== pageToken) return;
          const groupIndex = nextGroup;
          nextGroup += 1;
          if (groupIndex >= groups.length) return;

          const indices = groups[groupIndex];
          const result = await translateGroup(collected.items, indices, target, token, runOptions);
          if (token !== pageToken) return;

          failureCount.value += result.failed;
          pageProgress.done = Math.min(
            pageProgress.total,
            pageProgress.done + indices.length
          );
          updatePageProgress();
          await sleep(70);
        }
      };

      const workerCount = Math.min(PAGE_CONCURRENCY, groups.length);
      await Promise.all(Array.from({ length: workerCount }, worker));

      if (token !== pageToken) return;

      pageBusy = false;

      if (!pageState || pageState.replaced.size === 0) {
        pageState = null;
        pageProgress = { done: 0, total: 0 };

        if (runOptions.localOnly) {
          showToast(
            localSetupError?.message || t('offlineUnavailablePage'),
            { duration: 6000 }
          );
        } else if (canOfferLocalSetup()) {
          showToast(
            t('enableOfflineUnlimited'),
            {
              sticky: true,
              action: t('download'),
              onAction: () => startPageTranslation(target, {
                localOnly: true,
                allowLocalDownload: true
              })
            }
          );
        } else {
          showToast(t('pageCloudFailed'), { duration: 5200 });
        }
        return;
      }

      let message = t('pageDone');
      if (failureCount.value > 0) {
        message += t('pageFailedFragments', {
          count: formatNumber(failureCount.value)
        });
      }
      if (pageTruncated) {
        message += t('pageTruncated');
      }
      message += t('pageDoneEnd');

      showToast(message, { duration: 5600 });
    } catch (error) {
      console.error('Quick Translator: page translation failed', error);
      if (token === pageToken) {
        pageToken += 1;
        restoreItems(pageState);
        pageState = null;
        pageBusy = false;
        pageProgress = { done: 0, total: 0 };
        showToast(t('pageFailed'), { duration: 5200 });
      }
    } finally {
      if (progressHandler && localProgressHandler === progressHandler) {
        localProgressHandler = previousProgressHandler;
      }
    }
  }

  function cancelPageTranslation() {
    if (!pageBusy && !pageState) return;

    const wasBusy = pageBusy;
    pageToken += 1;
    restoreItems(pageState);
    pageState = null;
    pageBusy = false;
    pageProgress = { done: 0, total: 0 };

    showToast(
      wasBusy ? t('pageCancelled') : t('restored'),
      { duration: 3000 }
    );
  }

  function restorePage() {
    if (!pageState) return;
    pageToken += 1;
    restoreItems(pageState);
    pageState = null;
    pageBusy = false;
    pageProgress = { done: 0, total: 0 };
    showToast(t('pageRestored'), { duration: 2600 });
  }

  function restoreItems(state) {
    if (!state) return;
    for (const index of state.replaced) {
      const item = state.items[index];
      if (item && item.node.isConnected) {
        item.node.nodeValue = item.original;
      }
    }
  }

  function collectPageItems() {
    const items = [];
    let truncated = false;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(SKIP_TAG_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (!LETTER_PATTERN.test(node.nodeValue || '')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      if (items.length >= PAGE_MAX_NODES) {
        truncated = true;
        break;
      }

      const node = walker.currentNode;
      const original = node.nodeValue;
      if (!original) continue;

      const core = original.trim();
      if (!core) continue;

      if (core.length > MAX_NODE_LENGTH) {
        truncated = true;
        continue;
      }

      const start = original.indexOf(core);
      const prefix = original.slice(0, start);
      const suffix = original.slice(start + core.length);

      items.push({
        index: items.length,
        node,
        original,
        prefix,
        suffix,
        core
      });
    }

    return { items, truncated };
  }

  function buildGroups(items) {
    const groups = [];
    let current = [];
    let currentLength = 0;

    for (const item of items) {
      const markerCost = 18;
      const mustStartNew = current.length >= PAGE_GROUP_NODES
        || (current.length > 0 && currentLength + item.core.length + markerCost > PAGE_GROUP_CHARS);

      if (mustStartNew) {
        groups.push(current);
        current = [];
        currentLength = 0;
      }

      current.push(item.index);
      currentLength += item.core.length + markerCost;
    }

    if (current.length > 0) groups.push(current);
    return groups;
  }

  async function translateGroup(items, indices, targetLang, token, options = {}) {
    if (token !== pageToken) return { failed: 0 };

    const marker = `QT${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const sourceText = indices.map((itemIndex, position) => {
      const text = items[itemIndex].core;
      return position === 0 ? text : `\n[[[${marker}_${position}]]]\n${text}`;
    }).join('');

    let response;
    try {
      response = await requestTranslation(sourceText, targetLang, options);
    } catch {
      return { failed: indices.length };
    }

    if (token !== pageToken) return { failed: 0 };

    let parts = splitGroupTranslation(response.text, indices.length, marker);
    if (!parts) {
      return translateIndividually(items, indices, targetLang, token, options);
    }

    let failed = 0;
    const unchanged = [];
    const sourceIsTarget = response.provider === 'local' &&
      Boolean(response.detectedLang) &&
      toLocalLanguage(response.detectedLang) === toLocalLanguage(targetLang);

    for (let position = 0; position < indices.length; position += 1) {
      if (token !== pageToken) return { failed };
      const itemIndex = indices[position];
      const item = items[itemIndex];
      const translated = parts[position];

      if (!item.node.isConnected || !translated || translated.trim() === '') {
        failed += 1;
        continue;
      }

      const sourceText = item.core.trim();
      const translatedText = translated.trim();
      const unchangedByCloud = response.provider === 'mymemory' && translatedText === sourceText;
      const unchangedByLocal = response.provider === 'local' && !sourceIsTarget &&
        translatedText.toLowerCase() === sourceText.toLowerCase();

      if (unchangedByCloud || unchangedByLocal) {
        unchanged.push(itemIndex);
        continue;
      }

      item.node.nodeValue = item.prefix + translated + item.suffix;
      pageState.replaced.add(itemIndex);
    }

    if (unchanged.length > 0) {
      const retry = await translateIndividually(items, unchanged, targetLang, token, options);
      failed += retry.failed;
    }

    return { failed };
  }

  async function translateIndividually(items, indices, targetLang, token, options = {}) {
    let failed = 0;
    let cursor = 0;

    const worker = async () => {
      while (true) {
        if (token !== pageToken) return;
        const position = cursor;
        cursor += 1;
        if (position >= indices.length) return;

        const itemIndex = indices[position];
        const item = items[itemIndex];

        try {
          const response = await requestTranslation(item.core, targetLang, options);
          if (token !== pageToken) return;
          if (!response.text || response.text.trim() === '' || !item.node.isConnected) {
            failed += 1;
            continue;
          }
          item.node.nodeValue = item.prefix + response.text + item.suffix;
          pageState.replaced.add(itemIndex);
        } catch {
          failed += 1;
        }

        await sleep(60);
      }
    };

    const workerCount = Math.min(3, indices.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    return { failed };
  }

  function splitGroupTranslation(translated, count, marker) {
    if (count === 1) return [translated];

    const pattern = new RegExp(`\\[\\[\\[${marker}_(\\d+)\\]\\]\\]`, 'i');
    const pieces = translated.split(pattern);
    if (pieces.length !== count * 2 - 1) return null;

    const parts = [];
    for (let position = 0; position < count; position += 1) {
      const markerIndex = pieces[position * 2 + 1];
      if (position < count - 1 && Number(markerIndex) !== position + 1) {
        return null;
      }

      let part = pieces[position * 2];
      if (position > 0) part = part.replace(/^[\r\n]+/, '');
      if (position < count - 1) part = part.replace(/[\r\n]+$/, '');
      parts.push(part.trim());
    }

    return parts;
  }

  function canOfferLocalSetup() {
    return typeof Translator === 'function' && window.isSecureContext;
  }

  function localError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function toLocalLanguage(code) {
    const value = String(code || '').toLowerCase();
    if (value === 'zh' || value === 'zh-cn' || value === 'zh-hans') return 'zh';
    if (value === 'zh-tw' || value === 'zh-hant') return 'zh-Hant';
    if (value === 'nb' || value === 'nn' || value === 'no') return 'no';
    return value.split('-')[0];
  }

  function fromLocalLanguage(code) {
    const value = String(code || '').toLowerCase();
    if (value === 'zh' || value === 'zh-hans') return 'zh-CN';
    if (value === 'zh-hant') return 'zh-TW';
    if (value === 'nb' || value === 'nn') return 'no';
    if (value === 'iw') return 'he';
    return value.split('-')[0];
  }

  function reportLocalProgress(event) {
    if (!localProgressHandler || !event) return;
    const loaded = Number(event.loaded);
    const total = Number(event.total);
    if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return;
    localProgressHandler(Math.max(0, Math.min(1, loaded / total)));
  }

  async function detectLocalSource(text) {
    if (typeof LanguageDetector === 'function') {
      try {
        if (!localDetector) {
          const availability = await LanguageDetector.availability();
          if (availability !== 'available') throw new Error('detector-unavailable');

          if (!localDetectorPromise) {
            localDetectorPromise = LanguageDetector.create().then((detector) => {
              localDetector = detector;
              return detector;
            }).finally(() => {
              localDetectorPromise = null;
            });
          }

          await localDetectorPromise;
        }

        const results = await localDetector.detect(text.slice(0, 3000));
        const best = Array.isArray(results)
          ? results.find((item) => item && item.detectedLanguage && item.detectedLanguage !== 'und')
          : null;

        if (best) return fromLocalLanguage(best.detectedLanguage);
      } catch {}
    }

    return inferSourceLanguage(text);
  }

  function inferSourceLanguage(text) {
    const counts = {
      latin: (text.match(/[A-Za-z\u00C0-\u024F]/g) || []).length,
      cyrillic: (text.match(/[\u0400-\u04FF]/g) || []).length,
      greek: (text.match(/[\u0370-\u03FF]/g) || []).length,
      cjk: (text.match(/[\u4E00-\u9FFF]/g) || []).length,
      kana: (text.match(/[\u3040-\u30FF]/g) || []).length,
      hangul: (text.match(/[\uAC00-\uD7AF]/g) || []).length,
      arabic: (text.match(/[\u0600-\u06FF]/g) || []).length,
      hebrew: (text.match(/[\u0590-\u05FF]/g) || []).length,
      thai: (text.match(/[\u0E00-\u0E7F]/g) || []).length,
      devanagari: (text.match(/[\u0900-\u097F]/g) || []).length
    };

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (!total) return '';

    if (counts.kana > 0 && counts.kana / (counts.kana + counts.cjk) >= 0.1) return 'ja';
    if (counts.hangul > 0) return 'ko';

    let best = '';
    let bestCount = 0;
    for (const [script, count] of Object.entries(counts)) {
      if (count > bestCount) {
        best = script;
        bestCount = count;
      }
    }

    if (!best || bestCount / total < 0.5) return '';

    const docLang = normalizeLanguage(document.documentElement.lang);
    const docBase = docLang ? docLang.split('-')[0].toLowerCase() : '';

    if (best === 'cyrillic') {
      if (['uk', 'bg', 'sr', 'be', 'mk'].includes(docBase)) return docBase;
      return 'ru';
    }
    if (best === 'greek') return 'el';
    if (best === 'arabic') return 'ar';
    if (best === 'hebrew') return 'he';
    if (best === 'thai') return 'th';
    if (best === 'devanagari') return 'hi';
    if (best === 'cjk') return 'zh-CN';
    if (best === 'kana') return 'ja';
    if (best === 'hangul') return 'ko';
    const latinLanguages = new Set([
      'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'tr', 'vi', 'id', 'ms',
      'tl', 'sw', 'da', 'sv', 'no', 'fi', 'et', 'lv', 'lt', 'ro', 'cs', 'sk',
      'sl', 'hr', 'hu', 'az', 'kk', 'uz', 'tg', 'ky', 'ca', 'gl', 'eu', 'sq',
      'af', 'is', 'ga', 'cy'
    ]);

    if (docLang) {
      const base = docLang.split('-')[0].toLowerCase();
      if (base !== toLocalLanguage(settings.targetLang) && latinLanguages.has(base)) {
        return base;
      }
    }

    return 'en';
  }

  async function getLocalTranslator(source, target, allowDownload) {
    const key = `${source}|${target}`;
    if (localTranslators.has(key)) return localTranslators.get(key);
    if (localTranslatorPromises.has(key)) return localTranslatorPromises.get(key);

    const promise = (async () => {
      let availability;
      try {
        availability = await Translator.availability({
          sourceLanguage: source,
          targetLanguage: target
        });
      } catch {
        throw localError('LOCAL_FAILED', t('localCheckFailed'));
      }

      if (availability === 'unavailable') {
        throw localError('LOCAL_UNSUPPORTED', t('localUnsupported'));
      }

      if (availability !== 'available' && !allowDownload) {
        throw localError('LOCAL_NEEDS_DOWNLOAD', t('localNeedsDownload'));
      }

      try {
        const translator = await Translator.create({
          sourceLanguage: source,
          targetLanguage: target,
          monitor(monitor) {
            monitor.addEventListener('downloadprogress', reportLocalProgress);
          }
        });
        localTranslators.set(key, translator);
        return translator;
      } catch (error) {
        if (error && error.name === 'NotAllowedError') {
          throw localError('LOCAL_NEEDS_DOWNLOAD', t('localAllowDownload'));
        }
        throw localError('LOCAL_FAILED', t('localEnableFailed'));
      }
    })();

    localTranslatorPromises.set(key, promise);

    try {
      return await promise;
    } finally {
      localTranslatorPromises.delete(key);
    }
  }

  async function requestLocalTranslation(text, targetLang, options = {}) {
    if (!canOfferLocalSetup()) {
      throw localError('LOCAL_UNAVAILABLE', t('localDisabled'));
    }

    const target = toLocalLanguage(targetLang);
    let source = options.sourceLang ? toLocalLanguage(options.sourceLang) : '';

    if (!source) {
      if (options.allowLocalDownload) {
        source = toLocalLanguage(inferSourceLanguage(text));
      } else {
        const detected = await detectLocalSource(text);
        source = toLocalLanguage(detected);
      }
    }

    if (!source) {
      throw localError('LOCAL_DETECTION_FAILED', t('detectionFailed'));
    }

    if (source === target) {
      return {
        text,
        detectedLang: fromLocalLanguage(source),
        provider: 'local'
      };
    }

    const translator = await getLocalTranslator(source, target, options.allowLocalDownload === true);

    let translated;
    try {
      translated = await translator.translate(text);
    } catch {
      throw localError('LOCAL_FAILED', t('localFailed'));
    }

    if (!translated || translated.trim() === '') {
      throw localError('LOCAL_FAILED', t('localEmpty'));
    }

    return {
      text: translated,
      detectedLang: fromLocalLanguage(source),
      provider: 'local'
    };
  }

  async function requestTranslation(text, targetLang, options = {}) {
    if (canOfferLocalSetup() && options.preferLocal !== false) {
      try {
        return await requestLocalTranslation(text, targetLang, options);
      } catch (error) {
        if (options.localOnly) throw error;
      }
    } else if (options.localOnly) {
      throw localError('LOCAL_UNAVAILABLE', t('localDisabled'));
    }

    return requestCloudTranslation(text, targetLang);
  }

  function requestCloudTranslation(text, targetLang) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          { type: 'translate', text, targetLang },
          (response) => {
            const error = chrome.runtime.lastError;
            if (error) {
              reject(new Error(t('extensionUpdated')));
              return;
            }
            if (!response || !response.ok) {
              const translationError = new Error(response?.error || t('genericFail'));
              translationError.code = response?.code || '';
              reject(translationError);
              return;
            }
            resolve(response);
          }
        );
      } catch {
        reject(new Error(t('extensionUpdated')));
      }
    });
  }

  function t(key, values) {
    return QT.t(settings.uiLang, key, values);
  }

  function applyContentStrings() {
    if (!shadow) return;

    const title = shadow.querySelector('.qt-title');
    const closeButton = shadow.querySelector('.qt-icon[data-action="close"]');
    const toastClose = shadow.querySelector('.qt-toast-close');

    if (title) title.textContent = t('bubbleTitle');
    if (bubbleEl) bubbleEl.setAttribute('aria-label', t('bubbleTitle'));
    if (closeButton) closeButton.setAttribute('aria-label', t('close'));
    if (toastClose) toastClose.setAttribute('aria-label', t('close'));
    if (translateBtn) translateBtn.textContent = t(bubbleState?.actionKey || 'translate');
    if (copyBtn) copyBtn.textContent = t('copy');
    if (replaceBtn) replaceBtn.textContent = t('replace');

    updateBubbleMeta();
  }

  function updateBubbleMeta() {
    if (!langEl || !bubbleState) return;

    const target = languageName(settings.targetLang);
    if (bubbleState.detectedLang) {
      langEl.textContent = `${languageName(bubbleState.detectedLang)} → ${target}`;
    } else {
      langEl.textContent = `→ ${target}`;
    }
  }

  function languageName(code) {
    if (!code) return t('selectedLanguage');

    if (!languageNames || languageNamesLang !== settings.uiLang) {
      languageNamesLang = settings.uiLang;
      try {
        languageNames = new Intl.DisplayNames([LOCALES[settings.uiLang] || LOCALES.ru], {
          type: 'language'
        });
      } catch {
        languageNames = null;
      }
    }

    try {
      const name = languageNames?.of(code);
      if (name) return name.charAt(0).toUpperCase() + name.slice(1);
    } catch {}

    return String(code);
  }

  function normalizeLanguage(language) {
    if (typeof language !== 'string') return '';
    const value = language.trim();
    return /^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(value) ? value : '';
  }

  function formatNumber(value) {
    return Number(value).toLocaleString(LOCALES[settings.uiLang] || LOCALES.ru);
  }

  function isInsideHost(event) {
    return Boolean(host && event.composedPath().includes(host));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
