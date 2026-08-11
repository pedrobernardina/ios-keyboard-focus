import { afterEach, describe, expect, it, vi } from "vitest";

import { destroyDecoy, needsKeyboardPriming, primeKeyboard } from "./index.js";

const DECOY_SELECTOR = "[data-ios-keyboard-focus-decoy]";

function decoyEl(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(DECOY_SELECTOR);
}

afterEach(() => {
  // Restore stubs first: a test may have replaced `document` itself.
  vi.unstubAllGlobals();
  destroyDecoy();
  document.body.innerHTML = "";
});

describe("primeKeyboard", () => {
  it("creates the decoy only when first called", () => {
    expect(decoyEl()).toBeNull();

    primeKeyboard();

    expect(decoyEl()).not.toBeNull();
  });

  it("focuses the decoy synchronously, within the gesture", () => {
    primeKeyboard();

    // Not "eventually" — awaiting anything here would be the bug the library
    // exists to prevent.
    expect(document.activeElement).toBe(decoyEl());
  });

  it("reuses a single decoy across sessions", () => {
    primeKeyboard();
    const first = decoyEl();

    primeKeyboard();

    expect(document.querySelectorAll(DECOY_SELECTOR)).toHaveLength(1);
    expect(decoyEl()).toBe(first);
  });

  it("hides the decoy from assistive technology rather than from layout", () => {
    primeKeyboard();
    const decoy = decoyEl()!;

    expect(decoy.getAttribute("aria-hidden")).toBe("true");
    expect(decoy.tabIndex).toBe(-1);
    // The two ways of hiding it that would make it unfocusable, and so useless.
    expect(decoy.style.display).not.toBe("none");
    expect(decoy.style.visibility).not.toBe("hidden");
  });

  it("keeps the font size at 16px so iOS does not zoom on focus", () => {
    primeKeyboard();

    expect(decoyEl()!.style.fontSize).toBe("16px");
  });

  it("marks the hiding styles important, so host CSS cannot reveal it", () => {
    primeKeyboard();
    const { style } = decoyEl()!;

    for (const property of ["opacity", "width", "height", "position"]) {
      expect(style.getPropertyPriority(property)).toBe("important");
    }
  });

  it("does not leave typed text in the DOM after losing focus", () => {
    primeKeyboard();
    const decoy = decoyEl()!;
    decoy.value = "secret";

    decoy.dispatchEvent(new FocusEvent("blur"));

    expect(decoy.value).toBe("");
  });

  it("has nothing a form or a password manager would pick up", () => {
    primeKeyboard();
    const decoy = decoyEl()!;

    expect(decoy.name).toBe("");
    expect(decoy.type).toBe("text");
    expect(decoy.getAttribute("autocomplete")).toBe("off");
    expect(decoy.closest("form")).toBeNull();
  });
});

describe("handover", () => {
  it("moves focus to the real field", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const session = primeKeyboard();

    expect(session.handover(input)).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(session.active).toBe(false);
  });

  it("recognizes focus inside a shadow root", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadow.appendChild(input);
    document.body.appendChild(host);

    const session = primeKeyboard();

    expect(session.handover(input)).toBe(true);
    expect(shadow.activeElement).toBe(input);
  });

  it("focuses the real field before the decoy loses focus", () => {
    // The order is the whole trick. Blurring first would leave the page with
    // nothing focused, and iOS dismisses the keyboard on that transition —
    // reopening it later is impossible outside a gesture. The DOM blurs the
    // decoy as a side effect of focusing the new field, which is fine; what
    // must never happen is a blur *before* the focus.
    const input = document.createElement("input");
    document.body.appendChild(input);

    const session = primeKeyboard();
    const blur = vi.spyOn(decoyEl()!, "blur");
    const focus = vi.spyOn(input, "focus");

    session.handover(input);

    expect(focus).toHaveBeenCalled();
    const [focusOrder] = focus.mock.invocationCallOrder;
    for (const blurOrder of blur.mock.invocationCallOrder) {
      expect(focusOrder).toBeLessThan(blurOrder);
    }
  });

  it("carries over anything typed before the field existed", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const onInput = vi.fn();
    input.addEventListener("input", onInput);

    const session = primeKeyboard();
    decoyEl()!.value = "jaqueta";

    session.handover(input);

    expect(input.value).toBe("jaqueta");
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a field that already has a value", () => {
    const input = document.createElement("input");
    input.value = "existing";
    document.body.appendChild(input);

    const session = primeKeyboard();
    decoyEl()!.value = "typed";

    session.handover(input);

    expect(input.value).toBe("existing");
  });

  it("can be told not to carry the value", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const session = primeKeyboard();
    decoyEl()!.value = "typed";

    session.handover(input, { carryValue: false });

    expect(input.value).toBe("");
  });

  it("refuses to steal focus once the session is over", () => {
    const first = document.createElement("input");
    const second = document.createElement("input");
    document.body.append(first, second);

    const session = primeKeyboard();
    session.handover(first);

    expect(session.handover(second)).toBe(false);
    expect(document.activeElement).toBe(first);
  });

  it("reports failure and keeps the session active when focus does not move", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    vi.spyOn(target, "focus").mockImplementation(() => {});

    const session = primeKeyboard();

    expect(session.handover(target)).toBe(false);
    expect(session.active).toBe(true);
    expect(document.activeElement).toBe(decoyEl());
  });

  it("ends the session if the decoy unexpectedly loses focus", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    const session = primeKeyboard();
    input.focus();

    expect(session.active).toBe(false);
    expect(session.handover(input)).toBe(false);
  });

  it("supersedes an older session so a stale handover cannot fire", () => {
    const stale = document.createElement("input");
    document.body.appendChild(stale);

    const older = primeKeyboard();
    primeKeyboard();

    expect(older.active).toBe(false);
    expect(older.handover(stale)).toBe(false);
  });
});

describe("targets that cannot hold the keyboard", () => {
  const cases: Array<[string, () => HTMLElement]> = [
    ["a button", () => document.createElement("button")],
    ["a div", () => document.createElement("div")],
    ["an element with contenteditable=false", () => {
      const div = document.createElement("div");
      div.setAttribute("contenteditable", "false");
      return div;
    }],
    ["a file input", () => {
      const input = document.createElement("input");
      input.type = "file";
      return input;
    }],
    ["a checkbox", () => {
      const input = document.createElement("input");
      input.type = "checkbox";
      return input;
    }],
    ["a readonly field", () => {
      const input = document.createElement("input");
      input.readOnly = true;
      return input;
    }],
    ["a disabled field", () => {
      const input = document.createElement("input");
      input.disabled = true;
      return input;
    }],
  ];

  for (const [name, create] of cases) {
    it(`refuses ${name} without touching focus`, () => {
      const target = create();
      document.body.appendChild(target);

      const session = primeKeyboard();

      // Reported as a failure rather than as a handover that dismissed the
      // keyboard, and the session survives for a retry with a real field.
      expect(session.handover(target)).toBe(false);
      expect(session.active).toBe(true);
      expect(document.activeElement).toBe(decoyEl());
    });
  }

  const accepted: Array<[string, () => HTMLElement]> = [
    ["a textarea", () => document.createElement("textarea")],
    ["an email input", () => {
      const input = document.createElement("input");
      input.type = "email";
      return input;
    }],
    ["a contenteditable element", () => {
      const div = document.createElement("div");
      // setAttribute rather than the property: happy-dom does not implement
      // the contentEditable setter, and this is what the library reads anyway.
      div.setAttribute("contenteditable", "true");
      return div;
    }],
  ];

  for (const [name, create] of accepted) {
    it(`accepts ${name}`, () => {
      const target = create();
      document.body.appendChild(target);

      const session = primeKeyboard();

      expect(session.handover(target)).toBe(true);
      expect(document.activeElement).toBe(target);
    });
  }
});

describe("handoverWhen", () => {
  it("hands over immediately when the field is already there", async () => {
    const input = document.createElement("input");
    input.id = "search";
    document.body.appendChild(input);

    const session = primeKeyboard();

    await expect(session.handoverWhen("#search")).resolves.toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("waits for a field that mounts later", async () => {
    const session = primeKeyboard();
    const handedOver = session.handoverWhen("#search");

    const input = document.createElement("input");
    input.id = "search";
    document.body.appendChild(input);

    await expect(handedOver).resolves.toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("accepts a getter instead of a selector", async () => {
    const session = primeKeyboard();
    let input: HTMLInputElement | null = null;
    const handedOver = session.handoverWhen(() => input);

    input = document.createElement("input");
    document.body.appendChild(input);

    await expect(handedOver).resolves.toBe(true);
  });

  it("rechecks a selector when an existing element gains a matching attribute", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const session = primeKeyboard();
    const handedOver = session.handoverWhen("[data-ready]");

    input.setAttribute("data-ready", "");

    await expect(handedOver).resolves.toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("polls a getter whose result changes without a DOM mutation", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    let ready = false;
    const session = primeKeyboard();
    const handedOver = session.handoverWhen(() => ready ? input : null);

    ready = true;

    await expect(handedOver).resolves.toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("settles a pending handover immediately when the session is cancelled", async () => {
    const session = primeKeyboard();
    const handedOver = session.handoverWhen("#never", { timeout: 60_000 });

    session.cancel();

    await expect(handedOver).resolves.toBe(false);
  });

  it("gives up and dismisses the keyboard when the field never arrives", async () => {
    vi.useFakeTimers();
    const session = primeKeyboard();

    const handedOver = session.handoverWhen("#never", { timeout: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(handedOver).resolves.toBe(false);
    expect(session.active).toBe(false);
    vi.useRealTimers();
  });
});

describe("cancel", () => {
  it("blurs the decoy and ends the session", () => {
    const session = primeKeyboard();

    session.cancel();

    expect(document.activeElement).not.toBe(decoyEl());
    expect(session.active).toBe(false);
  });
});

describe("server rendering", () => {
  it("does nothing instead of throwing when there is no document", () => {
    vi.stubGlobal("document", undefined);

    const session = primeKeyboard();

    expect(session.active).toBe(false);
    expect(session.handover(null as unknown as HTMLElement)).toBe(false);
    expect(() => session.cancel()).not.toThrow();
  });
});

describe("needsKeyboardPriming", () => {
  it("detects an iPhone", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      maxTouchPoints: 5,
    });

    expect(needsKeyboardPriming()).toBe(true);
  });

  it("detects an iPad pretending to be a Mac", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      maxTouchPoints: 5,
    });

    expect(needsKeyboardPriming()).toBe(true);
  });

  it("leaves an actual Mac alone", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      maxTouchPoints: 0,
    });

    expect(needsKeyboardPriming()).toBe(false);
  });
});
