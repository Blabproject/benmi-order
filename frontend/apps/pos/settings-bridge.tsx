import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Tabs, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { ChevronRightIcon } from '@shared/ui/PosIcons';
import { PosDisplaySettings, type PosOrientationSetting } from './PosDisplaySettings';
import { settingsSections } from './settings-sections';
import './pos-settings.css';

interface PosSettingsWindow extends Window {
  currentTenantFeatures?: string[];
  t: (key: string) => string;
  switchSettingTab: (cardId: string) => void;
  isPOSSettingAvailable: (cardId: string) => boolean;
  syncPOSSettingsView?: () => void;
  getPOSTextSize: () => string;
  selectPOSTextSize: (value: string) => void;
  getPOSScreenOrientationSetting: () => PosOrientationSetting;
  selectPOSScreenOrientation: (value: string) => Promise<void>;
}

const pos = window as unknown as PosSettingsWindow;
const mobile = window.matchMedia('(max-width: 680px)');
const isMobile = () => mobile.matches;

function subscribeToLayout(update: () => void) {
  if (typeof mobile.addEventListener === 'function') {
    mobile.addEventListener('change', update);
    return () => mobile.removeEventListener('change', update);
  }
  mobile.addListener(update);
  return () => mobile.removeListener(update);
}

function PosSettingsNavigation({ activeId }: { activeId: string }) {
  const horizontal = useSyncExternalStore(subscribeToLayout, isMobile);
  const title = pos.t('tocSettingsTitle');
  const listRef = useRef<HTMLDivElement>(null);
  // A remembered tab also needs to scroll into view when Settings is reopened.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector('[aria-selected="true"]');
    if (!list || !active || !list.getClientRects().length) return;
    const listBounds = list.getBoundingClientRect();
    const tabBounds = active.getBoundingClientRect();
    if (horizontal) {
      if (tabBounds.left < listBounds.left) list.scrollLeft += tabBounds.left - listBounds.left;
      if (tabBounds.right > listBounds.right) list.scrollLeft += tabBounds.right - listBounds.right;
    } else {
      if (tabBounds.top < listBounds.top) list.scrollTop += tabBounds.top - listBounds.top;
      if (tabBounds.bottom > listBounds.bottom) list.scrollTop += tabBounds.bottom - listBounds.bottom;
    }
  });

  return (
    <Tabs className="ps-flex ps-flex-1 ps-min-h-0 ps-min-w-0 ps-flex-col max-[680px]:ps-block max-[680px]:ps-w-full" orientation={horizontal ? 'horizontal' : 'vertical'} value={activeId} onValueChange={pos.switchSettingTab}>
      <div className="panel-header"><div className="panel-title">{title}</div></div>
      <TabsList ref={listRef} className="settings-toc-list" id="settings-toc-list" aria-label={title}>
        {settingsSections.filter(({ id }) => pos.isPOSSettingAvailable(`setting-card-${id}`)).map((section) => {
          const cardId = `setting-card-${section.id}`;
          const locked = section.feature && !pos.currentTenantFeatures?.includes(section.feature);
          return (
            <TabsTrigger
              key={section.id}
              id={`toc-item-${section.id}`}
              aria-controls={cardId}
              className="settings-toc-item"
              value={cardId}
            >
              <span className="toc-icon-box">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {locked ? <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></> : section.icon}
                </svg>
              </span>
              <span className="toc-item-label">{pos.t(section.label)}</span>
              <ChevronRightIcon className="toc-chevron" size={14} />
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

const navigation = document.getElementById('pos-settings-navigation-root');
const display = document.getElementById('setting-card-display');

if (navigation && display) {
  const root = createRoot(navigation);
  for (const { id } of settingsSections) {
    const card = document.getElementById(`setting-card-${id}`);
    card?.setAttribute('role', 'tabpanel');
    card?.setAttribute('aria-labelledby', `toc-item-${id}`);
    card?.setAttribute('tabindex', '0');
  }

  const syncSettings = () => {
    const activeId = document.querySelector('#settings-scroll-container > .settings-card.active')?.id || 'setting-card-status';
    root.render(
      <>
        <PosSettingsNavigation activeId={activeId} />
        {createPortal(
          <PosDisplaySettings
            translate={pos.t}
            textSize={pos.getPOSTextSize()}
            orientation={pos.getPOSScreenOrientationSetting()}
            onTextSizeChange={pos.selectPOSTextSize}
            onOrientationChange={pos.selectPOSScreenOrientation}
          />,
          display
        )}
      </>
    );
  };
  pos.syncPOSSettingsView = syncSettings;
  flushSync(syncSettings);
}
