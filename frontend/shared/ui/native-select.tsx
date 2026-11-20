import type { ComponentProps } from 'react';

export function NativeSelect({ className = '', ...props }: ComponentProps<'select'>) {
  return <select data-slot="native-select" className={`ps-box-border ps-min-w-0 ${className}`} {...props} />;
}
