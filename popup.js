const DEFAULTS = {
  targetLang: 'ru',
  autoTranslateSelection: true,
  uiLang: 'ru'
};

const POPULAR_LANGUAGE_CODES = [
  'ru',
  'en',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'pl',
  'uk',
  'tr',
  'zh-CN',
  'ja',
  'ko',
  'ar'
];

const OTHER_LANGUAGE_CODES = [
  'az',
  'be',
  'bg',
  'vi',
  'hy',
  'el',
  'ka',
  'da',
  'he',
  'id',
  'kk',
  'ky',
  'lv',
  'lt',
  'ms',
  'nl',
  'no',
  'fa',
  'ro',
  'sr',
  'sk',
  'tg',
  'th',
  'uz',
  'fi',
  'hi',
  'hr',
  'cs',
  'sv',
  'et',
  'zh-TW'
];

const LOCALES = {
  ru: 'ru-RU',
  uk: 'uk-UA',
  en: 'en-US'
};

const targetLangEl = document.getElementById('targetLang');
const uiLangEl = document.getElementById('uiLang');
const autoSelectionEl = document.getElementById('autoSelection');
const autoHintEl = document.getElementById('autoHint');
const pageButton = document.getElementById('pageButton');
const pageCard = document.getElementById('pageCard');
const pageStatusEl = document.getElementById('pageStatus');

let activeTabId = null;
let requestInFlight = false;
let uiLang = 'ru';
let displayNames = null;
let displayNamesLocale = '';
let lastView = { kind: 'checking' };

init();

async function init() {
  const settings = await readSettings();
  uiLang = QT.normalizeUiLang(settings.uiLang);

  buildUiLanguageOptions();
  applyStaticText();
  buildLanguageOptions();

  const hasLanguage = Array.from(targetLangEl.options).some(
    (option) => option.value === settings.targetLang
  );
  targetLangEl.value = hasLanguage ? settings.targetLang : DEFAULTS.targetLang;

  autoSelectionEl.checked = settings.autoTranslateSelection !== false;
  updateAutoHint();
  repaint();

  targetLangEl.addEventListener('change', () => {
    saveSettings({ targetLang: targetLangEl.value });
  });

  uiLangEl.addEventListener('change', () => {
    uiLang = QT.normalizeUiLang(uiLangEl.value);
    saveSettings({ uiLang });
    applyStaticText();
    buildLanguageOptions();
    updateAutoHint();
    repaint();
  });

  autoSelectionEl.addEventListener('change', () => {
    saveSettings({ autoTranslateSelection: autoSelectionEl.checked });
    updateAutoHint();
  });

  pageButton.addEventListener('click', handlePageButtonClick);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') window.close();
  });

  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== 'number') {
    renderUnavailable();
    return;
  }

  activeTabId = tab.id;
  await refreshStatus();
  setInterval(refreshStatus, 1100);
}

function buildUiLanguageOptions() {
  uiLangEl.replaceChildren();

  for (const language of QT.uiLanguages) {
    const option = document.createElement('option');
    option.value = language.code;
    option.textContent = language.label;
    uiLangEl.appendChild(option);
  }

  uiLangEl.value = uiLang;
}

function applyStaticText() {
  document.documentElement.lang = uiLang;
  document.title = QT.t(uiLang, 'appName');

  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = QT.t(uiLang, element.dataset.i18n);
  }

  for (const element of document.querySelectorAll('[data-i18n-aria]')) {
    element.setAttribute('aria-label', QT.t(uiLang, element.dataset.i18nAria));
  }
}

function buildLanguageOptions() {
  const previous = targetLangEl.value;
  targetLangEl.replaceChildren();

  appendLanguageGroup(POPULAR_LANGUAGE_CODES, QT.t(uiLang, 'popularLanguages'));
  appendLanguageGroup(OTHER_LANGUAGE_CODES, QT.t(uiLang, 'otherLanguages'));

  const fallback = previous || DEFAULTS.targetLang;
  const hasFallback = Array.from(targetLangEl.options).some(
    (option) => option.value === fallback
  );
  targetLangEl.value = hasFallback ? fallback : DEFAULTS.targetLang;
}

function appendLanguageGroup(codes, label) {
  const optgroup = document.createElement('optgroup');
  optgroup.label = label;

  for (const code of codes) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = languageName(code);
    optgroup.appendChild(option);
  }

  targetLangEl.appendChild(optgroup);
}

function updateAutoHint() {
  autoHintEl.textContent = QT.t(
    uiLang,
    autoSelectionEl.checked ? 'autoHintOn' : 'autoHintOff'
  );
}

async function handlePageButtonClick() {
  if (activeTabId === null || requestInFlight) return;

  requestInFlight = true;
  pageButton.disabled = true;

  try {
    const response = await sendToTab(activeTabId, {
      type: 'togglePageTranslation',
      targetLang: targetLangEl.value
    });

    if (!response || !response.ok) {
      throw new Error(QT.t(uiLang, 'noResponse'));
    }

    if (response.state === 'restored') {
      renderRestored();
    } else {
      renderTranslating({ done: 0, total: 0 });
    }
  } catch {
    requestInFlight = false;
    renderUnavailable();
    return;
  }

  requestInFlight = false;
  await sleep(140);
  await refreshStatus();
}

async function refreshStatus() {
  if (activeTabId === null || requestInFlight) return;

  try {
    const status = await sendToTab(activeTabId, { type: 'getStatus' });
    if (!status || !status.ok) throw new Error(QT.t(uiLang, 'noResponse'));
    renderStatus(status);
  } catch {
    renderUnavailable();
  }
}

function renderStatus(status) {
  lastView = { kind: 'status', status };
  paintStatus(status);
}

function paintStatus(status) {
  pageCard.classList.remove('busy', 'done', 'error');

  if (status.translating) {
    pageCard.classList.add('busy');
    pageButton.disabled = false;
    pageButton.className = 'button secondary';
    pageButton.textContent = QT.t(uiLang, 'cancelTranslation');

    if (status.total > 0) {
      pageStatusEl.textContent = QT.t(uiLang, 'statusTranslating', {
        done: formatNumber(status.done),
        total: formatNumber(status.total)
      });
    } else {
      pageStatusEl.textContent = QT.t(uiLang, 'statusStarting');
    }
    return;
  }

  if (status.translated) {
    pageCard.classList.add('done');
    pageButton.disabled = false;
    pageButton.className = 'button secondary';
    pageButton.textContent = QT.t(uiLang, 'restoreOriginal');
    pageStatusEl.textContent = QT.t(uiLang, 'statusTranslated', {
      lang: languageName(status.target)
    });
    return;
  }

  pageButton.disabled = false;
  pageButton.className = 'button primary';
  pageButton.textContent = QT.t(uiLang, 'translatePage');
  pageStatusEl.textContent = QT.t(uiLang, 'statusIdle');
}

function renderTranslating(progress) {
  lastView = { kind: 'translating', progress };
  paintTranslating(progress);
}

function paintTranslating(progress) {
  pageCard.classList.remove('done', 'error');
  pageCard.classList.add('busy');
  pageButton.disabled = false;
  pageButton.className = 'button secondary';
  pageButton.textContent = QT.t(uiLang, 'cancelTranslation');
  pageStatusEl.textContent = progress.total > 0
    ? QT.t(uiLang, 'statusTranslating', {
      done: formatNumber(progress.done),
      total: formatNumber(progress.total)
    })
    : QT.t(uiLang, 'statusStarting');
}

function renderRestored() {
  lastView = { kind: 'restored' };
  paintRestored();
}

function paintRestored() {
  pageCard.classList.remove('busy', 'done', 'error');
  pageButton.disabled = false;
  pageButton.className = 'button primary';
  pageButton.textContent = QT.t(uiLang, 'translatePage');
  pageStatusEl.textContent = QT.t(uiLang, 'statusRestored');
}

function renderUnavailable() {
  lastView = { kind: 'unavailable' };
  paintUnavailable();
}

function paintUnavailable() {
  pageCard.classList.remove('busy', 'done');
  pageCard.classList.add('error');
  pageButton.disabled = true;
  pageButton.className = 'button secondary';
  pageButton.textContent = QT.t(uiLang, 'unavailable');
  pageStatusEl.textContent = QT.t(uiLang, 'statusUnavailable');
}

function paintChecking() {
  pageCard.classList.remove('busy', 'done', 'error');
  pageButton.disabled = true;
  pageButton.className = 'button primary';
  pageButton.textContent = QT.t(uiLang, 'translatePage');
  pageStatusEl.textContent = QT.t(uiLang, 'checkingPage');
}

function repaint() {
  if (lastView.kind === 'status') paintStatus(lastView.status);
  else if (lastView.kind === 'translating') paintTranslating(lastView.progress);
  else if (lastView.kind === 'restored') paintRestored();
  else if (lastView.kind === 'unavailable') paintUnavailable();
  else paintChecking();
}

function readSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(DEFAULTS, (value) => {
        if (chrome.runtime.lastError) {
          resolve({ ...DEFAULTS });
          return;
        }
        resolve({ ...DEFAULTS, ...value });
      });
    } catch {
      resolve({ ...DEFAULTS });
    }
  });
}

function saveSettings(patch) {
  try {
    chrome.storage.sync.set(patch);
  } catch {
    return;
  }
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tabs[0] || null);
    });
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function languageName(code) {
  if (!code) return QT.t(uiLang, 'selectedLanguage');

  if (!displayNames || displayNamesLocale !== uiLang) {
    displayNamesLocale = uiLang;
    try {
      displayNames = new Intl.DisplayNames([LOCALES[uiLang]], { type: 'language' });
    } catch {
      displayNames = null;
    }
  }

  try {
    const name = displayNames?.of(code);
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {}

  return code;
}

function formatNumber(value) {
  return Number(value).toLocaleString(LOCALES[uiLang]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
