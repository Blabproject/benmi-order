import type { ComponentProps } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';

// Adapted from the shadcn/ui Radix Radio Group registry component (MIT).
export function RadioGroup(props: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" {...props} />;
}

export function RadioGroupItem({ className = '', ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return <RadioGroupPrimitive.Item data-slot="radio-group-item" className={`ps-min-h-12 ps-min-w-12 ${className}`} {...props} />;
}
