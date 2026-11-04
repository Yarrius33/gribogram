export type LocalAiTask = 'proofread' | 'business' | 'friendly' | 'ironic';

export const MAX_LOCAL_AI_LENGTH = 8000;
const TASK_INSTRUCTIONS: Record<LocalAiTask, string> = {
  proofread: 'Correct spelling, grammar and punctuation. Improve clarity without changing the meaning.',
  business: 'Rewrite in a professional business tone. Preserve all facts and the original meaning.',
  friendly: 'Rewrite in a warm, friendly tone. Preserve all facts and the original meaning.',
  ironic: 'Rewrite in a lightly ironic tone. Preserve all facts and the original meaning.',
};

export async function rewriteLocally(text: string, task: LocalAiTask, signal: AbortSignal) {
  if (!text.trim() || text.length > MAX_LOCAL_AI_LENGTH) throw new Error('Invalid input length');
  if (typeof LanguageModel === 'undefined') throw new Error('Local AI unavailable');
  if (await LanguageModel.availability() === 'unavailable') throw new Error('Local AI unavailable');
  signal.throwIfAborted();
  const model = await LanguageModel.create({
    signal,
    initialPrompts: [{
      role: 'system',
      content: `${TASK_INSTRUCTIONS[task]} Keep the original language. Return only the rewritten text.`,
    }],
  });
  try {
    signal.throwIfAborted();
    const result = await model.prompt(text, { signal });
    signal.throwIfAborted();
    if (!result.trim()) throw new Error('Empty model response');
    return result;
  } finally {
    model.destroy();
  }
}
