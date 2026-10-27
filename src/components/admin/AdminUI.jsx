import { useEffect, useRef } from "react";
import AdminSidebar from "./AdminSidebar";
export function AdminPage({ title, subtitle, children, actions }) {
  return (
    <div className="hotel-setup-layout">
      <AdminSidebar />
      <main className="control-main">
        <header className="control-header">
          <div>
            <span>WAKI · ADMINISTRACIÓN</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {actions && <div className="control-actions">{actions}</div>}
        </header>
        {children}
      </main>
    </div>
  );
}
export function AdminDialog({ title, children, onClose, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="control-dialog"
      aria-labelledby="control-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <header>
        <h2 id="control-dialog-title">{title}</h2>
        <button
          type="button"
          className="control-close"
          aria-label="Cerrar"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Pager({ page, total, onPage }) {
  return (
    <div className="control-pager">
      <span>
        {total} registros · Página {page + 1}
      </span>
      <div>
        <button
          className="control-btn"
          disabled={!page}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </button>
        <button
          className="control-btn"
          disabled={(page + 1) * 25 >= total}
          onClick={() => onPage(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
export function Feedback({ error, notice }) {
  return (
    <>
      {error && (
        <p className="control-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="control-success" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
