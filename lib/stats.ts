/**
 * Study statistics. Pure functions over review logs and cards, so every
 * number on the Stats tab can be tested without a database.
 */
import { addDays } from "@/lib/timezone";

/**
 * Current and longest run of consecutive study days. Today counts if you've
 * studied; if not, the current streak is still alive from yesterday.
 */
export function streaks(studyDays: Set<string>, todayKey: string): { current: number; longest: number } {
  let current = 0;
  for (let d = studyDays.has(todayKey) ? 0 : 1; studyDays.has(addDays(todayKey, -d)); d++) current++;

  let longest = 0;
  for (const day of studyDays) {
    if (studyDays.has(addDays(day, -1))) continue; // not the start of a run
    let run = 1;
    while (studyDays.has(addDays(day, run))) run++;
    longest = Math.max(longest, run);
  }
  return { current, longest: Math.max(longest, current) };
}
