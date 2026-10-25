importScripts('i18n.js');

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

const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const DEEPL_ENDPOINT = 'https://www2.deepl.com/jsonrpc';
const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get';
const MAX_TEXT_LENGTH = 20000;
const MYMEMORY_CHUNK_CHARS = 450;
const MYMEMORY_MAX_CHUNKS = 24;
const CACHE_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 25000;
const RATE_LIMIT_COOLDOWN_MS = 120000;
const MYMEMORY_COOLDOWN_MS = 600000;

const translationCache = new Map();
const pendingRequests = new Map();
const providerCooldowns = new Map();

let currentUiLang = 'ru';

chrome.storage.sync.get(DEFAULTS, (value) => {
  if (chrome.runtime.lastError) return;
  currentUiLang = QT.normalizeUiLang(value.uiLang);
});

const PROVIDERS = [
  { id: 'google', cooldownMs: RATE_LIMIT_COOLDOWN_MS, request: requestGoogle },
  { id: 'deepl', cooldownMs: RATE_LIMIT_COOLDOWN_MS, request: requestDeepL },
  { id: 'mymemory', cooldownMs: MYMEMORY_COOLDOWN_MS, request: requestMyMemory }
];

class TranslationError extends Error {
  constructor(code, message, retryAfterMs) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    this.retryAfterMs = retryAfterMs || 0;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(DEFAULTS, (settings) => {
    if (chrome.runtime.lastError) settings = { ...DEFAULTS };
    const missing = {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (settings[key] === undefined) missing[key] = value;
    }
    if (Object.keys(missing).length > 0) {
      chrome.storage.sync.set(missing);
    }
    currentUiLang = QT.normalizeUiLang(settings.uiLang);
    createContextMenus();
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !changes.uiLang) return;
  const next = QT.normalizeUiLang(changes.uiLang.newValue);
  if (next === currentUiLang) return;
  currentUiLang = next;
  createContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || typeof tab.id !== 'number') return;

  if (info.menuItemId === 'translate-selection') {
    sendToTab(tab.id, { type: 'translateCurrentSelection' }).catch(() => {
      showUnavailableBadge(tab.id);
    });
  }

  if (info.menuItemId === 'toggle-page-translation') {
    sendToTab(tab.id, { type: 'togglePageTranslation' }).catch(() => {
      showUnavailableBadge(tab.id);
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'translate-selection' && command !== 'toggle-page-translation') {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || typeof tab.id !== 'number') return;

  const message = command === 'translate-selection'
    ? { type: 'translateCurrentSelection' }
    : { type: 'togglePageTranslation' };

  try {
    await sendToTab(tab.id, message);
  } catch {
    showUnavailableBadge(tab.id);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'translate') return undefined;
  if (!sender || sender.id !== chrome.runtime.id) return undefined;

  translateText(message.text, message.targetLang)
    .then((result) => {
      sendResponse({
        ok: true,
        text: result.text,
        detectedLang: result.detectedLang,
        provider: result.provider
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: describeError(error),
        code: error && error.code ? error.code : 'UNKNOWN'
      });
    });

  return true;
});

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.runtime.lastError;

    chrome.contextMenus.create({
      id: 'translate-selection',
      title: t('contextSelection'),
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'toggle-page-translation',
      title: t('contextPage'),
      contexts: ['page']
    });
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function showUnavailableBadge(tabId) {
  try {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#dc2626' });
    chrome.action.setBadgeText({ tabId, text: '!' });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' });
    }, 2500);
  } catch {
    return;
  }
}

async function translateText(text, targetLang) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { text: '', detectedLang: '', provider: 'none' };
  }

  const target = normalizeLanguage(targetLang);
  if (!target) {
    throw new TranslationError('INVALID_LANGUAGE', t('invalidLanguage'));
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw new TranslationError(
      'TEXT_TOO_LONG',
      t('textTooLong', { count: formatNumber(MAX_TEXT_LENGTH) })
    );
  }

  const normalized = text.replace(/\r\n/g, '\n');
  const cacheKey = `${target}\u0000${normalized}`;

  const cached = translationCache.get(cacheKey);
  if (cached) {
    translationCache.delete(cacheKey);
    translationCache.set(cacheKey, cached);
    return cached;
  }

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const request = requestTranslation(normalized, target)
    .then((result) => {
      translationCache.set(cacheKey, result);
      while (translationCache.size > CACHE_LIMIT) {
        translationCache.delete(translationCache.keys().next().value);
      }
      return result;
    })
    .finally(() => {
      pendingRequests.delete(cacheKey);
    });

  pendingRequests.set(cacheKey, request);
  return request;
}

async function requestTranslation(text, targetLang) {
  let lastError = null;
  let attempted = 0;
  const now = Date.now();

  for (const provider of PROVIDERS) {
    const cooldownUntil = providerCooldowns.get(provider.id) || 0;
    if (cooldownUntil > now) continue;

    attempted += 1;

    try {
      const result = await provider.request(text, targetLang);
      providerCooldowns.delete(provider.id);
      return { ...result, provider: provider.id };
    } catch (error) {
      lastError = error;
      if (shouldCoolDown(error)) {
        const cooldownMs = error.retryAfterMs || provider.cooldownMs;
        providerCooldowns.set(provider.id, Date.now() + cooldownMs);
      }
    }
  }

  if (attempted === 0) {
    throw new TranslationError('ALL_PROVIDERS_LIMITED', t('allProvidersLimited'));
  }

  if (lastError && lastError.code === 'RATE_LIMITED') {
    throw new TranslationError('ALL_PROVIDERS_LIMITED', t('providersLimited'));
  }

  if (lastError) throw lastError;
  throw new TranslationError('TRANSLATION_FAILED', t('genericFail'));
}

function shouldCoolDown(error) {
  return Boolean(error) && (
    error.code === 'RATE_LIMITED' ||
    error.code === 'NETWORK_ERROR' ||
    error.code === 'SERVER_ERROR' ||
    error.code === 'TIMEOUT'
  );
}

async function requestGoogle(text, targetLang) {
  const url = new URL(GOOGLE_ENDPOINT);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('oe', 'UTF-8');

  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: new URLSearchParams({ q: text }).toString()
  });

  if (!response.ok) {
    if (response.status === 429 || response.status === 403) {
      throw rateLimitError(response, t('providerRateLimited', { provider: 'Google' }));
    }
    if (response.status >= 500) {
      throw new TranslationError(
        'SERVER_ERROR',
        t('providerServer', { provider: 'Google', status: response.status })
      );
    }
    if (response.status === 400) {
      throw new TranslationError(
        'UNSUPPORTED_LANGUAGE',
        t('providerUnsupported', { provider: 'Google' })
      );
    }
    throw new TranslationError(
      'BAD_RESPONSE',
      t('providerServer', { provider: 'Google', status: response.status })
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new TranslationError('BAD_RESPONSE', t('providerBadResponse', { provider: 'Google' }));
  }

  const chunks = Array.isArray(data) ? data[0] : null;
  if (!Array.isArray(chunks)) {
    throw new TranslationError('BAD_RESPONSE', t('providerBadResponse', { provider: 'Google' }));
  }

  const translated = chunks
    .map((chunk) => (Array.isArray(chunk) && typeof chunk[0] === 'string' ? chunk[0] : ''))
    .join('');

  if (text.trim() !== '' && translated.trim() === '') {
    throw new TranslationError('BAD_RESPONSE', t('providerEmpty', { provider: 'Google' }));
  }

  return {
    text: translated,
    detectedLang: typeof data[2] === 'string' ? data[2] : ''
  };
}

async function requestDeepL(text, targetLang) {
  const requestId = Math.floor(Math.random() * 100000000) + 1;
  const body = {
    jsonrpc: '2.0',
    method: 'LMT_handle_texts',
    id: requestId,
    params: {
      texts: [{ text, requestAlternatives: 0 }],
      splitting: 'newlines',
      lang: {
        source_lang_user_selected: 'auto',
        target_lang: toDeepLTarget(targetLang)
      },
      timestamp: Date.now()
    }
  };

  const response = await fetchWithTimeout(DEEPL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': '*/*'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    if (response.status === 429 || response.status === 403 || response.status === 456) {
      throw rateLimitError(response, t('providerRateLimited', { provider: 'DeepL' }));
    }
    if (response.status >= 500) {
      throw new TranslationError(
        'SERVER_ERROR',
        t('providerServer', { provider: 'DeepL', status: response.status })
      );
    }
    if (response.status === 400) {
      throw new TranslationError(
        'UNSUPPORTED_LANGUAGE',
        t('providerUnsupported', { provider: 'DeepL' })
      );
    }
    throw new TranslationError(
      'BAD_RESPONSE',
      t('providerServer', { provider: 'DeepL', status: response.status })
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new TranslationError('BAD_RESPONSE', t('providerBadResponse', { provider: 'DeepL' }));
  }

  if (data.error) {
    if (data.error.code === 1042911 || data.error.code === 1042912) {
      throw new TranslationError('RATE_LIMITED', t('providerRateLimited', { provider: 'DeepL' }));
    }
    throw new TranslationError('BAD_RESPONSE', t('providerFailed', { provider: 'DeepL' }));
  }

  const texts = data.result && Array.isArray(data.result.texts) ? data.result.texts : null;
  if (!texts || texts.length === 0) {
    throw new TranslationError('BAD_RESPONSE', t('providerEmpty', { provider: 'DeepL' }));
  }

  const translated = texts
    .map((item) => (item && typeof item.text === 'string' ? item.text : ''))
    .join('');

  if (text.trim() !== '' && translated.trim() === '') {
    throw new TranslationError('BAD_RESPONSE', t('providerEmpty', { provider: 'DeepL' }));
  }

  return {
    text: translated,
    detectedLang: normalizeDetectedLanguage(data.result.lang)
  };
}

async function requestMyMemory(text, targetLang) {
  const chunks = splitForMyMemory(text);
  if (!chunks) {
    throw new TranslationError('UNSUPPORTED_LANGUAGE', t('mymemoryTooLong'));
  }

  const translatedChunks = [];
  let detectedLang = '';

  for (const chunk of chunks) {
    const result = await requestMyMemoryChunk(chunk, targetLang);
    translatedChunks.push(result.text);
    if (!detectedLang && result.detectedLang) detectedLang = result.detectedLang;
  }

  const translated = translatedChunks.join(' ').trim();
  if (text.trim() !== '' && translated === '') {
    throw new TranslationError('BAD_RESPONSE', t('providerEmpty', { provider: 'MyMemory' }));
  }

  return { text: translated, detectedLang };
}

async function requestMyMemoryChunk(text, targetLang, forcedSourceLang) {
  const url = new URL(MYMEMORY_ENDPOINT);
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', `${forcedSourceLang || 'autodetect'}|${targetLang}`);

  const response = await fetchWithTimeout(url.toString(), { method: 'GET' });

  if (!response.ok) {
    if (response.status === 429 || response.status === 403) {
      throw rateLimitError(response, t('providerRateLimited', { provider: 'MyMemory' }));
    }
    if (response.status >= 500) {
      throw new TranslationError(
        'SERVER_ERROR',
        t('providerServer', { provider: 'MyMemory', status: response.status })
      );
    }
    throw new TranslationError(
      'BAD_RESPONSE',
      t('providerServer', { provider: 'MyMemory', status: response.status })
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new TranslationError('BAD_RESPONSE', t('providerBadResponse', { provider: 'MyMemory' }));
  }

  if (data.quotaFinished) {
    throw new TranslationError('RATE_LIMITED', t('mymemoryQuota'));
  }

  const status = Number(data.responseStatus);
  const details = typeof data.responseDetails === 'string' ? data.responseDetails : '';
  const translated = data.responseData && typeof data.responseData.translatedText === 'string'
    ? data.responseData.translatedText
    : '';

  if (/PLEASE SELECT TWO DISTINCT LANGUAGES/i.test(details) || /PLEASE SELECT TWO DISTINCT LANGUAGES/i.test(translated)) {
    return { text, detectedLang: '' };
  }

  if (status === 429 || status === 403 || /ALL AVAILABLE FREE TRANSLATIONS|QUOTA/i.test(details)) {
    throw new TranslationError('RATE_LIMITED', t('providerRateLimited', { provider: 'MyMemory' }));
  }

  if (status !== 200 || !translated) {
    throw new TranslationError('BAD_RESPONSE', t('providerFailed', { provider: 'MyMemory' }));
  }

  if (/^MYMEMORY WARNING/i.test(translated) || /INVALID (SOURCE )?LANGUAGE/i.test(translated)) {
    throw new TranslationError('UNSUPPORTED_LANGUAGE', t('providerUnsupported', { provider: 'MyMemory' }));
  }

  const decoded = decodeHtmlEntities(translated);
  const detectedLang = normalizeDetectedLanguage(data.responseData.detectedLanguage);

  if (
    !forcedSourceLang &&
    detectedLang &&
    detectedLang !== targetLang &&
    decoded.trim() === text.trim()
  ) {
    const retry = await requestMyMemoryChunk(text, targetLang, detectedLang);
    return { text: retry.text, detectedLang: retry.detectedLang || detectedLang };
  }

  return { text: decoded, detectedLang };
}

function splitForMyMemory(text) {
  if (text.length <= MYMEMORY_CHUNK_CHARS) return [text];

  const chunks = [];
  let rest = text;

  while (rest.length > MYMEMORY_CHUNK_CHARS) {
    if (chunks.length >= MYMEMORY_MAX_CHUNKS) return null;

    const window = rest.slice(0, MYMEMORY_CHUNK_CHARS);
    const breaks = [
      window.lastIndexOf('\n'),
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('; '),
      window.lastIndexOf(', '),
      window.lastIndexOf(' ')
    ];

    let cut = 0;
    for (const position of breaks) {
      if (position >= MYMEMORY_CHUNK_CHARS * 0.5 && position + 1 > cut) {
        cut = position + 1;
      }
    }

    if (cut === 0) cut = MYMEMORY_CHUNK_CHARS;

    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }

  if (rest) chunks.push(rest);
  return chunks;
}

function toDeepLTarget(language) {
  const variants = {
    'en': 'EN-US',
    'pt': 'PT-PT',
    'zh-CN': 'ZH-HANS',
    'zh-TW': 'ZH-HANT',
    'no': 'NB'
  };
  return variants[language] || language.split('-')[0].toUpperCase();
}

function normalizeDetectedLanguage(language) {
  if (typeof language !== 'string' || language === '') return '';
  const value = language.toLowerCase();
  if (value === 'nb' || value === 'nn') return 'no';
  if (value === 'zh' || value === 'zh-hans') return 'zh-CN';
  if (value === 'zh-hant') return 'zh-TW';
  return value;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store'
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new TranslationError('TIMEOUT', t('timeout'));
    }
    throw new TranslationError('NETWORK_ERROR', t('network'));
  } finally {
    clearTimeout(timeout);
  }
}

function rateLimitError(response, message) {
  const retryAfter = Number(response.headers.get('retry-after'));
  const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.min(retryAfter * 1000, MYMEMORY_COOLDOWN_MS)
    : 0;
  return new TranslationError('RATE_LIMITED', message, retryAfterMs);
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normalizeLanguage(language) {
  if (typeof language !== 'string') return '';
  const value = language.trim();
  return /^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(value) ? value : '';
}

function t(key, values) {
  return QT.t(currentUiLang, key, values);
}

function formatNumber(value) {
  return Number(value).toLocaleString(LOCALES[currentUiLang] || LOCALES.ru);
}

function describeError(error) {
  if (!error) return t('genericFail');

  if (error.name === 'AbortError') {
    return t('timeout');
  }

  const message = String(error.message || error);
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return t('network');
  }

  return message;
}
