import { useCallback, useEffect, useRef } from "react";

import {
  type HandoverOptions,
  type KeyboardSession,
  primeKeyboard,
} from "./index.js";

export interface UseKeyboardFocus {
  /**
   * Call this synchronously in the event handler, before opening the modal.
   * Anything awaited before it costs you the keyboard.
   */
  prime: () => KeyboardSession;
  /**
   * Ref for the real field. React calls it the moment the node mounts, which
   * is exactly when the keyboard should change hands.
   */
  register: (node: HTMLElement | null) => void;
  /** Dismiss the keyboard without ever reaching the real field. */
  cancel: () => void;
}

/**
 * React binding for {@link primeKeyboard}.
 *
 * ```tsx
 * const { prime, register } = useKeyboardFocus();
 *
 * <button onClick={() => { prime(); setOpen(true); }}>Search</button>
 * {open && <input ref={register} />}
 * ```
 *
 * Works with Preact through `preact/compat`, since it only uses standard hooks.
 */
export function useKeyboardFocus(
  options: HandoverOptions = {},
): UseKeyboardFocus {
  const sessionRef = useRef<KeyboardSession | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const prime = useCallback(() => {
    const session = primeKeyboard();
    sessionRef.current = session;
    return session;
  }, []);

  const register = useCallback((node: HTMLElement | null) => {
    if (!node) return;

    const session = sessionRef.current;
    if (!session) return;

    // Only let go of the session once it is over. A handover can fail — the
    // node may refuse focus, or not be a field that sustains a keyboard — and
    // the session then stays alive holding an open keyboard. Dropping the
    // reference there would leave nothing able to close it: neither cancel()
    // nor the unmount cleanup below, which is how a modal that closes early
    // used to strand the keyboard over a screen that no longer exists.
    if (
      (session.handover(node, optionsRef.current) || !session.active) &&
      sessionRef.current === session
    ) {
      sessionRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return { prime, register, cancel };
}
