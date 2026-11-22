import { useEffect, useRef, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Tabs, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { ChevronRightIcon } from '@shared/ui/PosIcons';
import { PosDisplaySettings, type PosOrientationSetting } from './PosDisplaySettings';
import { PosSettingsPanels } from './settings/PosSettingsPanels';
import { HoursRows, type WeeklyHours } from './settings/HoursRows';
import { settingsSections } from './settings-sections';
import '@shared/ui/tailwind.css';
import './pos-settings.css';

interface PosSettingsWindow extends Window {
  currentTenantFeatures?: string[];
  t: (key: string) => string;
  switchSettingTab: (cardId: string) => void;
  isPOSSettingAvailable: (cardId: string) => boolean;
  syncPOSSettingsView?: () => void;
  renderPOSOperatingHours?: (days: string[], hours: WeeklyHours) => void;
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
      <TabsList
        ref={listRef}
        className="settings-toc-list"
        id="settings-toc-list"
        aria-label={title}
        onPointerDownCapture={event => event.currentTarget.setAttribute('data-pointer-focus', '')}
        onKeyDownCapture={event => event.currentTarget.removeAttribute('data-pointer-focus')}
        onBlurCapture={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.removeAttribute('data-pointer-focus');
          }
        }}
      >
        {settingsSections.filter(({ id }) => pos.isPOSSettingAvailable(`setting-card-${id}`)).map((section) => {
          const cardId = `setting-card-${section.id}`;
          const locked = section.feature === 'dine_in'
            ? !(pos.currentTenantFeatures?.includes('dine_in') || pos.currentTenantFeatures?.includes('table_qr_ordering'))
            : Boolean(section.feature && !pos.currentTenantFeatures?.includes(section.feature));
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
const content = document.getElementById('settings-scroll-container');

if (navigation && content) {
  const navigationRoot = createRoot(navigation);
  const panelsRoot = createRoot(content);
  const syncNavigation = () => {
    const activeId = content.querySelector('.settings-card.active')?.id || 'setting-card-status';
    navigationRoot.render(<PosSettingsNavigation activeId={activeId} />);
  };
  flushSync(() => {
    panelsRoot.render(<PosSettingsPanels />);
    syncNavigation();
  });

  const hours = document.getElementById('hours-settings-list');
  if (hours) {
    const hoursRoot = createRoot(hours);
    let revision = 0;
    pos.renderPOSOperatingHours = (days, operatingHours) => {
      // Replace the native values after add/remove and after canonical saves.
      flushSync(() => hoursRoot.render(<HoursRows key={++revision} days={days} hours={operatingHours} />));
    };
  }

  const display = document.getElementById('setting-card-display');
  if (display) {
    const displayRoot = createRoot(display);
    pos.syncPOSSettingsView = () => {
      syncNavigation();
      displayRoot.render(
        <PosDisplaySettings
          translate={pos.t}
          textSize={pos.getPOSTextSize()}
          orientation={pos.getPOSScreenOrientationSetting()}
          onTextSizeChange={pos.selectPOSTextSize}
          onOrientationChange={pos.selectPOSScreenOrientation}
        />
      );
    };
    flushSync(() => pos.syncPOSSettingsView?.());
  }
}
