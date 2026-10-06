"use client";
import Image from "next/image";
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
  card: "M3 6h18v12H3ZM3 10h18M7 15h4",
  user: "M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
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
  moon: "M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z",
  refresh: "M20 7v5h-5M4 17v-5h5M6.1 8.2A7 7 0 0 1 18.6 6L20 12M4 12l1.4 6A7 7 0 0 0 17.9 15.8",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  more: "M5 12h.01M12 12h.01M19 12h.01",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="nr-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
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
      <Image
        className="nr-brand-symbol"
        src="/brand/nexride-mark.svg"
        alt=""
        width={32}
        height={32}
        aria-hidden="true"
        unoptimized
      />
      <div>
        <strong>NexRide</strong>
        {driver && <small>{t("driver")}</small>}
      </div>
    </div>
  );
}
export function Spinner({ label }: { label?: string }) {
  return (
    <span
      className="nr-spinner"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
export function Button({
  children,
  variant = "primary",
  className = "",
  loading = false,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  children: ReactNode;
  loading?: boolean;
}) {
  const variantClass = {
    primary: "bg-[var(--nr-emerald)] text-[#041a11] border-[var(--nr-emerald)] hover:bg-[var(--nr-emerald-pressed)]",
    secondary: "bg-[var(--nr-surface)] text-[var(--nr-text)] border-[var(--nr-border)] hover:bg-[var(--nr-bg-secondary)]",
    ghost: "bg-transparent text-[var(--nr-text-secondary)] border-transparent hover:bg-[var(--nr-bg-secondary)]",
    danger: "bg-[#fff2f3] text-[#b84252] border-[#efc9cf] hover:bg-[#ffe7ea]",
  }[variant];
  return (
    <button
      type="button"
      className={`nr-button nr-${variant} inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[12px] border px-4 py-2.5 text-[15px] font-semibold tracking-[-0.01em] transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${variantClass} ${className}`}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
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
    <div className={`nr-notice flex items-start gap-2.5 rounded-[14px] border border-[var(--nr-border)] bg-[var(--nr-bg-secondary)] px-3 py-2.5 text-sm text-[var(--nr-text-secondary)] ${compact ? "compact" : ""}`}>
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
    <section className="nr-sheet w-full rounded-t-[22px] border border-[var(--nr-border)] bg-[var(--nr-surface-raised)] text-[var(--nr-text)] shadow-[var(--nr-shadow-md)]">
      <div className="nr-handle" />
      {title && (
        <div className="nr-sheet-heading flex items-center gap-3">
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
    <nav className="nr-navigation grid w-full grid-flow-col auto-cols-fr gap-1" aria-label="NexRide">
      {items.map((item) => (
        <button
          key={item.id}
          className={`min-h-11 rounded-[12px] px-2 py-2 text-[11px] font-semibold transition-colors duration-200 motion-reduce:transition-none ${active === item.id ? "active" : ""}`}
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
      className="nr-dialog m-auto w-[min(92vw,500px)] rounded-[20px] border border-[var(--nr-border)] bg-[var(--nr-surface-raised)] p-0 text-[var(--nr-text)] shadow-[var(--nr-shadow-lg)] backdrop:bg-black/45"
      aria-labelledby="nr-dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="nr-dialog-head flex items-center justify-between gap-4 border-b border-[var(--nr-border)] px-5 py-4">
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
    <div
      className="nr-inline-skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading NexRide content"
    >
      <span />
      <span />
      <span />
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
      <span className="nr-list-icon grid size-10 shrink-0 place-items-center rounded-[12px] bg-[var(--nr-emerald-soft)] text-[var(--nr-emerald-pressed)]">
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
    <button className="nr-list-row flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--nr-bg-secondary)] motion-reduce:transition-none" onClick={onClick}>
      {contents}
    </button>
  ) : (
    <div className="nr-list-row flex w-full items-center gap-3 rounded-[16px] px-3 py-3">{contents}</div>
  );
}

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export function StatusChip({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: StatusTone;
  icon?: IconName;
}) {
  return (
    <span className={`nr-status-chip ${tone} inline-flex min-h-7 items-center gap-1.5 rounded-full border border-[var(--nr-border)] px-2.5 py-1 text-xs font-semibold`}>
      {icon && <Icon name={icon} size={14} />}
      <span>{children}</span>
    </span>
  );
}

export function IconButton({
  label,
  icon,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: IconName;
}) {
  return (
    <button
      type="button"
      className={`nr-icon-button grid size-11 min-h-11 place-items-center rounded-[12px] border border-[var(--nr-border)] bg-[var(--nr-surface-glass)] text-[var(--nr-text)] shadow-[var(--nr-shadow-sm)] transition-transform duration-200 active:scale-95 motion-reduce:transition-none ${className}`}
      aria-label={label}
      {...props}
    >
      <Icon name={icon} />
    </button>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <header className="nr-section-header flex items-start justify-between gap-4">
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon = "info",
  title,
  detail,
  action,
}: {
  icon?: IconName;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="nr-state nr-state-empty grid justify-items-start gap-2 rounded-[16px] border border-dashed border-[var(--nr-border-strong)] bg-[var(--nr-bg-secondary)] p-5 text-[var(--nr-text)]">
      <span className="nr-state-icon"><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="nr-state nr-state-error grid justify-items-start gap-2 rounded-[16px] border border-[#c63d4d]/25 bg-[#c63d4d]/10 p-5" role="alert">
      <span className="nr-state-icon"><Icon name="info" size={22} /></span>
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}

export function SkeletonBlock({
  className = "",
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return <span className={`nr-skeleton-block block animate-pulse rounded-[12px] bg-[var(--nr-bg-secondary)] motion-reduce:animate-none ${className}`} role="status" aria-label={label} />;
}

export function InputField({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="nr-input-field grid gap-1.5 rounded-[12px] border border-[var(--nr-border)] bg-[var(--nr-surface)] px-3 py-2 text-xs font-semibold text-[var(--nr-text-secondary)] transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--nr-emerald)] focus-within:shadow-[0_0_0_4px_rgba(0,200,120,.12)] motion-reduce:transition-none">
      {label}
      <input className="min-h-7 w-full border-0 bg-transparent p-0 text-[15px] font-medium text-[var(--nr-text)] outline-none placeholder:text-[var(--nr-text-muted)]" {...props} />
    </label>
  );
}
