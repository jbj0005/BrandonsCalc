import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastKind = "info" | "success" | "warning" | "error";
type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
  ttl?: number;
};

const ToastCtx = createContext<{ push(t: Omit<Toast, "id">): void }>({
  push: () => {},
});
export const useToast = () => useContext(ToastCtx);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastByKey = useRef(new Map<string, number>());

  const push = (t: Omit<Toast, "id">) => {
    // dedupe similar toasts within 2s
    const key = `${t.kind}:${t.title}:${t.detail ?? ""}`;
    const now = Date.now();
    if (now - (lastByKey.current.get(key) ?? 0) < 2000) return;
    lastByKey.current.set(key, now);

    setToasts((prev) => {
      const next = [{ id: crypto.randomUUID(), ...t }, ...prev].slice(0, 3);
      return next;
    });
  };

  const remove = (id: string) =>
    setToasts((ts) => ts.filter((t) => t.id !== id));
  const ctx = useMemo(() => ({ push }), []);

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "fixed",
          right: 16,
          top: 16,
          display: "grid",
          gap: 8,
          zIndex: 1000,
        }}
      >
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

const ToastView: React.FC<{ toast: Toast; onClose: () => void }> = ({
  toast,
  onClose,
}) => {
  const {
    kind,
    title,
    detail,
    ttl = toast.kind === "error" ? undefined : 4000,
  } = toast;

  React.useEffect(() => {
    if (!ttl) return;
    const id = setTimeout(onClose, ttl);
    return () => clearTimeout(id);
  }, [ttl, onClose]);

  const role = kind === "error" ? "alert" : undefined; // assertive for errors, polite for others
  return (
    <div
      role={role}
      style={{
        background: "var(--surface, #151A2B)",
        color: "var(--text, #E6E8F2)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 10,
        padding: "12px 14px",
        boxShadow: "0 8px 24px rgba(0,0,0,.32)",
      }}
    >
      <strong style={{ display: "block" }}>{title}</strong>
      {detail && <div>{detail}</div>}
      <button aria-label="Dismiss" onClick={onClose} style={{ float: "right" }}>
        ×
      </button>
    </div>
  );
};
