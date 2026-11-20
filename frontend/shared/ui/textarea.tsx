import type { ComponentProps } from 'react';

export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={`ps-box-border ps-min-w-0 ${className}`} {...props} />;
}
