import { destroyDecoy, getDecoy } from "./decoy.js";

export { destroyDecoy } from "./decoy.js";

export interface HandoverOptions {
  /**
   * If the real field is empty, copy whatever the user typed into the decoy
   * and dispatch an `input` event so frameworks notice. Existing values are
   * never overwritten. Defaults to `true`.
   */
  carryValue?: boolean;
  /**
   * Passed straight to `focus()`. Useful when the real field is off-screen and
   * you are animating it into place yourself.
   */
  preventScroll?: boolean;
}

export interface HandoverWhenOptions extends HandoverOptions {
  /**
   * How long to wait for the element before giving up and dismissing the
   * keyboard. Defaults to 5000ms.
   */
  timeout?: number;
  /** Where to watch for the element. Defaults to `document.body`. */
  root?: ParentNode;
}

export interface KeyboardSession {
  /** False once the session has handed over, been cancelled, or superseded. */
  readonly active: boolean;
  /**
   * Move the keyboard to the real field. Returns true only when focus actually
   * reaches the target.
   */
  handover(target: HTMLElement, options?: HandoverOptions): boolean;
  /**
   * Wait for the field to exist, then hand over. Selector targets are checked
   * after DOM mutations; getter targets are also polled once per frame.
   * Resolves to false if the session died or the timeout elapsed first.
   */
  handoverWhen(
    target: string | (() => HTMLElement | null | undefined),
    options?: HandoverWhenOptions,
  ): Promise<boolean>;
  /** Give up and dismiss the keyboard. */
  cancel(): void;
}

/** Only one session can hold the keyboard; a newer one supersedes the older. */
let endCurrentSession: (() => void) | null = null;

const DEAD_SESSION: KeyboardSession = {
  active: false,
  handover: () => false,
  handoverWhen: () => Promise.resolve(false),
  cancel: () => {},
};

function resolveTarget(
  target: string | (() => HTMLElement | null | undefined),
  root: ParentNode,
): HTMLElement | null {
  if (typeof target === "function") return target() ?? null;
  return root.querySelector<HTMLElement>(target);
}

function hasFocus(element: HTMLElement): boolean {
  const root = element.getRootNode();
  return "activeElement" in root &&
    (root as Document | ShadowRoot).activeElement === element;
}

function carryValueOver(typed: string, target: HTMLElement): void {
  if (!typed) return;

  // Avoid instanceof: a target can come from an iframe and therefore belong
  // to a different JavaScript realm.
  const isTextField = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
  if (!isTextField) return;

  const textField = target as HTMLInputElement | HTMLTextAreaElement;
  if (textField.value) return;
  // React installs an own `value` setter that updates its value tracker. Using
  // the native prototype setter changes the DOM without pre-emptively telling
  // React about it, so the input event below is observed as a real change.
  const prototype = textField.tagName === "INPUT"
    ? textField.ownerDocument.defaultView?.HTMLInputElement.prototype
    : textField.ownerDocument.defaultView?.HTMLTextAreaElement.prototype;
  const nativeSetter = prototype &&
    Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (nativeSetter) nativeSetter.call(textField, typed);
  else textField.value = typed;

  const EventConstructor = textField.ownerDocument.defaultView?.Event ?? Event;
  textField.dispatchEvent(new EventConstructor("input", { bubbles: true }));
}

/**
 * Opens the on-screen keyboard, before the field that will receive it exists.
 *
 * MUST be called synchronously inside the event handler for a real user
 * gesture — as the first statement, ideally. iOS grants the page a transient
 * activation for the tap, and a focus() outside it is silently ignored: the
 * element takes focus and no keyboard appears. There is no grace period; even
 * deferring by a single `requestAnimationFrame` is too late.
 *
 * ```ts
 * button.addEventListener("click", () => {
 *   const session = primeKeyboard();
 *   openSearchModal();
 *   session.handoverWhen("#search-input");
 * });
 * ```
 */
export function primeKeyboard(): KeyboardSession {
  const candidate = getDecoy();
  if (!candidate) return DEAD_SESSION;
  const decoy: HTMLInputElement = candidate;

  // Supersede any previous session and settle its pending waits immediately.
  endCurrentSession?.();

  let active = true;
  let handingOver = false;
  const endListeners = new Set<() => void>();

  function end() {
    if (!active) return;
    active = false;
    decoy.removeEventListener("blur", handleUnexpectedBlur);
    if (endCurrentSession === end) endCurrentSession = null;
    for (const listener of endListeners) listener();
    endListeners.clear();
  }

  function handleUnexpectedBlur() {
    // A successful handover necessarily blurs the decoy while focus() is in
    // progress. Any other blur means the keyboard continuity was broken.
    if (!handingOver) end();
  }

  endCurrentSession = end;
  decoy.addEventListener("blur", handleUnexpectedBlur);

  decoy.value = "";
  decoy.focus();
  if (!hasFocus(decoy)) {
    end();
    return DEAD_SESSION;
  }

  const session: KeyboardSession = {
    get active() {
      return active;
    },

    handover(target, options = {}) {
      if (!active || !target) return false;

      const { carryValue = true, preventScroll } = options;
      const typed = decoy.value;

      // Moving focus from one text field to another keeps the keyboard up.
      // Blurring to nothing in between would dismiss it, so never blur first.
      handingOver = true;
      try {
        target.focus({ preventScroll });
      } finally {
        handingOver = false;
      }

      if (!hasFocus(target)) {
        // A no-op focus leaves the decoy available for a corrected retry. If
        // focus went somewhere else, continuity is already gone.
        if (!hasFocus(decoy)) end();
        return false;
      }

      if (carryValue) carryValueOver(typed, target);
      decoy.value = "";
      const stillFocused = hasFocus(target);
      end();

      return stillFocused;
    },

    handoverWhen(target, options = {}) {
      if (!active) return Promise.resolve(false);

      const { timeout = 5000, root = document.body, ...handoverOptions } =
        options;

      const immediate = resolveTarget(target, root);
      if (immediate) {
        const result = session.handover(immediate, handoverOptions);
        if (!result) session.cancel();
        return Promise.resolve(result);
      }

      return new Promise<boolean>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let frame: number | undefined;
        let settled = false;

        const observer = new MutationObserver(check);

        function check() {
          if (!active) return finish(false);
          const found = resolveTarget(target, root);
          if (!found) return;

          // Remove the end listener first: handover() ends the session on
          // success, which must not race this promise into resolving false.
          endListeners.delete(onSessionEnd);
          const result = session.handover(found, handoverOptions);
          finish(result, !result);
        }

        function pollGetter() {
          check();
          if (!settled) frame = requestAnimationFrame(pollGetter);
        }

        function onSessionEnd() {
          finish(false);
        }

        function finish(result: boolean, cancel = false) {
          if (settled) return;
          settled = true;
          observer.disconnect();
          if (timer !== undefined) clearTimeout(timer);
          if (frame !== undefined) cancelAnimationFrame(frame);
          endListeners.delete(onSessionEnd);
          if (cancel) session.cancel();
          resolve(result);
        }

        endListeners.add(onSessionEnd);
        timer = setTimeout(() => finish(false, true), timeout);
        observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: typeof target === "string",
        });
        if (typeof target === "function") {
          frame = requestAnimationFrame(pollGetter);
        }
      });
    },

    cancel() {
      if (!active) return;

      decoy.value = "";
      decoy.blur();
      end();
    },
  };

  return session;
}

/**
 * Whether this browser is one that refuses programmatic focus outside a user
 * gesture — iOS Safari and every other browser on iOS, which all use WebKit.
 *
 * You do not need this to use the library: priming is harmless everywhere. It
 * is exported for the cases where you want to skip the dance on desktop.
 */
export function needsKeyboardPriming(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports itself as a Mac, and is only distinguishable by having
  // a touch screen.
  const isIPadOS = ua.includes("Macintosh") && navigator.maxTouchPoints > 1;

  return isIOS || isIPadOS;
}
