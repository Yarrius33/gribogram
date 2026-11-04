import { normalizeProxyAddress } from '../../../util/proxySettings';

let isEnabled = false;
let domains: string[] = [];
let activeIndex = 0;

export function configureProxy(enabled: boolean, urls: string[]) {
  domains = [...new Set(urls.map(normalizeProxyAddress))];
  isEnabled = enabled;
  activeIndex = 0;
}

export function getProxyDomain() {
  return isEnabled ? domains[activeIndex] : undefined;
}

export function advanceProxy(failedDomain: string) {
  if (domains[activeIndex] === failedDomain && domains.length > 1) {
    activeIndex = (activeIndex + 1) % domains.length;
  }
}
