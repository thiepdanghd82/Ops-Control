import { useEffect } from 'react';

/**
 * Subscribe to window Escape keydown and call `onClose` when fired.
 * Standard ergonomics for modal dialogs — paired with overlay click-out.
 *
 * Usage inside a modal component:
 *   useEscapeToClose(handleCancel);
 *
 * No-op when `onClose` is falsy or the modal isn't mounted (the effect
 * only runs while the hook's host component is in the tree).
 */
export default function useEscapeToClose(onClose) {
  useEffect(() => {
    if (!onClose) return;
    function handle(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);
}
