import type { ReactNode } from 'react';

export const settingsSections: { id: string; label: string; feature?: string; icon: ReactNode }[] = [
  {
    id: 'status', label: 'tocStoreStatus', icon: <>
      <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
      <path d="M2 7h20" />
    </>
  },
  {
    id: 'ordermode', label: 'tocOrderMode', icon: <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  },
  {
    id: 'payment', label: 'tocPayment', icon: <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </>
  },
  {
    id: 'hours', label: 'tocHours', icon: <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  },
  {
    id: 'store-info', label: 'tocStoreInfo', icon: <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  },
  {
    id: 'ai', label: 'aiTitle', icon: <>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5M16 3h6m-3-3v6"/>
    </>
  },
  {
    id: 'language', label: 'tocLanguage', icon: <>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  },
  {
    id: 'display', label: 'displayTitle', icon: <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  },
  {
    id: 'dinein', label: 'tocDineIn', feature: 'dine_in', icon: <>
      <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2" />
      <path d="M15 2v10" />
      <path d="M15 14v8" />
      <path d="M6 2v20" />
      <path d="M6 2a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3" />
    </>
  },
  {
    id: 'tables', label: 'tabTables', icon: <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </>
  },
  {
    id: 'printer', label: 'tocPrinter', icon: <>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </>
  },
  {
    id: 'reports', label: 'tocReports', feature: 'reports', icon: <>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </>
  },
  {
    id: 'store-pairing', label: 'tocStorePairing', icon: <>
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </>
  }
];
