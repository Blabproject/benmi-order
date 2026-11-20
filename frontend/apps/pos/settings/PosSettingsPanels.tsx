import { SettingsPanel } from './SettingsPanel';
import { DeviceSettings } from './DeviceSettings';
import { DineInSettings } from './DineInSettings';
import { HoursSettings } from './HoursSettings';
import { LanguageSettings } from './LanguageSettings';
import { PaymentSettings } from './PaymentSettings';
import { PickupSettings } from './PickupSettings';
import { PrinterSettings } from './PrinterSettings';
import { ReportsSettings } from './ReportsSettings';
import { StoreInfoSettings } from './StoreInfoSettings';
import { StoreStatusSettings } from './StoreStatusSettings';
import { TablesSettings } from './TablesSettings';

// Keep the forms mounted across navigation so drafts and native device bindings
// survive tab changes. Each controller updates its own form until it is edited.
export function PosSettingsPanels() {
  return (
    <>
      <StoreStatusSettings />
      <PickupSettings />
      <PaymentSettings />
      <HoursSettings />
      <StoreInfoSettings />
      <SettingsPanel section="ai">
        <div id="pos-ai-settings-react-root" className="pos-ai-settings-mount blab-modern-root" />
      </SettingsPanel>
      <LanguageSettings />
      <SettingsPanel section="display" />
      <DineInSettings />
      <TablesSettings />
      <PrinterSettings />
      <ReportsSettings />
      <DeviceSettings />
    </>
  );
}
