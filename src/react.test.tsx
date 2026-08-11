import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { destroyDecoy } from "./index.js";
import { useKeyboardFocus, type UseKeyboardFocus } from "./react.js";

const DECOY_SELECTOR = "[data-ios-keyboard-focus-decoy]";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  destroyDecoy();
  document.body.innerHTML = "";
});

describe("useKeyboardFocus", () => {
  it("carries typed text into a controlled React input", () => {
    const onChange = vi.fn();
    let keyboard: UseKeyboardFocus | null = null;

    function App() {
      const [value, setValue] = useState("");
      keyboard = useKeyboardFocus();

      return (
        <input
          value={value}
          onChange={(event) => {
            onChange(event.currentTarget.value);
            setValue(event.currentTarget.value);
          }}
        />
      );
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<App />));

    act(() => {
      const session = keyboard!.prime();
      document.querySelector<HTMLInputElement>(DECOY_SELECTOR)!.value = "typed";
      session.handover(document.querySelector("input")!);
    });

    expect(onChange).toHaveBeenCalledWith("typed");
    expect(document.querySelector("input")!.value).toBe("typed");
  });

  it("cancels a primed session when the hook unmounts", () => {
    let keyboard: UseKeyboardFocus | null = null;

    function App() {
      keyboard = useKeyboardFocus();
      return null;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<App />));

    const session = keyboard!.prime();
    act(() => root!.unmount());
    root = null;

    expect(session.active).toBe(false);
    expect(document.activeElement).not.toBe(
      document.querySelector(DECOY_SELECTOR),
    );
  });
});

describe("register", () => {
  /**
   * The regression the existing tests missed by calling session.handover()
   * directly: the failure path only exists when the ref callback is the one
   * doing the handover.
   */
  it("keeps the session reachable when the handover fails", () => {
    let keyboard: UseKeyboardFocus | null = null;

    function App() {
      const [open, setOpen] = useState(false);
      keyboard = useKeyboardFocus();

      return (
        <>
          <button type="button" onClick={() => setOpen(true)} />
          {open && (
            <input
              ref={(node) => {
                // A field that refuses focus: the handover cannot succeed, so
                // the session stays alive holding the keyboard.
                if (node) vi.spyOn(node, "focus").mockImplementation(() => {});
                keyboard!.register(node);
              }}
            />
          )}
        </>
      );
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<App />));

    let session!: ReturnType<UseKeyboardFocus["prime"]>;
    act(() => {
      session = keyboard!.prime();
      host.querySelector("button")!.click();
    });

    expect(session.active).toBe(true);
    expect(document.activeElement).toBe(document.querySelector(DECOY_SELECTOR));

    act(() => keyboard!.cancel());

    expect(session.active).toBe(false);
  });

  it("still cancels a failed handover when the hook unmounts", () => {
    let keyboard: UseKeyboardFocus | null = null;

    function App() {
      keyboard = useKeyboardFocus();
      return (
        <input
          ref={(node) => {
            if (node) vi.spyOn(node, "focus").mockImplementation(() => {});
            keyboard!.register(node);
          }}
        />
      );
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<App />));

    let session!: ReturnType<UseKeyboardFocus["prime"]>;
    act(() => {
      session = keyboard!.prime();
      root!.render(<App />);
    });

    act(() => root!.unmount());
    root = null;

    expect(session.active).toBe(false);
  });

  it("does not discard a newer session created by a focus handler", () => {
    let keyboard: UseKeyboardFocus | null = null;
    let replacement: ReturnType<UseKeyboardFocus["prime"]> | null = null;

    function App() {
      const [open, setOpen] = useState(false);
      keyboard = useKeyboardFocus();

      return (
        <>
          <button type="button" onClick={() => setOpen(true)} />
          {open && (
            <input
              ref={keyboard.register}
              onFocus={() => {
                replacement = keyboard!.prime();
              }}
            />
          )}
        </>
      );
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<App />));

    act(() => {
      keyboard!.prime();
      host.querySelector("button")!.click();
    });

    expect(replacement).not.toBeNull();
    expect(replacement!.active).toBe(true);

    act(() => keyboard!.cancel());

    expect(replacement!.active).toBe(false);
  });
});
