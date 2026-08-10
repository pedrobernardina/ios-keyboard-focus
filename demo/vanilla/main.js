import { primeKeyboard } from "ios-keyboard-focus";

const root = document.getElementById("root");
const primingToggle = document.getElementById("priming");
const inlineSlot = document.getElementById("inline-slot");

const primingEnabled = () => primingToggle.checked;

/**
 * Every demo follows the same shape, which is the shape the README teaches:
 * prime synchronously inside the handler, open the UI however you like, then
 * hand the keyboard over once the real field exists.
 */
function onTap(handler) {
  return () => {
    const session = primingEnabled() ? primeKeyboard() : null;
    handler(session);
  };
}

function closeOverlay(session) {
  session?.cancel();
  root.innerHTML = "";
  inlineSlot.innerHTML = "";
}

function searchField() {
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Search…";
  input.className = "field";
  input.enterKeyHint = "search";
  return input;
}

function pending(text) {
  const p = document.createElement("p");
  p.className = "status";
  p.textContent = text;
  return p;
}

/** Shows the outcome on screen — there is no console on a phone. */
function report(result, status) {
  if (!result) return;

  result.then((handedOver) => {
    status.textContent = handedOver
      ? "Handed over — the keyboard should still be up."
      : "Gave up, keyboard dismissed.";
    status.classList.add(handedOver ? "ok" : "failed");
  });
}

function overlay(className, session) {
  const el = document.createElement("div");
  el.className = className;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.textContent = "Close";
  close.addEventListener("click", () => closeOverlay(session));

  el.append(close);
  return el;
}

const demos = {
  // Field exists the moment the overlay is inserted, so a direct handover is
  // enough — no waiting involved.
  modal(session) {
    const el = overlay("overlay modal", session);
    const input = searchField();
    el.append(input);
    root.append(el);

    session?.handover(input);
  },

  sheet(session) {
    const el = overlay("overlay sheet", session);
    const input = searchField();
    el.append(input);
    root.append(el);

    session?.handover(input);
  },

  // Nothing to hand over to yet. handoverWhen watches the DOM and takes over
  // the moment the field shows up — the keyboard stays up in the meantime.
  deferred(session) {
    const el = overlay("overlay modal", session);
    const pending = document.createElement("p");
    pending.textContent = "Loading the field…";
    el.append(pending);
    root.append(el);

    session?.handoverWhen("#deferred-field");

    setTimeout(() => {
      const input = searchField();
      input.id = "deferred-field";
      pending.replaceWith(input);
    }, 800);
  },

  // Already mounted, but the selector only starts matching once a class lands
  // on it. Nothing is inserted or removed, so this only works because the
  // observer watches attributes too.
  ready(session) {
    const el = overlay("overlay modal", session);
    const input = searchField();
    input.id = "ready-field";
    input.classList.add("loading");
    const status = pending("Field is mounted but not ready…");
    el.append(input, status);
    root.append(el);

    report(session?.handoverWhen("#ready-field.ready"), status);

    setTimeout(() => input.classList.replace("loading", "ready"), 800);
  },

  // A field that starts disabled, which is the everyday shape of "still
  // loading". A disabled field cannot take focus, so the selector must exclude
  // it — handing over too early would fail silently.
  enabled(session) {
    const el = overlay("overlay modal", session);
    const input = searchField();
    input.id = "enabled-field";
    input.disabled = true;
    const status = pending("Field is disabled…");
    el.append(input, status);
    root.append(el);

    report(session?.handoverWhen("#enabled-field:not([disabled])"), status);

    setTimeout(() => {
      input.disabled = false;
    }, 800);
  },

  // Nothing about the DOM changes at all — only a variable flips. No selector
  // could ever match this, which is what the getter form is for: it gets polled
  // once per frame.
  state(session) {
    const el = overlay("overlay modal", session);
    const input = searchField();
    const status = pending("Waiting on application state…");
    el.append(input, status);
    root.append(el);

    let ready = false;
    report(session?.handoverWhen(() => (ready ? input : null)), status);

    setTimeout(() => {
      ready = true;
    }, 800);
  },

  // The failure mode, on purpose: after the timeout the keyboard is dismissed
  // instead of hovering over a field that never came.
  never(session) {
    const el = overlay("overlay modal", session);
    const status = pending("Waiting for a field that never mounts…");
    el.append(status);
    root.append(el);

    report(session?.handoverWhen("#nope", { timeout: 2000 }), status);
  },

  inline(session) {
    const input = searchField();
    // No Close button here, so dismissing the keyboard is what collapses it —
    // the field goes away as soon as it stops being the focused element.
    input.addEventListener("blur", () => input.remove());
    inlineSlot.append(input);

    session?.handover(input);
  },
};

for (const button of document.querySelectorAll("[data-demo]")) {
  button.addEventListener(
    "click",
    onTap((session) => demos[button.dataset.demo](session)),
  );
}
