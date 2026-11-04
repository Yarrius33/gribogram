export type ProxySettings = {
  enabled: boolean;
  url: string;
  urls: string[];
};

export const PROXY_SETTINGS_KEY = 'tt_proxy_settings';
export const PROXY_SETTINGS_EVENT = 'gribogram-proxy-settings';
export const MAX_PROXY_COUNT = 20;
const ENV_PROXY_URL = process.env.PROXY_URL || '';

export function normalizeProxyAddress(value: string): string {
  const input = value.trim();
  const url = new URL(input.includes('://') ? input : `https://${input}`);
  if (!['https:', 'wss:'].includes(url.protocol) || url.username || url.password
    || url.search || url.hash || url.pathname !== '/' || !url.hostname) {
    throw new Error('Invalid WebSocket proxy address');
  }
  return url.host;
}

export function parseProxyList(value: string): string[] {
  const entries = value.split(/[\s,;]+/).filter(Boolean);
  if (!entries.length || entries.length > MAX_PROXY_COUNT) throw new Error('Invalid proxy count');
  return [...new Set(entries.map(normalizeProxyAddress))];
}

export function loadProxySettings(): ProxySettings {
  try {
    const raw = localStorage.getItem(PROXY_SETTINGS_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      const urls = Array.isArray(stored.urls) ? stored.urls : stored.url ? [stored.url] : [];
      const addresses = urls.length ? parseProxyList(urls.join('\n')) : [];
      return { enabled: stored.enabled === true, url: addresses[0] || '', urls: addresses };
    }
  } catch {
    // Corrupt or unavailable storage must not prevent login
  }
  let urls: string[] = [];
  try {
    urls = ENV_PROXY_URL ? parseProxyList(ENV_PROXY_URL) : [];
  } catch {
    // Ignore invalid deployment defaults
  }
  return { enabled: Boolean(urls.length), url: urls[0] || '', urls };
}

export function saveProxySettings(settings: ProxySettings) {
  localStorage.setItem(PROXY_SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(PROXY_SETTINGS_EVENT));
}
