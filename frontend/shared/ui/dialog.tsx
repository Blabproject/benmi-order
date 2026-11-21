import type { ComponentProps } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

export { Root as Dialog, Portal as DialogPortal, Close as DialogClose, Title as DialogTitle } from '@radix-ui/react-dialog';

// Adapted from the shadcn/ui Radix Dialog registry component (MIT).
export function DialogOverlay(props: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" {...props} />;
}

export function DialogContent(props: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Content data-slot="dialog-content" {...props} />;
}
