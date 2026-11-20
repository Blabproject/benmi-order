import type { ComponentProps } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

export function Switch({ className = '', ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={`ps-relative ps-min-h-12 ps-min-w-12 ${className}`} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
