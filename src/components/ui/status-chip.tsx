import { clsx } from 'clsx';

const VARIANTS = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  royal: 'bg-royal-soft text-royal',
  neutral: 'bg-canvas text-muted',
} as const;

export function StatusChip({
  children,
  variant = 'neutral',
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
}) {
  return <span className={clsx('chip', VARIANTS[variant])}>{children}</span>;
}
