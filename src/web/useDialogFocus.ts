import { useEffect, useRef } from 'react';

/** Keep keyboard review inside the active dialog and restore its opening control. */
export function useDialogFocus<T extends HTMLElement>(onClose: () => void, busy = false) {
  const panel = useRef<T>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = panel.current;
    root?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab' || !root) return;
      const elements = [
        ...root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        root.focus();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return panel;
}
