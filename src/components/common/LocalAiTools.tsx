import { memo, useEffect, useRef, useState } from '../../lib/teact/teact';

import type { LocalAiTask } from '../../util/localAi';
import type { Signal } from '../../util/signals';

import { MAX_LOCAL_AI_LENGTH, rewriteLocally } from '../../util/localAi';
import parseHtmlAsFormattedText from '../../util/parseHtmlAsFormattedText';
import { getTextWithEntitiesAsHtml } from './helpers/renderTextWithEntities';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Button from '../ui/Button';
import Modal from '../ui/Modal';

import styles from './LocalAiTools.module.scss';

type OwnProps = {
  getHtml: Signal<string>;
  onUpdate: (html: string) => void;
};

const LocalAiTools = ({ getHtml, onUpdate }: OwnProps) => {
  const lang = useLang();
  const [isOpen, setIsOpen] = useState(false);
  const [task, setTask] = useState<LocalAiTask>('proofread');
  const [originalHtml, setOriginalHtml] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const controllerRef = useRef<AbortController>();

  const handleClose = useLastCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = undefined;
    setIsLoading(false);
    setIsOpen(false);
  });

  useEffect(() => () => controllerRef.current?.abort(), []);

  const handleOpen = useLastCallback(() => {
    const html = getHtml();
    setOriginalHtml(html);
    setText(parseHtmlAsFormattedText(html).text);
    setResult('');
    setHasError(false);
    setIsOpen(true);
  });

  const handleGenerate = useLastCallback(async () => {
    if (isLoading) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setHasError(false);
    setResult('');
    try {
      const output = await rewriteLocally(text, task, controller.signal);
      if (!controller.signal.aborted) setResult(output);
    } catch {
      if (!controller.signal.aborted) setHasError(true);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  });

  const handleApply = useLastCallback(() => {
    if (getHtml() !== originalHtml) {
      setHasError(true);
      return;
    }
    onUpdate(getTextWithEntitiesAsHtml({ text: result }));
    handleClose();
  });

  return (
    <>
      <Button isText size="tiny" onClick={handleOpen} ariaLabel={lang('GriboLocalAiTitle')}>
        {lang('GriboLocalAiButton')}
      </Button>
      <Modal isOpen={isOpen} onClose={handleClose} title={lang('GriboLocalAiTitle')} hasCloseButton>
        <p className={styles.notice}>{lang('GriboLocalAiNotice')}</p>
        <label className={styles.label} htmlFor="gribo-local-ai-task">{lang('GriboLocalAiTask')}</label>
        <select
          id="gribo-local-ai-task"
          className={styles.select}
          value={task}
          disabled={isLoading}
          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
            setTask(event.target.value as LocalAiTask);
            setResult('');
          }}
        >
          <option value="proofread">{lang('GriboAiProofread')}</option>
          <option value="business">{lang('GriboAiBusiness')}</option>
          <option value="friendly">{lang('GriboAiFriendly')}</option>
          <option value="ironic">{lang('GriboAiIronic')}</option>
        </select>
        <p className={styles.preview}>{text}</p>
        <Button onClick={handleGenerate} isLoading={isLoading} disabled={!text || text.length > MAX_LOCAL_AI_LENGTH}>
          {lang('GriboLocalAiGenerate')}
        </Button>
        {hasError && <p role="alert" className={styles.notice}>{lang('GriboLocalAiError')}</p>}
        {result && (
          <>
            <p className={styles.preview}>{result}</p>
            <Button onClick={handleApply}>{lang('GriboLocalAiApply')}</Button>
          </>
        )}
      </Modal>
    </>
  );
};

export default memo(LocalAiTools);
