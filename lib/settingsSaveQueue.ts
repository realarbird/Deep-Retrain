import type { Settings, SettingsPatch } from "@/lib/settingsSchema";

function mergePatch(older: SettingsPatch, newer: SettingsPatch): SettingsPatch {
  return { ...older, ...newer, ...(older.speech || newer.speech ? { speech: { ...older.speech, ...newer.speech } } : {}) };
}

/** One save at a time; failed patches stay queued underneath any newer edits. */
export class SettingsSaveQueue {
  private pending: SettingsPatch = {};
  private active: SettingsPatch | null = null;
  private saveRequested = false;

  get dirty(): boolean {
    return this.active !== null || Object.keys(this.pending).length > 0;
  }

  enqueue(patch: SettingsPatch): void {
    this.pending = mergePatch(this.pending, patch);
  }

  begin(): SettingsPatch | null {
    if (this.active) {
      this.saveRequested = true;
      return null;
    }
    if (!Object.keys(this.pending).length) return null;
    this.active = this.pending;
    this.pending = {};
    this.saveRequested = false;
    return this.active;
  }

  /** Snapshot the edits that must remain visible over a successful response. */
  overlay(settings: Settings): Settings {
    return { ...settings, ...this.pending, speech: { ...settings.speech, ...this.pending.speech } };
  }

  /** Only repeat immediately if another save was requested while this one ran. */
  finish(succeeded: boolean): boolean {
    if (!succeeded && this.active) this.pending = mergePatch(this.active, this.pending);
    this.active = null;
    const again = this.saveRequested && this.dirty;
    this.saveRequested = false;
    return again;
  }
}
