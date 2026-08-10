/**
 * The decoy input: a real, focusable text field that is invisible to sight and
 * to assistive technology.
 *
 * It is created on first use rather than on import — importing a module must
 * not touch the DOM, or the library breaks server rendering and cannot be
 * tree-shaken away by anyone who does not call it.
 */

let decoy: HTMLInputElement | null = null;

/**
 * Styles that keep the input focusable while invisible.
 *
 * `display: none` and `visibility: hidden` are NOT options: neither is
 * focusable, so iOS has nothing to open the keyboard for. Transparency and a
 * 1px box out of the flow are, and iOS treats them as a normal focus target.
 */
const HIDDEN_STYLE: Array<[string, string]> = [
  ["position", "fixed"],
  ["top", "0"],
  ["left", "0"],
  ["width", "1px"],
  ["height", "1px"],
  ["padding", "0"],
  ["border", "0"],
  ["outline", "none"],
  ["opacity", "0"],
  ["pointer-events", "none"],
  // Below 16px, iOS zooms the viewport when an input takes focus. The field is
  // invisible, but the zoom would not be.
  ["font-size", "16px"],
  // Stay inside the viewport — some engines scroll to a focused element that
  // sits outside it — while behind everything else.
  ["z-index", "-1"],
];

export function getDecoy(): HTMLInputElement | null {
  if (typeof document === "undefined") return null;
  if (decoy?.isConnected) return decoy;

  decoy = document.createElement("input");
  decoy.type = "text";
  decoy.tabIndex = -1;
  // Hidden FROM screen readers, which is the opposite of an sr-only element:
  // this field is an implementation detail, not content.
  decoy.setAttribute("aria-hidden", "true");
  decoy.setAttribute("autocomplete", "off");
  decoy.setAttribute("autocorrect", "off");
  decoy.setAttribute("autocapitalize", "off");
  decoy.setAttribute("spellcheck", "false");
  decoy.setAttribute("data-ios-keyboard-focus-decoy", "");

  // !important because this node lands in someone else's page: a global
  // `input { opacity: 1 }` in their stylesheet would otherwise reveal a stray
  // text field in the corner of every screen.
  for (const [property, value] of HIDDEN_STYLE) {
    decoy.style.setProperty(property, value, "important");
  }

  // Anything typed before the handover lives here. Once the field loses focus
  // the session is over one way or another, so there is no reason to keep the
  // text sitting in the DOM.
  decoy.addEventListener("blur", () => {
    decoy!.value = "";
  });

  document.body.appendChild(decoy);

  return decoy;
}

/**
 * Removes the decoy from the document. Mostly useful in tests — in an
 * application the single reused node costs nothing.
 */
export function destroyDecoy(): void {
  decoy?.remove();
  decoy = null;
}
