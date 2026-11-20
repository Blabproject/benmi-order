import { Card } from '@shared/ui/card';
import { ReceiptIcon } from '@shared/ui/PosIcons';

export type PosOrientationSetting = {
  available: boolean;
  selected: string | null;
  busy: boolean;
  status: string;
};

type DisplaySettingsProps = {
  translate: (key: string) => string;
  textSize: string;
  orientation: PosOrientationSetting;
  onTextSizeChange: (value: string) => void;
  onOrientationChange: (value: string) => void;
};

const textSizes = [
  { value: 'auto', label: 'displayAuto' },
  { value: 'standard', label: 'displayStandard' },
  { value: 'large', label: 'displayLarge' },
  { value: 'extra-large', label: 'displayExtraLarge' }
];
const orientations = [
  { value: 'auto', label: 'orientationAuto' },
  { value: 'portrait', label: 'orientationPortrait' },
  { value: 'landscape', label: 'orientationLandscape' }
];

export function PosDisplaySettings({
  translate: t, textSize, orientation, onTextSizeChange, onOrientationChange
}: DisplaySettingsProps) {
  return (
    <>
      <header className="pos-display-header ps-px-6 ps-py-5 max-[680px]:ps-px-4">
        <h2>{t('displayTitle')}</h2>
        <p className="pos-display-description">{t('displayDeviceHint')}</p>
      </header>
      <div className="pos-display-layout ps-grid ps-items-start ps-gap-4 ps-p-5 max-[680px]:ps-p-3">
        <Card>
          <fieldset className="pos-display-options">
            <legend className="pos-display-label">{t('displayTextSize')}</legend>
            {textSizes.map(({ value, label }) => (
              <label key={value} className="pos-display-option" data-selected={value === textSize}>
                <span>
                  <strong>{t(label)}</strong>
                  {value === 'auto' && <small>{t('displayAutoHint')}</small>}
                </span>
                <input
                  type="radio"
                  name="pos-text-size"
                  value={value}
                  checked={value === textSize}
                  onChange={() => onTextSizeChange(value)}
                />
              </label>
            ))}
          </fieldset>
        </Card>
        <Card role="group" aria-labelledby="pos-display-preview-label">
          <div className="pos-display-label pos-display-preview-heading" id="pos-display-preview-label">
            <ReceiptIcon size={18} />
            <span>{t('displayPreview')}</span>
          </div>
          <div className="pos-display-preview">
            <div className="pos-display-preview-title">{t('displayPreviewOrder')}</div>
            <div className="pos-display-preview-item">{t('displayPreviewItem')}</div>
            <div className="pos-display-preview-meta">{t('displayPreviewOptions')}</div>
            <div className="pos-display-preview-total">
              <span>{t('displayPreviewTotal')}</span>
              <strong>$180</strong>
            </div>
          </div>
        </Card>
        <section id="pos-screen-orientation" hidden={!orientation.available} aria-labelledby="pos-screen-orientation-title">
          <Card>
            <fieldset className="pos-display-options" aria-describedby="pos-screen-orientation-status">
              <legend className="pos-display-label" id="pos-screen-orientation-title">{t('orientationTitle')}</legend>
              {orientations.map(({ value, label }) => (
                <label key={value} className="pos-display-option" data-selected={orientation.selected === value}>
                  <strong>{t(label)}</strong>
                  <input
                    type="radio"
                    name="pos-screen-orientation"
                    value={value}
                    onChange={() => onOrientationChange(value)}
                    checked={orientation.selected === value}
                    disabled={orientation.busy || !orientation.selected}
                  />
                </label>
              ))}
            </fieldset>
            <p className="pos-display-description" id="pos-screen-orientation-status" role="status" aria-live="polite">
              {t(orientation.status)}
            </p>
          </Card>
        </section>
      </div>
    </>
  );
}
