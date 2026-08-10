import { destroyDecoy, getDecoy } from "./decoy.js";

export { destroyDecoy } from "./decoy.js";

export interface HandoverOptions {
  /**
   * Copy whatever the user typed into the decoy over to the real field, and
   * dispatch an `input` event so frameworks notice. Defaults to `true`.
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
   * Move the keyboard to the real field. Returns false if the session is no
   * longer active, in which case nothing is focused.
   */
  handover(target: HTMLElement, options?: HandoverOptions): boolean;
  /**
   * Wait for the field to exist, then hand over. Resolves to false if the
   * session died or the timeout elapsed first.
   */
  handoverWhen(
    target: string | (() => HTMLElement | null | undefined),
    options?: HandoverWhenOptions,
  ): Promise<boolean>;
  /** Give up and dismiss the keyboard. */
  cancel(): void;
}

/** Only one session can hold the keyboard; a newer one supersedes the older. */
let currentToken: object | null = null;

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

function carryValueOver(decoy: HTMLInputElement, target: HTMLElement): void {
  const typed = decoy.value;
  if (!typed) return;

  const isTextField = target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement;
  if (!isTextField || target.value) return;

  target.value = typed;
  // Frameworks listen for the event, not the property assignment.
  target.dispatchEvent(new Event("input", { bubbles: true }));
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
  const decoy = getDecoy();
  if (!decoy) return DEAD_SESSION;

  // Supersede any previous session so a stale handover cannot steal focus.
  const token = {};
  currentToken = token;

  decoy.value = "";
  decoy.focus();

  const isActive = () => currentToken === token;

  function release() {
    if (isActive()) currentToken = null;
  }

  const session: KeyboardSession = {
    get active() {
      return isActive();
    },

    handover(target, options = {}) {
      if (!isActive() || !target) return false;

      const { carryValue = true, preventScroll } = options;
      if (carryValue) carryValueOver(decoy, target);

      // Moving focus from one text field to another keeps the keyboard up.
      // Blurring to nothing in between would dismiss it, so never blur first.
      target.focus({ preventScroll });
      decoy.value = "";
      release();

      return true;
    },

    handoverWhen(target, options = {}) {
      if (!isActive()) return Promise.resolve(false);

      const { timeout = 5000, root = document.body, ...handoverOptions } =
        options;

      const immediate = resolveTarget(target, root);
      if (immediate) return Promise.resolve(session.handover(immediate, handoverOptions));

      return new Promise<boolean>((resolve) => {
        let timer: ReturnType<typeof setTimeout>;

        const observer = new MutationObserver(() => {
          if (!isActive()) return finish(false);

          const found = resolveTarget(target, root);
          if (found) finish(session.handover(found, handoverOptions));
        });

        function finish(result: boolean) {
          observer.disconnect();
          clearTimeout(timer);
          // Leaving the keyboard up over a field that never arrived would trap
          // the user typing into nothing.
          if (!result) session.cancel();
          resolve(result);
        }

        timer = setTimeout(() => finish(false), timeout);
        observer.observe(root, { childList: true, subtree: true });
      });
    },

    cancel() {
      if (!isActive()) return;

      decoy.value = "";
      decoy.blur();
      release();
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
