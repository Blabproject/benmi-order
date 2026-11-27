import { Button } from '@shared/ui/button';
import { ReceiptIcon } from '@shared/ui/PosIcons';

interface StickerPrintButtonProps {
  className: string;
  label: string;
  title?: string;
  withActionTitle?: boolean;
  onClick: () => void;
}

/**
 * Renders a compact visible print pill inside a full 48px POS touch-target button.
 */
export function StickerPrintButton({
  className,
  label,
  title = label,
  withActionTitle = false,
  onClick,
}: StickerPrintButtonProps) {
  return (
    <Button
      className={`btn btn-ghost ${className}`}
      data-print-action="stickers"
      data-print-action-title={withActionTitle ? label : undefined}
      title={title}
      onClick={onClick}
    >
      <span className="review-item-print-pill">
        <ReceiptIcon size={14} />
        <span>{label}</span>
      </span>
    </Button>
  );
}
