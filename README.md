# ios-keyboard-focus

Open the iOS on-screen keyboard for an input that **does not exist yet**.

```bash
npm i ios-keyboard-focus
```

~1kB gzipped, zero dependencies, no framework required.

## The problem

You have a search button. Tapping it opens a modal, the modal renders an input,
the input gets `autoFocus`. On Android and desktop this works. On iOS the caret
blinks in the field and **no keyboard appears**.

iOS only opens the keyboard for a `focus()` that runs while the tap's
[transient user activation](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation)
is still alive. By the time your modal has mounted its input, that window is
long gone.

Measured on a physical iPhone (iOS 18, Safari), which is the only way to test
this — simulators do not reproduce it:

| What was tried | Keyboard opens |
| --- | :---: |
| `focus()` synchronously in the tap handler | ✅ |
| …on an input that is off-screen (`translateY(-100%)`) | ✅ |
| …on an input with `opacity: 0` | ✅ |
| …with the page scroll locked (`body { position: fixed }`) | ✅ |
| `focus()` inside a single `requestAnimationFrame` | ❌ |
| `focus()` after `setTimeout(…, 400)` | ❌ |

The lesson: **position and visibility are irrelevant, timing is everything.**
There is no grace period at all — one frame is already too late.

## The trick

Since iOS does not care *which* field you focus, focus a throwaway one inside
the tap, and hand the keyboard over to the real field once it mounts. Moving
focus between two text fields keeps the keyboard up; iOS only presents and
dismisses it on the transitions into and out of text input.

```js
import { primeKeyboard } from "ios-keyboard-focus";

searchButton.addEventListener("click", () => {
  const session = primeKeyboard(); // first statement — keyboard opens now
  openSearchModal();               // your UI, however you build it
  session.handoverWhen("#search"); // takes over as soon as the field exists
});
```

That is the whole library.

## Why it works

This is not a loophole. It is the same path every multi-field form on iOS
already uses.

The activation requirement applies to **presenting** the keyboard, not to
moving focus once it is on screen. iOS decides whether the keyboard is up by
asking a single question — *is something editable focused right now?* — so as
long as the answer never becomes "no", the keyboard has no reason to leave.

You have used this a hundred times without noticing:

- The **Next / Previous** chevrons above the iOS keyboard walk you through the
  fields of a form. Focus changes, the keyboard stays.
- **One-time-code inputs** that auto-advance as you type call `focus()` on the
  next box from a `input` handler — no gesture in sight — and the keyboard
  never flickers.
- **Formatted fields** that split a card number or a phone across several
  inputs do the same thing.

None of those have a user gesture at the moment they move focus, and all of
them keep the keyboard. The decoy just puts your page in that same state
*early*: by the time the real field mounts, you are no longer asking iOS to
open a keyboard — you are asking it to move one that is already open, which it
has always allowed.

The transitions that do cost you the keyboard are the ones into and out of text
input:

| Transition | Keyboard |
| --- | --- |
| nothing → text field | needs a user gesture |
| text field → text field | always allowed |
| text field → nothing | dismissed, and you cannot undo it without a gesture |

That last row is why the library never blurs the decoy before focusing the real
field, and why `handoverWhen` gives up with `cancel()` instead of leaving a
keyboard hovering over a field that never arrived.

One honest caveat: none of this is specified anywhere. It is WebKit behaviour,
observed and depended upon by a lot of production code — including every OTP
input you have ever used — but Apple has never promised it in writing.

## Usage

### When you already have the element

```js
const session = primeKeyboard();
const input = renderModal();
session.handover(input);
```

### When the field mounts later

`handoverWhen` accepts a selector or a getter, watches the DOM, and hands over
the moment it appears. If it never does, it dismisses the keyboard rather than
leaving the user typing into nothing.

```js
const session = primeKeyboard();
openModal();

await session.handoverWhen("#search", { timeout: 3000 });
```

### React / Preact

```tsx
import { useKeyboardFocus } from "ios-keyboard-focus/react";

function Search() {
  const [open, setOpen] = useState(false);
  const { prime, register } = useKeyboardFocus();

  return (
    <>
      <button onClick={() => { prime(); setOpen(true); }}>Search</button>
      {open && <input ref={register} />}
    </>
  );
}
```

`register` is a callback ref, so the handover happens exactly when React
attaches the node. Works with Preact through `preact/compat`.

### Vue, Svelte, anything else

There is no adapter and none is needed — call the two functions from wherever
your framework lets you run code:

```svelte
<script>
  import { primeKeyboard } from "ios-keyboard-focus";

  let open = false;
  let session;

  function openSearch() {
    session = primeKeyboard();
    open = true;
  }

  function handover(node) {
    session?.handover(node);
  }
</script>

<button on:click={openSearch}>Search</button>
{#if open}<input use:handover />{/if}
```

## API

### `primeKeyboard(): KeyboardSession`

Creates (once) an invisible, focusable input and focuses it. **Call it
synchronously inside a user gesture handler**, ideally as the first statement.
Returns a dead no-op session when there is no DOM, so it is safe to call in
server-rendered code paths.

### `session.handover(element, options?): boolean`

Moves focus to the real field. Returns `true` only if the element actually
received focus. Returns `false` if the session is no longer active or the
element could not be focused.

| Option | Default | Description |
| --- | --- | --- |
| `carryValue` | `true` | Copies text typed into the decoy when the real field is empty, and dispatches an `input` event. Existing values are never overwritten. |
| `preventScroll` | `false` | Passed to `focus()`. |

### `session.handoverWhen(target, options?): Promise<boolean>`

`target` is a CSS selector or a `() => HTMLElement | null` getter. Selectors
are checked after elements are inserted or their attributes change; getters
are additionally checked once per animation frame, so they may depend on state
outside the DOM. Adds `timeout` (default `5000`ms) and `root` (default
`document.body`) to the options above. Resolves `false` and dismisses the
keyboard if the timeout elapses.

### `session.cancel(): void`

Dismisses the keyboard. Call it if the user closes the UI before the field ever
appeared.

### `needsKeyboardPriming(): boolean`

`true` on iOS and iPadOS. You do not need this — priming is harmless everywhere
— but it is there if you want to skip the dance on desktop.

### `destroyDecoy(): void`

Removes the decoy node. Only useful in tests.

## What it puts in your page

One `<input>`, appended to `<body>` the first time you call `primeKeyboard()`
and reused from then on. It is deliberately inert:

- No `name`, no `id`, and never inside a `<form>` — nothing submits it.
- `type="text"` with `autocomplete="off"`, so password managers have nothing to
  latch onto.
- `aria-hidden="true"` and `tabindex="-1"` — invisible to screen readers and
  unreachable by tabbing.
- Hiding styles are set `!important`, so a global `input { … }` rule in your
  stylesheet cannot reveal a stray field in the corner of the screen.
- Anything typed into it is cleared on handover, on `cancel()`, and on blur, so
  text does not linger in the DOM after the session ends.

The published package is `dist/` only — no server, no build config, no
dependencies. It touches the DOM exclusively when you call it.

## Gotchas

- **Do not `await` anything before `primeKeyboard()`.** Not a promise, not a
  `requestAnimationFrame`, not a `setTimeout(…, 0)`. This is the one rule.
- **Do not unmount the decoy while it holds focus.** The library owns it and
  keeps it alive; just do not go removing `[data-ios-keyboard-focus-decoy]`.
- **Do not hide your real field with `display: none` or `visibility: hidden`**
  before handing over — neither is focusable. Transparency and transforms are.
- **Keep your real input at `font-size: 16px` or larger**, or iOS zooms the
  viewport when it takes focus. The decoy already does this.
- **Moving the input node in the DOM blurs it.** Reparenting a focused element
  removes it from the document first, which drops focus and closes the keyboard.
  Animate a container, never re-attach the field itself.

## Demos

Two builds of the same four scenarios — modal, side sheet, deferred mount,
inline expand — each with a toggle to turn priming off so you can feel the bug
it fixes:

- **[Vanilla](https://pedrobernardina.github.io/ios-keyboard-focus/vanilla/)** — plain DOM
- **[React](https://pedrobernardina.github.io/ios-keyboard-focus/react/)** — the `useKeyboardFocus` hook

**Use a real device.** The iOS Simulator and desktop Safari with a touch
emulator both fail to reproduce the problem, so they will happily tell you
everything works.

### Running them locally

```bash
pnpm install
pnpm demo
```

Vite prints two URLs. The **Network** one is the one that matters:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.68.53:5173/   ← open this on the phone
```

If the phone is on the same Wi-Fi, that is all you need.

### When same-network does not work

Corporate Wi-Fi with client isolation, a VPN, or testing from mobile data all
break the local URL. Tunnel it instead — either of these gives you a public
HTTPS address:

```bash
# cloudflared: no account needed for a quick tunnel
cloudflared tunnel --url http://localhost:5173

# ngrok: needs a free account for the auth token
ngrok http 5173
```

By default the demos run against `src/`, so editing the library reloads them.
To exercise the artifact that actually gets published instead:

```bash
pnpm demo:dist
```

Either URL works as-is — `vite.config.ts` already sets `server.allowedHosts`,
so the tunnel's hostname is not rejected. (Vite blocks unknown hosts by default
as DNS-rebinding protection, and there is no CLI flag for it: `--allowedHosts`
is silently ignored, which makes it look like the setting does not work.)

Two things worth knowing while testing:

- **The tunnel gives you HTTPS**, which the local IP does not. Irrelevant for
  the keyboard itself, but it matters if your real app needs a secure context.
- **To see the console**, connect the iPhone by cable and use Safari on a Mac
  under *Develop → your iPhone*. Enable *Settings → Apps → Safari → Advanced →
  Web Inspector* on the phone first. Without a Mac, log to an element on the
  page — the demos are built so you should not need to.

### Publishing the demos

`.github/workflows/pages.yml` builds and deploys them to GitHub Pages on every
push to `main`. Enable Pages in *Settings → Pages → Source: GitHub Actions*, or
from the CLI:

```bash
gh api --method POST /repos/OWNER/REPO/pages -f build_type=workflow
gh run watch
```

There is no dedicated `gh pages` command; Pages is managed through `gh api`.

## Support

None, honestly. This scratches an itch I hit in production and it is published
because it might scratch yours. Issues and PRs may sit unread — fork it, vendor
it, copy the 100 lines that matter. It is MIT, that is the point.

## License

MIT. If we ever meet and this saved your afternoon, the beer is on you.
