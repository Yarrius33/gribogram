import { memo, useEffect, useState } from '../../lib/teact/teact';
import { getActions, getGlobal, setGlobal, withGlobal } from '../../global';

import type { ArchivedMessage } from '../../util/deletedMessageArchive';

import { getMediaFilename } from '../../global/helpers/messageMedia';
import { deleteChatMessages } from '../../global/reducers';
import { tryParseDeepLink } from '../../util/deepLinkParser';
import {
  ARCHIVE_UPDATED_EVENT, clearDeletedArchive, getArchivedMedia, isDeletedArchiveEnabled,
  listArchivedMessages, setDeletedArchiveEnabled,
} from '../../util/deletedMessageArchive';
import download from '../../util/download';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import InputText from '../ui/InputText';
import MenuItem from '../ui/MenuItem';
import Modal from '../ui/Modal';

import styles from './DeletedMessagesSettings.module.scss';

type OwnProps = { isShortcut?: boolean };
type StateProps = { userId?: string };

const DeletedMessagesSettings = ({ userId, isShortcut }: OwnProps & StateProps) => {
  const lang = useLang();
  const { openChat, showNotification, openChatByUsername } = getActions();
  const [isOpen, setIsOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(() => Boolean(userId && isDeletedArchiveEnabled(userId)));
  const [records, setRecords] = useState<ArchivedMessage[]>([]);
  const [username, setUsername] = useState('');

  const refresh = useLastCallback(async () => {
    if (!userId) return;
    try {
      const archived = await listArchivedMessages(userId);
      const global = getGlobal();
      if (global.currentUserId !== userId) return;
      setRecords(archived);
      setIsEnabled(isDeletedArchiveEnabled(userId));
    } catch {
      showNotification({ message: { key: 'GriboArchiveSaveError' } });
    }
  });

  useEffect(() => {
    void refresh();
    window.addEventListener(ARCHIVE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(ARCHIVE_UPDATED_EVENT, refresh);
  }, [refresh, userId]);

  const handleClear = useLastCallback(async () => {
    if (!userId) return;
    try {
      await clearDeletedArchive(userId);
      let global = getGlobal();
      if (global.currentUserId !== userId) return;
      for (const [chatId, store] of Object.entries(global.messages.byChatId)) {
        const ids = Object.values(store.byId).filter((message) => message.localDeletedAt).map(({ id }) => id);
        global = deleteChatMessages(global, chatId, ids);
      }
      setGlobal(global);
    } catch {
      showNotification({ message: { key: 'GriboArchiveSaveError' } });
    }
  });

  const handleDownload = useLastCallback(async (record: ArchivedMessage) => {
    if (!userId) return;
    const { content } = record.message;
    const media = content.document || content.video || content.audio
      || content.voice || content.photo || content.sticker;
    for (const { hash } of record.media.filter((item) => !item.isPreview).slice(0, 1)) {
      const blob = await getArchivedMedia(userId, hash);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      download(url, media ? getMediaFilename(media) : `message-${record.message.id}.jpg`);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  });

  const handlePreview = useLastCallback(() => {
    const input = username.trim().replace(/^@/, '');
    const url = input.includes('/')
      ? (/^https?:\/\//i.test(input) ? input : `https://${input}`) : `https://t.me/${input}`;
    const parsed = tryParseDeepLink(url.replace('/s/', '/'));
    if (parsed?.type !== 'publicUsernameOrBotLink' && parsed?.type !== 'publicMessageLink') {
      showNotification({ message: { key: 'GriboPublicChannelInvalid' } });
      return;
    }
    openChatByUsername({
      username: parsed.username,
      messageId: parsed.type === 'publicMessageLink' ? parsed.messageId : undefined,
    });
  });

  return (
    <>
      {isShortcut ? (
        <MenuItem icon="delete" onClick={() => setIsOpen(true)}>{lang('GriboArchiveTitle')}</MenuItem>
      ) : (
        <section className={styles.root}>
          <h3 className={styles.title}>{lang('GriboArchiveTitle')}</h3>
          <p className={styles.hint}>{lang('GriboArchiveHint')}</p>
          <Checkbox
            label={lang('GriboArchiveEnable')}
            checked={isEnabled}
            onChange={(event) => {
              if (!userId) return;
              try {
                setDeletedArchiveEnabled(userId, event.target.checked);
                setIsEnabled(event.target.checked);
              } catch {
                showNotification({ message: { key: 'GriboArchiveSaveError' } });
              }
            }}
          />
          <Button isText onClick={() => setIsOpen(true)}>{lang('GriboArchiveOpen')}</Button>
          <InputText
            label={lang('GriboPublicChannel')}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Button isText onClick={handlePreview}>{lang('GriboPublicChannelOpen')}</Button>
        </section>
      )}
      <Modal title={lang('GriboArchiveTitle')} isOpen={isOpen} onClose={() => setIsOpen(false)} hasCloseButton>
        <p className={styles.hint}>{lang('GriboArchiveHint')}</p>
        {records.length ? records.map((record) => (
          <article className={styles.record} key={`${record.message.chatId}:${record.message.id}`}>
            <Button
              isText
              onClick={() => {
                setIsOpen(false);
                openChat({ id: record.message.chatId });
              }}
            >
              {record.chatTitle}
            </Button>
            <p className={styles.text}>{record.message.content.text?.text || lang('GriboArchiveMediaOnly')}</p>
            <p className={styles.hint}>
              {new Date(record.message.date * 1000).toLocaleString(lang.code)}
              {' · '}
              {lang('GriboDeletedLabel')}
              {' '}
              {new Date(record.deletedAt).toLocaleString(lang.code)}
            </p>
            {record.media.length > 0 && record.media.every((media) => media.isPreview) && (
              <p className={styles.hint}>{lang('GriboArchivePreviewOnly')}</p>
            )}
            {record.media.some((media) => !media.isPreview) && (
              <Button isText onClick={() => handleDownload(record)}>{lang('GriboArchiveDownload')}</Button>
            )}
          </article>
        )) : <p>{lang('GriboArchiveEmpty')}</p>}
        <Button color="danger" onClick={handleClear}>{lang('GriboArchiveClear')}</Button>
      </Modal>
    </>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): Complete<StateProps> => ({ userId: global.currentUserId }),
)(DeletedMessagesSettings));
