import type { AiSettingKey, AiSettingsDto } from '@shared/contracts/api';
import { translatePos, type PosLocale, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import type { AiSettingsStatusKey } from './ai-settings-store';

export interface PosAiSettingsPanelProps {
  values: AiSettingsDto | null;
  busy: boolean;
  status: AiSettingsStatusKey;
  locale: PosLocale;
  onToggleSetting: (key: AiSettingKey, checked: boolean) => void;
  onRetry: () => void;
}

const BEHAVIOR_ROWS: ReadonlyArray<{
  key: Exclude<AiSettingKey, 'enabled'>;
  titleKey: PosTranslationKey;
  hintKey: PosTranslationKey;
}> = [
  { key: 'address', titleKey: 'aiAddress', hintKey: 'aiAddressHint' },
  { key: 'hours', titleKey: 'aiHours', hintKey: 'aiHoursHint' },
  { key: 'delivery', titleKey: 'aiDelivery', hintKey: 'aiDeliveryHint' },
  { key: 'customReplies', titleKey: 'aiCustom', hintKey: 'aiCustomHint' },
  { key: 'orderRedirect', titleKey: 'aiRedirect', hintKey: 'aiRedirectHint' },
  { key: 'orderStatus', titleKey: 'aiOrderStatus', hintKey: 'aiOrderStatusHint' },
  { key: 'pendingOrderReplies', titleKey: 'aiPending', hintKey: 'aiPendingHint' }
];

const GUIDE_STEPS: ReadonlyArray<{ step: string; labelKey: PosTranslationKey }> = [
  { step: '01', labelKey: 'aiStepMessage' },
  { step: '02', labelKey: 'aiStepCheck' },
  { step: '03', labelKey: 'aiStepReply' }
];

/** Tenant-wide LINE AI auto-reply settings card rendered inside #setting-card-ai. */
export function PosAiSettingsPanel({
  values,
  busy,
  status,
  locale,
  onToggleSetting,
  onRetry
}: PosAiSettingsPanelProps) {
  const t = (key: PosTranslationKey) => translatePos(locale, key);
  const masterDisabled = busy || !values;
  const masterChecked = values ? values.enabled !== false : false;
  const behaviorsDisabled = busy || !values || values.enabled === false;
  const isError = status === 'aiLoadError' || status === 'aiSaveError';

  return (
    <>
      <div className="ai-settings-heading">
        <h2 data-ai-i18n="aiTitle">{t('aiTitle')}</h2>
        <p data-ai-i18n="aiIntro">{t('aiIntro')}</p>
      </div>

      <div className="ai-settings-body">
        <div className="ai-master-panel">
          <label
            className={masterDisabled ? 'ai-switch-row ai-switch-disabled' : 'ai-switch-row'}
            htmlFor="ai-setting-enabled"
          >
            <span className="ai-switch-copy">
              <strong id="ai-label-enabled" data-ai-i18n="aiMaster">
                {t('aiMaster')}
              </strong>
              <span id="ai-hint-enabled" data-ai-i18n="aiMasterHint">
                {t('aiMasterHint')}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              id="ai-setting-enabled"
              data-ai-setting="enabled"
              aria-labelledby="ai-label-enabled"
              aria-describedby="ai-hint-enabled"
              checked={masterChecked}
              disabled={masterDisabled}
              onChange={e => onToggleSetting('enabled', e.currentTarget.checked)}
            />
            <span className="ai-switch-track" aria-hidden="true" />
          </label>
          <p id="ai-settings-summary">
            {values ? t(values.enabled ? 'aiEnabledSummary' : 'aiDisabledSummary') : ''}
          </p>
        </div>

        <div className="ai-settings-feedback">
          <span
            id="ai-settings-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={isError ? 'ai-settings-error' : undefined}
          >
            {t(status)}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            id="ai-settings-retry"
            data-ai-i18n="aiRetry"
            hidden={status !== 'aiLoadError'}
            onClick={onRetry}
          >
            {t('aiRetry')}
          </button>
        </div>

        <details className="ai-guide">
          <summary data-ai-i18n="aiGuide">{t('aiGuide')}</summary>
          <div className="ai-guide-body">
            <p data-ai-i18n="aiGuideIntro">{t('aiGuideIntro')}</p>
            <ol className="ai-guide-flow">
              {GUIDE_STEPS.map(item => (
                <li key={item.step}>
                  <span aria-hidden="true">{item.step}</span>
                  <strong data-ai-i18n={item.labelKey}>{t(item.labelKey)}</strong>
                </li>
              ))}
            </ol>
            <div className="ai-guide-examples">
              <div className="ai-guide-example">
                <h3 data-ai-i18n="aiExampleOn">{t('aiExampleOn')}</h3>
                <p className="ai-chat-question" data-ai-i18n="aiExampleQuestion">
                  {t('aiExampleQuestion')}
                </p>
                <p className="ai-chat-answer" data-ai-i18n="aiExampleAnswer">
                  {t('aiExampleAnswer')}
                </p>
              </div>
              <div className="ai-guide-example ai-guide-example-off">
                <h3 data-ai-i18n="aiExampleOff">{t('aiExampleOff')}</h3>
                <p className="ai-chat-question" data-ai-i18n="aiExampleQuestion">
                  {t('aiExampleQuestion')}
                </p>
                <p className="ai-chat-answer" data-ai-i18n="aiExampleSilent">
                  {t('aiExampleSilent')}
                </p>
              </div>
            </div>
            <p className="ai-section-hint" data-ai-i18n="aiExampleHint">
              {t('aiExampleHint')}
            </p>
          </div>
        </details>

        <fieldset id="ai-behaviors" className="ai-behaviors" disabled={behaviorsDisabled}>
          <legend data-ai-i18n="aiBehaviors">{t('aiBehaviors')}</legend>
          <p className="ai-section-hint" data-ai-i18n="aiBehaviorsHint">
            {t('aiBehaviorsHint')}
          </p>
          {BEHAVIOR_ROWS.map(({ key, titleKey, hintKey }) => {
            const inputId = `ai-setting-${key}`;
            const labelId = `ai-label-${key}`;
            const hintId = `ai-hint-${key}`;
            const checked = values ? values[key] !== false : false;
            return (
              <label
                key={key}
                className={behaviorsDisabled ? 'ai-switch-row ai-switch-disabled' : 'ai-switch-row'}
                htmlFor={inputId}
              >
                <span className="ai-switch-copy">
                  <strong id={labelId} data-ai-i18n={titleKey}>
                    {t(titleKey)}
                  </strong>
                  <span id={hintId} data-ai-i18n={hintKey}>
                    {t(hintKey)}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  id={inputId}
                  data-ai-setting={key}
                  aria-labelledby={labelId}
                  aria-describedby={hintId}
                  checked={checked}
                  disabled={behaviorsDisabled}
                  onChange={e => onToggleSetting(key, e.currentTarget.checked)}
                />
                <span className="ai-switch-track" aria-hidden="true" />
              </label>
            );
          })}
        </fieldset>

        <p className="ai-section-hint" data-ai-i18n="aiDataHint">
          {t('aiDataHint')}
        </p>

        <aside className="ai-scope">
          <h3 data-ai-i18n="aiScopeTitle">{t('aiScopeTitle')}</h3>
          <p data-ai-i18n="aiScopeHint">{t('aiScopeHint')}</p>
        </aside>
      </div>
    </>
  );
}
