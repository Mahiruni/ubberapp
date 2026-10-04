"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import {
  translate,
  type Language,
  type MessageKey,
} from "../../lib/nexride-i18n";
export const LanguageContext = createContext<Language>("en");
export const useTranslation = () => {
  const language = useContext(LanguageContext);
  return (key: MessageKey) => translate(language, key);
};
const paths = {
  arrow: "M4 12h16m-6-6 6 6-6 6",
  briefcase: "M3 7h18v14H3ZM8 7V3h8v4M3 12c6 3 12 3 18 0M10 12h4v4h-4Z",
  home: "M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  wallet: "M3 6h18v14H3ZM3 6V3h15v3M16 11h5v5h-5Z",
  user: "M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  car: "m4 11 3-6h10l3 6M3 11h18v7H3ZM6 18v3m12-3v3M6 14h2m8 0h2",
  shield: "m12 3 8 3v6c0 5-4 8-8 10-4-2-8-5-8-10V6ZM8 12l3 3 5-5",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2",
  locate: "M12 2v4m0 12v4M2 12h4m12 0h4M18 12a6 6 0 1 0-12 0 6 6 0 0 0 12 0",
  menu: "M4 6h16M4 12h16M4 18h16",
  chevron: "m9 5 7 7-7 7",
  back: "m15 5-7 7 7 7",
  check: "m5 12 4 4L19 6",
  phone:
    "m6 3 3 1-1 4-2 1a15 15 0 0 0 7 7l1-2 4-1 1 3a2 2 0 0 1-2 2C10 18 6 14 3 7a2 2 0 0 1 3-4",
  chat: "M4 5h16v11H8l-4 4Z",
  navigation: "m4 4 16 8-16 8 4-8Z",
  money: "M3 6h18v12H3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6 12h.01M18 12h.01",
  close: "m6 6 12 12M18 6 6 18",
  share: "M4 12v8h16v-8M8 8l4-4 4 4M12 4v12",
  pin: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  star: "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18",
  info: "M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  plus: "M12 5v14M5 12h14",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  bag: "M4 7h16v14H4ZM8 7V3h8v4",
  power: "M12 2v10M6 5a9 9 0 1 0 12 0",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Brand({ driver = false }: { driver?: boolean }) {
  const t = useTranslation();
  return (
    <div className="nr-brand">
      <span className="nr-mark" aria-hidden="true">
        N
      </span>
      <div>
        <strong>NexRide</strong>
        {driver && <small>{t("driver")}</small>}
      </div>
    </div>
  );
}
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`nr-button nr-${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function StatusBanner({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`nr-notice ${compact ? "compact" : ""}`}>
      <Icon name="info" size={17} />
      <span>{children}</span>
    </div>
  );
}
export function Sheet({
  children,
  title,
  subtitle,
  onBack,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  const t = useTranslation();
  return (
    <section className="nr-sheet">
      <div className="nr-handle" />
      {title && (
        <div className="nr-sheet-heading">
          {onBack && (
            <button
              className="nr-icon-button"
              onClick={onBack}
              aria-label={t("back")}
            >
              <Icon name="back" />
            </button>
          )}
          <div>
            {subtitle && <small>{subtitle}</small>}
            <h1>{title}</h1>
          </div>
        </div>
      )}
      {children}
    </section>
  );
}
export function Navigation({
  items,
  active,
  onNavigate,
}: {
  items: { id: string; label: string; icon: IconName }[];
  active: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav className="nr-navigation" aria-label="NexRide">
      {items.map((item) => (
        <button
          key={item.id}
          className={active === item.id ? "active" : ""}
          onClick={() => onNavigate(item.id)}
          aria-current={active === item.id ? "page" : undefined}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const t = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const prior = document.activeElement as HTMLElement | null;
    node?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node?.close();
      document.body.style.overflow = overflow;
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="nr-dialog"
      aria-labelledby="nr-dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="nr-dialog-head">
        <h2 id="nr-dialog-title">{title}</h2>
        <button
          className="nr-icon-button"
          onClick={onClose}
          aria-label={t("close")}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Skeleton() {
  return (
    <div className="nr-skeleton" aria-busy="true" aria-label="NexRide">
      <span className="nr-mark">N</span>
      <div />
      <div />
      <div />
    </div>
  );
}
export function ListRow({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  onClick?: () => void;
}) {
  const contents = (
    <>
      <span className="nr-list-icon">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {onClick && <Icon name="chevron" size={17} />}
    </>
  );
  return onClick ? (
    <button className="nr-list-row" onClick={onClick}>
      {contents}
    </button>
  ) : (
    <div className="nr-list-row">{contents}</div>
  );
}

export function InputField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="nr-input-field">
      {label}
      <input {...props} />
    </label>
  );
}
