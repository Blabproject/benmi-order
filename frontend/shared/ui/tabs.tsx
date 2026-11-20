import type { ComponentProps } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

// Adapted from the shadcn/ui Radix Tabs registry component (MIT).
// The POS supplies its own list layout and active colors.
export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}

export function TabsList(props: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List data-slot="tabs-list" {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={`ps-min-h-12 ps-min-w-12 ps-text-left ${className ?? ''}`}
      {...props}
    />
  );
}
