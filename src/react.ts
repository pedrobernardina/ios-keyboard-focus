import { useCallback, useRef } from "react";

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
 * Works with Preact through `preact/compat`, since it only uses `useRef` and
 * `useCallback`.
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

    sessionRef.current?.handover(node, optionsRef.current);
    sessionRef.current = null;
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
  }, []);

  return { prime, register, cancel };
}
