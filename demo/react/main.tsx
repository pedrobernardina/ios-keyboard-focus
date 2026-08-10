import {
  type ComponentPropsWithRef,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { useKeyboardFocus } from "ios-keyboard-focus/react";

type PrimingProps = {
  /** Mirrors the toggle: off falls back to plain autoFocus, so the bug shows. */
  priming: boolean;
};

function SearchField(props: ComponentPropsWithRef<"input">) {
  return (
    <input
      type="search"
      className="field"
      placeholder="Search…"
      enterKeyHint="search"
      {...props}
    />
  );
}

type OverlayProps = {
  className: string;
  onClose: () => void;
  children: ReactNode;
};

function Overlay({ className, onClose, children }: OverlayProps) {
  return (
    <div className={`overlay ${className}`}>
      <button type="button" className="close" onClick={onClose}>
        Close
      </button>
      {children}
    </div>
  );
}

type ModalDemoProps = PrimingProps & {
  className: string;
  label: string;
};

/**
 * The field mounts together with the overlay, so the callback ref fires in the
 * same commit — nothing to wait for.
 */
function ModalDemo({ className, label, priming }: ModalDemoProps) {
  const [open, setOpen] = useState(false);
  const { prime, register, cancel } = useKeyboardFocus();

  const close = useCallback(() => {
    cancel();
    setOpen(false);
  }, [cancel]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Synchronously, before anything else in the handler.
          if (priming) prime();
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <Overlay className={className} onClose={close}>
          <SearchField
            ref={priming ? register : undefined}
            autoFocus={!priming}
          />
        </Overlay>
      )}
    </>
  );
}

/**
 * The field arrives late, as if it were waiting on a fetch. The callback ref
 * still fires at the right moment, so nothing extra is needed — the keyboard
 * simply stays up until then.
 */
function DeferredDemo({ priming }: PrimingProps) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const { prime, register, cancel } = useKeyboardFocus();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function close() {
    clearTimeout(timer.current);
    cancel();
    setOpen(false);
    setReady(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (priming) prime();
          setOpen(true);
          timer.current = setTimeout(() => setReady(true), 800);
        }}
      >
        Open slow modal
      </button>
      {open && (
        <Overlay className="modal" onClose={close}>
          {ready
            ? (
              <SearchField
                ref={priming ? register : undefined}
                autoFocus={!priming}
              />
            )
            : <p>Loading the field…</p>}
        </Overlay>
      )}
    </>
  );
}

function InlineDemo({ priming }: PrimingProps) {
  const [open, setOpen] = useState(false);
  const { prime, register } = useKeyboardFocus();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (priming) prime();
          setOpen(true);
        }}
      >
        Search
      </button>
      {open && (
        <SearchField ref={priming ? register : undefined} autoFocus={!priming} />
      )}
    </>
  );
}

function App() {
  const [priming, setPriming] = useState(true);

  return (
    <>
      <header className="page-header">
        <h1>
          ios-keyboard-focus <span className="badge">React</span>
        </h1>
        <p>
          Open this on a real iPhone. A simulator will not reproduce the
          behaviour, and neither will desktop Safari with a touch emulator.
        </p>
        <label className="toggle">
          <input
            type="checkbox"
            checked={priming}
            onChange={(event) => setPriming(event.currentTarget.checked)}
          />
          <span>Priming enabled</span>
        </label>
        <p className="hint">
          Turn it off to fall back to plain <code>autoFocus</code>: the field
          takes focus, the caret blinks, and no keyboard appears.
        </p>
        <nav className="switch">
          <a href="../vanilla/">See the vanilla version →</a>
        </nav>
      </header>

      <main>
        <section>
          <h2>Modal</h2>
          <p>The classic case: a search overlay whose input mounts on open.</p>
          <ModalDemo
            className="modal"
            label="Open search modal"
            priming={priming}
          />
        </section>

        <section>
          <h2>Side sheet</h2>
          <p>Slides in from the edge. The input exists only while open.</p>
          <ModalDemo
            className="sheet"
            label="Open side sheet"
            priming={priming}
          />
        </section>

        <section>
          <h2>Deferred mount</h2>
          <p>
            The input arrives 800ms late, as if fetched. The callback ref fires
            whenever that happens.
          </p>
          <DeferredDemo priming={priming} />
        </section>

        <section>
          <h2>Inline expand</h2>
          <p>No overlay at all — the field grows out of the button.</p>
          <InlineDemo priming={priming} />
        </section>
      </main>
    </>
  );
}

const container = document.getElementById("app");
if (!container) throw new Error("Missing #app");

createRoot(container).render(<App />);
