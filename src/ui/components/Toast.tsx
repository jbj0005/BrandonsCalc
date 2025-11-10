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
        className="fixed right-4 top-4 grid gap-2 z-800 pointer-events-none"
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

  const kindColors = {
    info: 'bg-blue-500 border-blue-400',
    success: 'bg-green-500 border-green-400',
    warning: 'bg-yellow-500 border-yellow-400',
    error: 'bg-red-500 border-red-400',
  };

  return (
    <div
      role={role}
      className={`
        ${kindColors[kind]}
        text-white border rounded-xl p-4
        shadow-ios-elevated
        pointer-events-auto
        min-w-[280px] max-w-[420px]
        backdrop-blur-sm bg-opacity-95
        animate-in fade-in slide-in-from-top-2 duration-300
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <strong className="block font-semibold text-base">{title}</strong>
          {detail && <div className="text-sm mt-1 text-white/90">{detail}</div>}
        </div>
        <button
          aria-label="Dismiss"
          onClick={onClose}
          className="flex-shrink-0 w-6 h-6 rounded-full hover:bg-white/20 transition-colors flex items-center justify-center text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
};
