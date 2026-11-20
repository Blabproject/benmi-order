import type { ComponentProps } from 'react';

// Adapted from the shadcn/ui Card registry component (MIT).
export function Card({ className = '', ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={`ps-min-w-0 ps-rounded-xl ps-border ps-border-solid ps-border-slate-200 ps-bg-white ps-p-4 ps-shadow-sm ${className}`}
      {...props}
    />
  );
}
