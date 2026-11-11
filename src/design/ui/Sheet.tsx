import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from '../icons';
import styles from './ui.module.css';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  lead?: string;
  children: ReactNode;
}

/**
 * Bottom sheet built on the native modal <dialog>, which provides the focus
 * trap, Escape handling and inert background.
 */
export function Sheet({ open, onClose, title, lead, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.sheetBody}>
        <span aria-hidden="true" className={styles.sheetHandle} />
        <div className={styles.sheetHeader}>
          <span className={styles.sheetHeading}>
            <h2 id={titleId} className={styles.sheetTitle}>
              {title}
            </h2>
            {lead && <span className={styles.sheetLead}>{lead}</span>}
          </span>
          <button
            type="button"
            aria-label="Close"
            className={styles.iconButton}
            onClick={onClose}
          >
            <CloseIcon strokeWidth={2.2} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
