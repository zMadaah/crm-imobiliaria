import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Janela modal com <dialog> nativo: foco preso, Esc fecha, fundo inerte. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl bg-surface p-0 text-ink shadow-[0_24px_64px_-24px_rgba(27,43,46,0.55)] backdrop:bg-ink/40"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted hover:text-ink">
          <X size={20} />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
