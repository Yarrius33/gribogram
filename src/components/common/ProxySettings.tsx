import { memo, useState } from '../../lib/teact/teact';

import { loadProxySettings, MAX_PROXY_COUNT, parseProxyList, saveProxySettings } from '../../util/proxySettings';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import InputText from '../ui/InputText';

import styles from './ProxySettings.module.scss';

const MAX_IMPORT_SIZE = 16384;
const IMPORT_TIMEOUT = 10000;

const ProxySettings = () => {
  const lang = useLang();
  const [saved] = useState(() => loadProxySettings());
  const [isEnabled, setIsEnabled] = useState(saved.enabled);
  const [addresses, setAddresses] = useState(saved.urls.join('\n'));
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = useLastCallback(() => {
    try {
      const urls = addresses.trim() ? parseProxyList(addresses) : [];
      if (isEnabled && !urls.length) throw new Error('Missing proxy');
      saveProxySettings({ enabled: isEnabled, url: urls[0] || '', urls });
      setIsSaved(true);
      setError(false);
    } catch {
      setError(true);
      setIsSaved(false);
    }
  });

  const handleImport = useLastCallback(async () => {
    if (isImporting) return;
    setIsImporting(true);
    setError(false);
    setIsSaved(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT);
    try {
      const url = new URL(importUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid URL');
      const response = await fetch(url, {
        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('Import failed');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Empty response');
      let text = '';
      let size = 0;
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_IMPORT_SIZE) throw new Error('Import too large');
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        await reader.cancel();
      }
      const urls = parseProxyList(text);
      setAddresses(urls.join('\n'));
    } catch {
      setError(true);
    } finally {
      clearTimeout(timeout);
      setIsImporting(false);
    }
  });

  return (
    <section className={styles.root} aria-label={lang('GriboProxyTitle')}>
      <h3 className={styles.title}>{lang('GriboProxyTitle')}</h3>
      <p className={styles.hint}>{lang('GriboProxyHint', { count: MAX_PROXY_COUNT })}</p>
      <Checkbox
        label={lang('GriboProxyEnable')}
        checked={isEnabled}
        onChange={(event) => {
          setIsEnabled(event.target.checked);
          setIsSaved(false);
        }}
      />
      <label className={styles.label} htmlFor="gribo-proxy-addresses">{lang('GriboProxyAddresses')}</label>
      <textarea
        id="gribo-proxy-addresses"
        className={styles.addresses}
        value={addresses}
        rows={3}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
          setAddresses(event.target.value);
          setIsSaved(false);
        }}
      />
      <InputText
        label={lang('GriboProxyImportUrl')}
        value={importUrl}
        onChange={(event) => {
          setImportUrl(event.target.value);
          setIsSaved(false);
        }}
      />
      <div className={styles.buttons}>
        <Button
          className={styles.actionButton}
          isText
          disabled={!importUrl || isImporting}
          isLoading={isImporting}
          onClick={handleImport}
        >
          {lang('GriboProxyImport')}
        </Button>
        <Button className={styles.actionButton} onClick={handleSave} disabled={isImporting}>{lang('Save')}</Button>
      </div>
      <p className={styles.hint} role="status">
        {error ? lang('GriboProxyError') : isSaved ? lang('GriboProxySaved') : lang('GriboProxyImportHint')}
      </p>
    </section>
  );
};

export default memo(ProxySettings);
