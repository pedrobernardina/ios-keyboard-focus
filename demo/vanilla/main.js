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
