import type { ComponentProps } from 'react';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'success'
  | 'destructive'
  | 'purple'
  | 'amber'
  | 'blue';

export type BadgeShape = 'pill' | 'rounded' | 'square';

type BadgeProps = ComponentProps<'span'> & {
  variant?: BadgeVariant;
  shape?: BadgeShape;
};

const BADGE_BASE =
  'ps-inline-flex ps-items-center ps-justify-center ps-gap-1 ps-border ps-border-solid ps-font-extrabold ps-whitespace-nowrap ps-leading-tight ps-shrink-0';

const BADGE_SHAPES: Record<BadgeShape, string> = {
  pill: 'ps-rounded-full',
  rounded: 'ps-rounded-md',
  square: 'ps-rounded'
};

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: 'ps-border-transparent ps-bg-[#00b900]/10 ps-text-[#00b900]',
  secondary: 'ps-border-transparent ps-bg-slate-100 ps-text-slate-700',
  outline: 'ps-border-slate-200 ps-bg-white ps-text-slate-700',
  success: 'ps-border-emerald-200 ps-bg-emerald-50 ps-text-emerald-700',
  destructive: 'ps-border-red-200 ps-bg-red-100 ps-text-red-700',
  purple: 'ps-border-violet-200 ps-bg-violet-100 ps-text-violet-700',
  amber: 'ps-border-amber-200 ps-bg-amber-50 ps-text-amber-700',
  blue: 'ps-border-transparent ps-bg-blue-100 ps-text-blue-700'
};

// Adapted from the shadcn/ui Badge registry component (MIT).
export function Badge({
  className = '',
  variant = 'default',
  shape = 'pill',
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={`${BADGE_BASE} ${BADGE_SHAPES[shape]} ${BADGE_VARIANTS[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
