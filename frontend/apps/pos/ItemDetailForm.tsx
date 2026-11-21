import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { ChangeEvent } from 'react';
import { Button } from '@shared/ui/button';

declare function t(key: string): string;
declare function closeItemDetailModal(): void;
declare function saveItemDetailModal(): void;
declare function triggerItemDetailPhotoUpload(): void;
declare function deleteItemDetailPhoto(): Promise<void>;
declare function handleItemDetailImageSelect(event: ChangeEvent<HTMLInputElement>): void;
declare function translateItemDetailWithAI(): Promise<void>;
declare function transitionToSubEditor(type: 'modifiers' | 'bundle'): void;
declare function handleQuickTagClick(tag: string): void;

interface FormView {
  category: string;
  name: string;
  create: boolean;
  bundle: boolean;
}

const quickTags = ['quickTagHot', 'quickTagRecommend', 'quickTagNew', 'quickTagSpicy'];

// Keep native field values available to the existing draft, photo and translation controllers.
function ItemDetailForm({ category, name, create, bundle, tag }: FormView & { tag: string }) {
  return (
    <div className="order-detail-page-container item-detail-page-container">
      <div className="order-detail-topbar item-detail-modal-topbar">
        <div className="order-detail-topbar-left item-detail-topbar-left">
          <Button className="order-detail-circle-btn item-detail-modal-close-btn" onClick={closeItemDetailModal} aria-label={t('btnClose')} title={t('btnClose')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
          </Button>
          <div className="item-detail-badge-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/>
              <path d="M12 22V12"/>
              <path d="m3.3 7 8.7 5 8.7-5"/>
              <path d="m7.5 4.21 8.7 5"/>
            </svg>
          </div>
          <div className="order-detail-header-text item-detail-header-text">
            <div className="item-detail-header-row">
              <h1 className="order-detail-title item-detail-title" id="item-detail-modal-title">{create ? t('itemCreateTitle') : `${t('itemDetailTitle')} - ${name || t('newItemPlaceholder')}`}{bundle && <span className="menu-combo-badge menu-combo-badge-modal">{t('bundleBadge')}</span>}</h1>
              <span className="order-title-dot">•</span>
              <span id="item-detail-topbar-cat-name" className="item-detail-topbar-cat" style={{ fontSize: "16px", fontWeight: "700", color: "#475569" }}>{category}</span>
            </div>
            <p className="item-detail-sub" id="item-detail-modal-sub">{t('itemDetailSub')}</p>
          </div>
        </div>

      </div>
      <div className="item-detail-grid-body" id="item-detail-modal-body">
        <div className="item-detail-col-left">
          <div className="item-detail-card-panel">
            <h3 className="item-detail-panel-heading">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/></svg>
              <span id="i18n-item-basic-title">{t('itemBasicTitle')}</span>
            </h3>
            <div className="item-detail-fields-row" style={{ marginBottom: "16px" }}>
              <div className="item-detail-field-name">
                <label className="item-detail-label" id="i18n-item-name-label" htmlFor="item-detail-name-input">
                  {t('itemNameLabel')} <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input type="text" id="item-detail-name-input" className="item-detail-input" placeholder={t('itemNamePlaceholder')} autoComplete="off" style={{ height: "48px", fontSize: "15px" }} />
              </div>
              <div className="item-detail-field-price">
                <label className="item-detail-label" id="i18n-item-price-label" htmlFor="item-detail-price-input">{t('itemPriceLabel')}</label>
                <div className="item-detail-price-wrap">
                  <span className="item-detail-price-prefix" style={{ fontSize: "16px", top: "13px" }}>$</span>
                  <input type="number" id="item-detail-price-input" className="item-detail-input" placeholder="0" min="0" step="1" style={{ height: "48px", fontSize: "16px", fontWeight: "800", paddingLeft: "28px" }} />
                </div>
              </div>
            </div>
            <div className="item-detail-section item-detail-photo-section" style={{ padding: "16px 0", borderTop: "1px solid #f1f5f9" }}>
              <div className="item-detail-photo-box" style={{ display: "flex", gap: "16px", alignItems: "center", width: "100%" }}>
                <div className="item-detail-photo-preview-wrap" style={{ width: "96px", height: "96px", borderRadius: "14px" }}>
                  <img id="item-detail-img-preview" alt={t('itemNameLabel')} style={{ display: "none" }} />
                  <div id="item-detail-img-placeholder" className="item-detail-photo-placeholder">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  </div>
                </div>
                <div className="item-detail-photo-info">
                  <div className="item-detail-photo-name" id="item-detail-photo-item-name" style={{ fontSize: "16px", fontWeight: "800", marginBottom: "4px" }}></div>
                  <div className="item-detail-photo-status" id="item-detail-img-status" style={{ fontSize: "13px", color: "#64748b", marginBottom: "8px" }}></div>
                  <div className="item-detail-photo-actions" style={{ display: "flex", gap: "8px" }}>
                    <Button className="btn btn-ghost btn-sm" id="btn-item-detail-upload" onClick={triggerItemDetailPhotoUpload} style={{ minHeight: "48px", padding: "0 14px", fontWeight: "700" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <span id="i18n-btn-item-photo-upload">{t('btnUploadPhoto')}</span>
                    </Button>
                    <Button className="btn btn-ghost btn-sm btn-danger-ghost" id="btn-item-detail-delete-img" style={{ display: "none", minHeight: "48px", padding: "0 14px", fontWeight: "700" }} onClick={deleteItemDetailPhoto}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      <span id="i18n-btn-item-photo-remove">{t('btnRemovePhoto')}</span>
                    </Button>
                  </div>
                  <input type="file" id="item-detail-file-input" accept="image/png, image/jpeg, image/webp" style={{ display: "none" }} onChange={handleItemDetailImageSelect} />
                </div>
              </div>
            </div>
            <div className="item-detail-section" style={{ paddingTop: "16px", borderTop: "1px solid #f1f5f9" }}>
              <label className="item-detail-label" id="i18n-item-badge-title" htmlFor="item-detail-badge-input">{t('itemBadgeTitle')}</label>
              <div className="item-detail-badge-input-wrap">
                <input type="text" id="item-detail-badge-input" className="item-detail-input" placeholder={t('itemBadgePlaceholder')} style={{ height: "44px" }} />
              </div>
              <div className="item-detail-quick-tags" id="item-detail-quick-tags" style={{ marginTop: "10px" }}>
                {quickTags.map(key => {
                  const label = t(key);
                  const selected = tag === label;
                  return <Button key={key} className={`quick-tag-chip${selected ? ' active' : ''}`}
                    aria-pressed={selected} onClick={() => handleQuickTagClick(label)}>{label}</Button>;
                })}
              </div>
            </div>
            <details className="item-i18n-details" id="item-detail-i18n-details" style={{ marginTop: "16px" }}>
              <summary id="i18n-item-i18n-section-title" className="ps-min-h-12"></summary>
              <div className="item-i18n-box">
                <Button className="item-i18n-ai-btn" id="btn-item-detail-ai-translate" onClick={translateItemDetailWithAI}>
                  <span id="i18n-btn-item-ai-translate">{t('btnItemAiTranslate')}</span>
                </Button>
                <div className="item-i18n-grid">
                  <div data-i18n-locale="en">
                    <label className="item-detail-label" id="i18n-item-en-name-label" htmlFor="item-detail-i18n-en-name">{t('itemI18nEnName')}</label>
                    <input type="text" id="item-detail-i18n-en-name" className="item-detail-input" autoComplete="off" style={{ height: "48px" }} />
                  </div>
                  <div data-i18n-locale="en">
                    <label className="item-detail-label" id="i18n-item-en-badge-label" htmlFor="item-detail-i18n-en-badge">{t('itemI18nEnBadge')}</label>
                    <input type="text" id="item-detail-i18n-en-badge" className="item-detail-input" autoComplete="off" style={{ height: "48px" }} />
                  </div>
                  <div data-i18n-locale="vi">
                    <label className="item-detail-label" id="i18n-item-vi-name-label" htmlFor="item-detail-i18n-vi-name">{t('itemI18nViName')}</label>
                    <input type="text" id="item-detail-i18n-vi-name" className="item-detail-input" autoComplete="off" style={{ height: "48px" }} />
                  </div>
                  <div data-i18n-locale="vi">
                    <label className="item-detail-label" id="i18n-item-vi-badge-label" htmlFor="item-detail-i18n-vi-badge">{t('itemI18nViBadge')}</label>
                    <input type="text" id="item-detail-i18n-vi-badge" className="item-detail-input" autoComplete="off" style={{ height: "48px" }} />
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>
        <div className="item-detail-col-right" id="item-detail-advanced-section">
          <div className="item-detail-card-panel">
            <h3 className="item-detail-panel-heading">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span id="i18n-item-advanced-title">{t('itemAdvancedTitle')}</span>
            </h3>
            <p className="item-detail-panel-desc" id="i18n-item-advanced-desc">{t('itemAdvancedDesc')}</p>
            <Button className="item-detail-action-card item-detail-action-card-lg" id="item-detail-mod-card" onClick={() => transitionToSubEditor('modifiers')}>
              <div className="item-detail-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="21" y2="21"/><line x1="4" x2="20" y1="14" y2="14"/><line x1="4" x2="20" y1="7" y2="7"/><circle cx="14" cy="21" r="2"/><circle cx="8" cy="14" r="2"/><circle cx="16" cy="7" r="2"/></svg>
              </div>
              <div className="item-detail-card-content">
                <div className="item-detail-card-title" id="i18n-card-mod-title">{t('cardModifiersTitle')}</div>
                <div className="item-detail-card-sub" id="item-detail-mod-summary"></div>
              </div>
              <div className="item-detail-card-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </Button>
            <Button className="item-detail-action-card item-detail-action-card-lg" id="item-detail-bundle-card" onClick={() => transitionToSubEditor('bundle')}>
              <div className="item-detail-card-icon bundle-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              </div>
              <div className="item-detail-card-content">
                <div className="item-detail-card-title" id="i18n-card-bundle-title">{t('cardBundleTitle')}</div>
                <div className="item-detail-card-sub" id="item-detail-bundle-summary"></div>
              </div>
              <div className="item-detail-card-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </Button>
          </div>
        </div>
      </div>
      <div className="order-detail-topbar-right item-detail-topbar-right menu-editor-footer">
          <Button className="btn btn-ghost item-detail-footer-btn" onClick={closeItemDetailModal} id="btn-item-detail-cancel">
            <span id="i18n-btn-item-detail-cancel">{t('btnItemCancel')}</span>
          </Button>
          <Button className="btn btn-primary item-detail-footer-btn" id="btn-item-detail-done" onClick={saveItemDetailModal}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            <span id="i18n-btn-item-detail-done">{t(create ? 'btnItemCreate' : 'btnDetailDone')}</span>
          </Button>
        </div>
    </div>
  );
}

let root: Root | undefined;
let view: FormView;
let tag = '';

function render() {
  root?.render(<ItemDetailForm {...view} tag={tag} />);
}

Object.assign(window, {
  PosItemDetailForm: {
    show(next: FormView) {
      const modal = document.getElementById('itemDetailModal');
      if (!modal) return;
      root ??= createRoot(modal);
      view = next;
      tag = '';
      flushSync(render);
    },
    setQuickTag(value: string) {
      tag = value;
      render();
    },
    refreshLanguage: render
  }
});
