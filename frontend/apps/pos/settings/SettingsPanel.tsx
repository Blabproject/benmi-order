import type { ReactNode } from 'react';
import { Card } from '@shared/ui/card';

type SettingsPanelProps = {
  section: string;
  className?: string;
  children?: ReactNode;
};

export function SettingsPanel({ section, className = '', children }: SettingsPanelProps) {
  return (
    <Card
      flush
      id={`setting-card-${section}`}
      className={`settings-card${section === 'status' ? ' active' : ''} ${className}`}
      role="tabpanel"
      aria-labelledby={`toc-item-${section}`}
      tabIndex={0}
    >
      {children}
    </Card>
  );
}
