import type { Word } from "./types";
import { isClozeEligible } from "./import";
/** Home counts distinct words due in either available exercise, rather than only translation. */
export function wordIsDue(word: Word, now: number): boolean {
  return (
    (word.schedules.translation.dueAt !== null &&
      word.schedules.translation.dueAt <= now) ||
    (isClozeEligible(word) &&
      word.schedules.cloze.dueAt !== null &&
      word.schedules.cloze.dueAt <= now)
  );
}
export function wordIsNew(word: Word): boolean {
  return (
    word.schedules.translation.attempts === 0 &&
    word.schedules.cloze.attempts === 0
  );
}
