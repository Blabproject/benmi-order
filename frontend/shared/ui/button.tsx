import type { ComponentProps } from 'react';

type ButtonProps = ComponentProps<'button'> & { variant?: 'default' | 'outline' };

export function Button({ type = 'button', className = '', variant, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      data-variant={variant}
      className={`ps-min-h-12 ps-min-w-12 ${className}`}
      {...props}
    />
  );
}
