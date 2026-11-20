import type { ComponentProps } from 'react';

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={`ps-box-border ps-min-w-0 ${className}`} {...props} />;
}
