/**
 * Display settings (theme, reduced motion, handwritten notes) follow the
 * account, but the browser keeps a copy in localStorage so they can be applied
 * before the first paint, without reading cookies in the root layout.
 */

export const THEME_KEY = "deepretain:theme";
export const MOTION_KEY = "deepretain:motion";
export const HANDWRITING_KEY = "deepretain:handwriting";

/** Runs in <head> before anything paints. Keep it tiny and dependency-free. */
export function themeScript(): string {
  return `(function(){try{var d=document.documentElement,s=window.localStorage,t=s.getItem("${THEME_KEY}");if(t==="light"||t==="dark")d.setAttribute("data-theme",t);if(s.getItem("${MOTION_KEY}")==="reduce")d.setAttribute("data-motion","reduce");if(s.getItem("${HANDWRITING_KEY}")==="off")d.setAttribute("data-handwriting","off")}catch(e){}})()`;
}

export interface DisplaySettings {
  theme: "system" | "light" | "dark";
  reduceMotion: boolean;
  handwriting: boolean;
}

/** Apply display settings to the page and remember them for the next first paint. */
export function applyDisplaySettings(root: HTMLElement, storage: Storage | null, s: DisplaySettings): void {
  if (s.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", s.theme);
  if (s.reduceMotion) root.setAttribute("data-motion", "reduce");
  else root.removeAttribute("data-motion");
  if (s.handwriting) root.removeAttribute("data-handwriting");
  else root.setAttribute("data-handwriting", "off");
  try {
    storage?.setItem(THEME_KEY, s.theme);
    storage?.setItem(MOTION_KEY, s.reduceMotion ? "reduce" : "normal");
    storage?.setItem(HANDWRITING_KEY, s.handwriting ? "on" : "off");
  } catch {
    // Private mode or storage disabled: the account copy still applies after load.
  }
}
