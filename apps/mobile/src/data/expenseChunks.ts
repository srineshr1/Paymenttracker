/**
 * Shared chunked expense batch save (SMS bulk + screenshot multi-select).
 * Keeps progress labels and partial-failure behavior consistent.
 */

export const EXPENSE_CHUNK_SIZE = 80;

export type ChunkSaveResult = {
  created: number;
  skipped: number;
  failed: number;
};

export type SaveExpenseChunksResult = ChunkSaveResult & {
  /** True if a later chunk threw after earlier chunks committed. */
  partial: boolean;
  /** Error from the failed chunk, if any. */
  error?: Error;
};

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Save items in fixed-size chunks via the provided `saveChunk` (local or API).
 * On throw mid-loop, returns accumulated counts with `partial: true` and the error
 * so callers can report how many already saved.
 */
export async function saveExpenseChunks<T>(
  items: T[],
  saveChunk: (chunk: T[]) => Promise<ChunkSaveResult>,
  options: {
    chunkSize?: number;
    onProgress?: (status: string) => void;
    /** Yield to the JS event loop between chunks so the UI can paint. Default true. */
    yieldBetween?: boolean;
  } = {},
): Promise<SaveExpenseChunksResult> {
  const chunkSize = options.chunkSize ?? EXPENSE_CHUNK_SIZE;
  const yieldBetween = options.yieldBetween ?? true;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  if (!items.length) {
    return { created: 0, skipped: 0, failed: 0, partial: false };
  }

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    if (items.length > chunkSize) {
      const from = i + 1;
      const to = Math.min(i + chunkSize, items.length);
      options.onProgress?.(`Importing ${from}–${to} of ${items.length}…`);
    }
    try {
      const res = await saveChunk(chunk);
      created += res.created;
      skipped += res.skipped;
      failed += res.failed;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return {
        created,
        skipped,
        failed,
        partial: created > 0 || skipped > 0 || failed > 0 || i > 0,
        error,
      };
    }
    if (yieldBetween && i + chunkSize < items.length) {
      await yieldToUi();
    }
  }

  return { created, skipped, failed, partial: false };
}
