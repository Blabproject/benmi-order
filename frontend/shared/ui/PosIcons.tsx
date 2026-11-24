import type { SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

function StrokeIcon({
  size = 16,
  strokeWidth = 2.2,
  viewBox = '0 0 24 24',
  children,
  ...rest
}: IconProps & { size?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Magnifying glass search icon (Lucide MIT). */
export function SearchIcon({ size = 15, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </StrokeIcon>
  );
}

/** Tag / QR channel attribution icon (Lucide MIT). */
export function TagIcon({ size = 12, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </StrokeIcon>
  );
}

/** Close/clear icon (Lucide MIT). */
export function CloseIcon({ size = 14, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </StrokeIcon>
  );
}

/** Folder icon indicating collapse-all action (Lucide MIT). */
export function FolderIcon({ size = 16, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </StrokeIcon>
  );
}

/** Open folder icon indicating expand-all action (Lucide MIT). */
export function FolderOpenIcon({ size = 16, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </StrokeIcon>
  );
}

/** Calendar date-group icon (Lucide MIT). */
export function CalendarIcon({ size = 16, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </StrokeIcon>
  );
}

/** Accordion chevron icon (Lucide MIT). */
export function ChevronDownIcon({ size = 16, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} strokeWidth={2.4} {...props}>
      <path d="m6 9 6 6 6-6" />
    </StrokeIcon>
  );
}

/** Empty inbox icon (Lucide MIT). */
export function InboxIcon({ size = 24, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </StrokeIcon>
  );
}

/** Utensils icon for dine-in orders (Lucide MIT). */
export function DineInIcon({ size = 13, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </StrokeIcon>
  );
}

/** Takeaway shopping bag icon (Lucide MIT). */
export function TakeawayIcon({ size = 13, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </StrokeIcon>
  );
}

/** Modification pencil icon (Lucide MIT). */
export function ModifyIcon({ size = 12, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </StrokeIcon>
  );
}

/** Clock timestamp icon (Lucide MIT). */
export function ClockIcon({ size = 13, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </StrokeIcon>
  );
}

/** Receipt summary icon (Lucide MIT). */
export function ReceiptIcon({ size = 13, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5v-11" />
    </StrokeIcon>
  );
}

/** View detail eye icon (Lucide MIT). */
export function EyeIcon({ size = 15, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </StrokeIcon>
  );
}

/** Archive box icon for 30+ day history support banner (Lucide MIT). */
export function ArchiveIcon({ size = 20, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M21 8v13H3V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M10 12h4" />
    </StrokeIcon>
  );
}

/** Support message icon (Lucide MIT). */
export function MessageSquareIcon({ size = 16, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </StrokeIcon>
  );
}

/** Refresh circular arrows icon (Lucide MIT). */
export function RefreshCwIcon({ size = 16, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </StrokeIcon>
  );
}

/** Left navigation arrow icon (Lucide MIT). */
export function ArrowLeftIcon({ size = 16, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </StrokeIcon>
  );
}

/** Analytics bar chart icon (Lucide MIT). */
export function BarChart3Icon({ size = 24, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </StrokeIcon>
  );
}

/** Alert warning triangle icon (Lucide MIT). */
export function AlertTriangleIcon({ size = 24, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </StrokeIcon>
  );
}

/** Ban, hourglass, moon and bell-off icons from Lucide. */
export function BanIcon({ size = 20, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M4.929 4.929 19.07 19.071" />
    </StrokeIcon>
  );
}

export function HourglassIcon({ size = 20, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M5 22h14M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </StrokeIcon>
  );
}

export function MoonIcon({ size = 20, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    </StrokeIcon>
  );
}

export function BellOffIcon({ size = 20, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742" />
      <path d="m2 2 20 20" />
      <path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05" />
    </StrokeIcon>
  );
}

/** Right chevron icon (Lucide MIT). */
export function ChevronRightIcon({ size = 16, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="m9 18 6-6-6-6" />
    </StrokeIcon>
  );
}

/** Help circle icon (Feather/Lucide MIT). */
export function HelpCircleIcon({ size = 18, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </StrokeIcon>
  );
}

/** Plus icon (Lucide MIT). */
export function PlusIcon({ size = 20, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </StrokeIcon>
  );
}

/** Book-open catalog picker icon (Lucide MIT). */
export function BookOpenIcon({ size = 20, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </StrokeIcon>
  );
}

/** Link chain icon for linked products/sub-options (Lucide MIT). */
export function LinkIcon({ size = 14, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} {...props}>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" />
    </StrokeIcon>
  );
}

/** Image placeholder frame icon (Lucide MIT). */
export function ImagePlaceholderIcon({ size = 32, ...props }: IconProps & { size?: number }) {
  return (
    <StrokeIcon size={size} strokeWidth={1.5} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 17 6-6 4 4 3-3 5 5" />
    </StrokeIcon>
  );
}
