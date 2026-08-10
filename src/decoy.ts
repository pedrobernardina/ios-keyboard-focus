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
const HIDDEN_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  left: "0",
  width: "1px",
  height: "1px",
  padding: "0",
  border: "0",
  outline: "none",
  opacity: "0",
  pointerEvents: "none",
  // Below 16px, iOS zooms the viewport when an input takes focus. The field is
  // invisible, but the zoom would not be.
  fontSize: "16px",
  // Keep it off the top-left corner visually without leaving the viewport,
  // which some engines treat as a reason to scroll.
  zIndex: "-1",
};

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

  Object.assign(decoy.style, HIDDEN_STYLE);

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
