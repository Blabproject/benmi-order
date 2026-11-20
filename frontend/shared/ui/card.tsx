import type { ComponentProps } from 'react';

// Adapted from the shadcn/ui Card registry component (MIT).
type CardProps = ComponentProps<'div'> & { flush?: boolean; dashed?: boolean };

export function Card({ className = '', flush = false, dashed = false, ...props }: CardProps) {
  const radiusClass = className.includes('ps-rounded-') ? '' : 'ps-rounded-xl';
  const shadowClass = className.includes('ps-shadow-') ? '' : 'ps-shadow-sm';
  const borderColorClass = className.includes('ps-border-slate-') ? '' : 'ps-border-slate-200';
  const borderWidthClass = className.includes('ps-border-[') ? '' : 'ps-border';
  const paddingClass = flush ? '' : 'ps-p-4';
  return (
    <div
      data-slot="card"
      className={`ps-min-w-0 ${radiusClass} ${borderWidthClass} ${dashed ? 'ps-border-dashed' : 'ps-border-solid'} ${borderColorClass} ps-bg-white ${shadowClass} ${paddingClass} ${className}`
        .replace(/\s+/g, ' ')
        .trim()}
      {...props}
    />
  );
}
