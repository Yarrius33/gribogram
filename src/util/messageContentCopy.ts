import type { ApiMessage } from '../api/types';
import type { SendMessageParams } from '../types';
import { ApiMediaFormat } from '../api/types';

import { getMediaFilename, getMediaHash } from '../global/helpers/messageMedia';
import { canCopyMessageAsNew } from '../global/helpers/messages';
import { fetchBlob } from './files';
import * as mediaLoader from './mediaLoader';

export async function prepareMessageContentCopy(message: ApiMessage, noCaptions?: boolean): Promise<SendMessageParams> {
  if (!canCopyMessageAsNew(message)) throw new Error('Unsupported content');
  const { content } = message;
  const media = content.photo || content.video || content.document || content.audio || content.voice || content.sticker;
  const caption = !media || !noCaptions ? content.text : undefined;
  const params: SendMessageParams = { text: caption?.text, entities: caption?.entities, contact: content.contact };
  if (!media) return params;
  const hash = getMediaHash(media, media.mediaType === 'photo' ? 'full' : 'download');
  if (!hash) throw new Error('Media unavailable');
  const blobUrl = await mediaLoader.fetch(hash, ApiMediaFormat.BlobUrl);
  if (!blobUrl) throw new Error('Media unavailable');
  const blob = await fetchBlob(blobUrl);
  if (!blob.size) throw new Error('Empty media');
  const dimensions = media.mediaType === 'photo'
    ? media.sizes.reduce((largest, size) => size.width > largest.width ? size : largest, { width: 0, height: 0 })
    : content.video;
  params.attachment = {
    blob, blobUrl, filename: getMediaFilename(media), size: blob.size,
    mimeType: blob.type || (media.mediaType === 'voice' ? 'audio/ogg' : 'application/octet-stream'),
    shouldSendAsFile: media.mediaType === 'document' || media.mediaType === 'sticker' ? true : undefined,
    quick: dimensions ? { width: dimensions.width || 0, height: dimensions.height || 0,
      duration: content.video?.duration, isRound: content.video?.isRound, isGif: content.video?.isGif } : undefined,
    voice: content.voice ? { duration: content.voice.duration, waveform: content.voice.waveform || [] } : undefined,
    audio: content.audio ? { duration: content.audio.duration,
      title: content.audio.title, performer: content.audio.performer } : undefined,
    shouldSendAsSpoiler: content.photo?.isSpoiler || content.video?.isSpoiler ? true : undefined,
  };
  return params;
}
