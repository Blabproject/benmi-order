import type { ComponentProps } from 'react';

// Adapted from the shadcn/ui Card registry component (MIT).
type CardProps = ComponentProps<'div'> & { flush?: boolean };

export function Card({ className = '', flush = false, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={`ps-min-w-0 ps-rounded-xl ps-border ps-border-solid ps-border-slate-200 ps-bg-white ps-shadow-sm ${flush ? '' : 'ps-p-4'} ${className}`}
      {...props}
    />
  );
}
