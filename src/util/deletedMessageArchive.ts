import { createStore, del, delMany, get, getMany, keys, set, setMany } from 'idb-keyval';

import type { ApiMessage } from '../api/types';

import { MEDIA_CACHE_NAME } from '../config';
import { isChannelId } from './entities/ids';
import * as cacheApi from './cacheApi';

export type ArchivedMessage = {
  message: ApiMessage;
  chatTitle: string;
  deletedAt: number;
  media: { hash: string; size: number; isPreview?: boolean }[];
};

export const ARCHIVE_UPDATED_EVENT = 'gribogram-archive-updated';
const MAX_ARCHIVE_MESSAGES = 1000;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const recordsStore = createStore('gribogram-deleted-messages', 'entries');
const seenStore = createStore('gribogram-received-messages', 'entries');
const MAX_SEEN_MESSAGES = 5000;
const mediaStore = createStore('gribogram-deleted-media', 'entries');
let pending = Promise.resolve();
const archiveChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('gribogram-archive-events') : undefined;
archiveChannel?.addEventListener('message', () => window.dispatchEvent(new Event(ARCHIVE_UPDATED_EVENT)));

function normalizeArchiveMediaHash(hash: string) {
  const url = new URL(hash, location.href);
  url.searchParams.delete('download');
  url.searchParams.delete('fileSize');
  url.searchParams.delete('mimeType');
  return url.href;
}

function getPrefix(userId: string) {
  return `${userId}/`;
}

function cloneReceivedMessage(message: ApiMessage) {
  const snapshot = structuredClone(message);
  if (snapshot.content.photo) snapshot.content.photo.blobUrl = undefined;
  if (snapshot.content.video) {
    snapshot.content.video.blobUrl = undefined;
    snapshot.content.video.previewBlobUrl = undefined;
  }
  if (snapshot.content.document) snapshot.content.document.previewBlobUrl = undefined;
  return snapshot;
}

function getRecordKey(userId: string, message: ApiMessage) {
  return `${getPrefix(userId)}${message.chatId}/${message.id}`;
}

export function isDeletedArchiveEnabled(userId: string) {
  try {
    return localStorage.getItem(`gribogram-archive-enabled-${userId}`) !== 'false';
  } catch {
    return false;
  }
}

export function setDeletedArchiveEnabled(userId: string, enabled: boolean) {
  localStorage.setItem(`gribogram-archive-enabled-${userId}`, String(enabled));
  notifyArchiveUpdated();
}

function notifyArchiveUpdated() {
  window.dispatchEvent(new Event(ARCHIVE_UPDATED_EVENT));
  archiveChannel?.postMessage('updated');
}

export async function listArchivedMessages(userId: string, chatId?: string) {
  await pending;
  const prefix = chatId ? `${getPrefix(userId)}${chatId}/` : getPrefix(userId);
  const matchingKeys = (await keys(recordsStore)).filter((key) => typeof key === 'string' && key.startsWith(prefix));
  return (await getMany<ArchivedMessage>(matchingKeys, recordsStore)).filter(Boolean)
    .sort((first, second) => second.deletedAt - first.deletedAt);
}

export function archiveDeletedMessage(userId: string, message: ApiMessage, chatTitle: string, mediaHashes: string[]) {
  const snapshot = cloneReceivedMessage(message);
  const key = getRecordKey(userId, message);
  const operation = pending.then(async () => {
    if (await get(key, recordsStore)) return;
    const deletedAt = Date.now();
    snapshot.isDeleting = undefined;
    snapshot.localDeletedAt = deletedAt;
    const record: ArchivedMessage = { message: snapshot, chatTitle, deletedAt, media: [] };
    await set(key, record, recordsStore);
    for (const hash of new Set(mediaHashes)) {
      let blob = await cacheApi.fetch(MEDIA_CACHE_NAME, hash, cacheApi.Type.Blob);
      const localUrl = message.content.photo?.blobUrl || message.content.video?.blobUrl;
      if (!blob && localUrl?.startsWith('blob:') && !hash.includes('size=')) {
        blob = await fetch(localUrl).then((response) => response.blob()).catch(() => undefined);
      }
      if (!(blob instanceof Blob) || blob.size > MAX_ARCHIVE_BYTES) continue;
      const archivedHash = normalizeArchiveMediaHash(hash);
      if (record.media.some((media) => media.hash === archivedHash)) continue;
      await set(`${getPrefix(userId)}${archivedHash}`, blob, mediaStore);
      record.media.push({
        hash: archivedHash, size: blob.size, isPreview: new URL(hash, location.href).searchParams.has('size'),
      });
    }
    await set(key, record, recordsStore);
    await pruneArchive(userId);
  });
  pending = operation.catch(() => undefined).then(notifyArchiveUpdated);
  return operation;
}

async function pruneArchive(userId: string) {
  const prefix = getPrefix(userId);
  const matchingKeys = (await keys(recordsStore)).filter((key) => typeof key === 'string' && key.startsWith(prefix));
  const records = (await getMany<ArchivedMessage>(matchingKeys, recordsStore)).filter(Boolean)
    .sort((first, second) => second.deletedAt - first.deletedAt);
  let size = 0;
  const retainedHashes = new Set<string>();
  for (const [index, record] of records.entries()) {
    const extraSize = record.media.reduce((total, item) => (
      total + (retainedHashes.has(`${prefix}${item.hash}`) ? 0 : item.size)
    ), 0);
    if (index >= MAX_ARCHIVE_MESSAGES || size + extraSize > MAX_ARCHIVE_BYTES) {
      await del(getRecordKey(userId, record.message), recordsStore);
      continue;
    }
    size += extraSize;
    record.media.forEach(({ hash }) => retainedHashes.add(`${prefix}${hash}`));
  }
  const orphanKeys = (await keys(mediaStore))
    .filter((key) => typeof key === 'string' && key.startsWith(prefix) && !retainedHashes.has(key));
  await delMany(orphanKeys, mediaStore);
}

export async function getArchivedMedia(userId: string, hash: string) {
  await pending;
  return get<Blob>(`${getPrefix(userId)}${normalizeArchiveMediaHash(hash)}`, mediaStore);
}

export function clearDeletedArchive(userId: string) {
  const operation = pending.then(async () => {
    const prefix = getPrefix(userId);
    for (const store of [recordsStore, mediaStore, seenStore]) {
      const matchingKeys = (await keys(store)).filter((key) => typeof key === 'string' && key.startsWith(prefix));
      await delMany(matchingKeys, store);
    }
  });
  pending = operation.catch(() => undefined).then(notifyArchiveUpdated);
  return operation;
}

export function rememberReceivedMessages(userId: string, messages: ApiMessage[]) {
  if (!isDeletedArchiveEnabled(userId)) return Promise.resolve();
  const snapshots = messages.filter((message) => !message.localDeletedAt && Number.isInteger(message.id)
    && message.content.ttlSeconds === undefined && !message.content.paidMedia && !message.content.action)
    .map((message): [string, ApiMessage] => [getRecordKey(userId, message), cloneReceivedMessage(message)]);
  const operation = pending.then(async () => {
    await setMany(snapshots, seenStore);
    const prefix = getPrefix(userId);
    const allKeys = (await keys(seenStore)).filter((key) => typeof key === 'string' && key.startsWith(prefix));
    if (allKeys.length <= MAX_SEEN_MESSAGES) return;
    const records = (await getMany<ApiMessage>(allKeys, seenStore)).filter(Boolean)
      .sort((first, second) => second.date - first.date);
    await delMany(records.slice(MAX_SEEN_MESSAGES).map((message) => getRecordKey(userId, message)), seenStore);
  });
  pending = operation.catch(() => undefined);
  return operation;
}

export async function findReceivedMessages(userId: string, chatId: string | undefined, ids: number[]) {
  await pending;
  if (chatId) {
    const messageKeys = ids.map((id) => `${userId}/${chatId}/${id}`);
    return (await getMany<ApiMessage>(messageKeys, seenStore)).filter(Boolean);
  }
  const prefix = getPrefix(userId);
  const wanted = new Set(ids);
  const matchingKeys = (await keys(seenStore)).filter((key) => typeof key === 'string' && key.startsWith(prefix));
  return (await getMany<ApiMessage>(matchingKeys, seenStore)).filter((message) => (
    message && wanted.has(message.id) && !isChannelId(message.chatId)
  ));
}

export function selectArchivedMessageWindow(
  messages: ApiMessage[], serverIds: number[], offsetId: number | undefined,
  direction: 'backwards' | 'forwards' | 'around', limit: number,
) {
  const lowerBound = direction === 'forwards' && offsetId ? offsetId
    : serverIds.length < limit ? -Infinity : Math.min(...serverIds);
  const upperBound = direction === 'backwards' && offsetId ? offsetId
    : !offsetId || !serverIds.length ? Infinity : Math.max(...serverIds);
  const liveIds = new Set(serverIds);
  const matching = messages.filter((message) => !liveIds.has(message.id)
    && message.id >= lowerBound && message.id <= upperBound)
    .sort((first, second) => first.id - second.id);
  return direction === 'forwards' ? matching.slice(0, limit) : matching.slice(-limit);
}
