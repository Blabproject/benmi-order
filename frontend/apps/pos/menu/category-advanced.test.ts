import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translatePos, type PosTranslationKey } from '@shared/i18n/pos-dictionary';
import { menuState } from './state';
import {
  closeCategoryAdvancedSettings,
  openCategoryAdvancedSettings,
  renderMenuCategoryEditor,
  setCategoryPrerequisiteMode,
  toggleCategoryPrerequisiteTarget
} from './catalog-editor';

const MENU_WORKSPACE_FIXTURE = `
  <div class="content" id="view-menu">
    <div id="menu-workspace-heading">
      <button type="button" id="btn-menu-save"></button><span id="btn-menu-save-text"></span>
    </div>
    <div id="menu-standard-workspace">
      <div id="menu-categories"></div>
      <div id="menu-editor-panel">
        <div class="panel-header menu-editor-header">
          <div class="menu-editor-title-group">
            <div id="menu-editor-title"></div>
            <div id="cat-title-actions">
              <button type="button" id="btn-category-rename"></button>
              <button type="button" id="btn-category-delete"></button>
            </div>
          </div>
          <div class="menu-header-actions">
            <button type="button" id="btn-category-advanced-settings" hidden>
              <span id="i18n-btn-cat-advanced-text"></span>
              <span id="btn-category-advanced-count" hidden>0</span>
            </button>
            <button type="button" id="btn-menu-create-unified" hidden>
              <span id="i18n-btn-create-unified-text"></span>
            </button>
            <button type="button" id="btn-menu-add-cat-top"></button>
            <button type="button" id="btn-menu-manage-close"></button>
          </div>
        </div>
        <div id="menu-editor-toolbar"></div>
        <div id="menu-editor-body"></div>
        <div id="menu-editor-footer"></div>
      </div>
    </div>
    <section id="menu-display-order-screen" hidden></section>
    <section id="menu-category-advanced-screen" hidden>
      <button type="button" id="btn-menu-cat-adv-back"><span id="btn-menu-cat-adv-back-text"></span></button>
      <h2 id="menu-cat-adv-title"></h2>
      <span id="menu-cat-adv-rule-pill" hidden></span>
      <span id="menu-cat-adv-bc-menu"></span>
      <span id="menu-cat-adv-cat-name"></span>
      <div id="menu-cat-adv-save-status"><span id="menu-cat-adv-save-status-text"></span></div>
      <button type="button" id="btn-menu-cat-adv-save" disabled><span id="btn-menu-cat-adv-save-text"></span></button>
      <div id="menu-category-advanced-body"></div>
    </section>
  </div>
`;

describe('POS Category Advanced Settings sub-page', () => {
  beforeEach(() => {
    document.body.innerHTML = MENU_WORKSPACE_FIXTURE;
    (window as unknown as Record<string, unknown>).currentLang = 'vi';
    (window as unknown as Record<string, unknown>).t = (key: string, params?: Record<string, string | number>) => {
      try {
        const res = translatePos('vi', key as PosTranslationKey, params);
        if (res !== undefined) return res;
      } catch {
        // fallback for keys defined only in legacy orders-i18n.js
      }
      return key;
    };
    (window as unknown as Record<string, unknown>).MenuCatalogLists = {
      clearProducts: vi.fn(),
      renderProducts: vi.fn(),
      clearCategories: vi.fn(),
      renderCategories: vi.fn()
    };

    menuState.isMenuLoadedCompletely = true;
    menuState.isMenuSaving = false;
    menuState.isStockSaving = false;
    menuState.isMenuDirty = false;
    menuState.isCategoryManagerOpen = false;
    menuState.isCategoryAdvancedOpen = false;
    menuState.menuSidebarTab = 'products';
    menuState.activeCategoryIndex = 1;
    menuState.currentMenuData = [
      {
        id: 'cat_qqm_main',
        title: '主食與湯品',
        slug: 'main-items',
        type: 'catalog',
        items: [{ id: 'qqm_mn_09', name: '麻辣鴨血', price: 90 }]
      },
      {
        id: 'cat_qqm_addons',
        title: '加點項目',
        slug: 'add-ons',
        type: 'catalog',
        prerequisiteMode: 'require_any',
        prerequisiteItemIds: ['qqm_mn_09'],
        prerequisiteCategoryIds: [],
        items: [
          { id: 'qqm_ad_01', name: '豆腐', price: 25 },
          { id: 'qqm_ad_10', name: '滷蛋', price: 15, prerequisiteMode: 'none' }
        ]
      }
    ];
    menuState.savedMenuSnapshot = JSON.stringify(menuState.currentMenuData);
  });

  it('moves prerequisite card off item list behind header button next to Add Item and opens dedicated sub-page', () => {
    renderMenuCategoryEditor(1);

    const advBtn = document.getElementById('btn-category-advanced-settings') as HTMLButtonElement;
    const addBtn = document.getElementById('btn-menu-create-unified') as HTMLButtonElement;
    const countBadge = document.getElementById('btn-category-advanced-count') as HTMLElement;
    const editorBody = document.getElementById('menu-editor-body') as HTMLElement;

    expect(advBtn.hidden).toBe(false);
    expect(advBtn.style.display).toBe('inline-flex');
    expect(advBtn.classList.contains('has-active-rules')).toBe(true);
    expect(countBadge.hidden).toBe(false);
    expect(countBadge.textContent).toBe('1');
    expect(advBtn.nextElementSibling?.id).toBe(addBtn.id);
    expect(editorBody.querySelector('.cust-category-prereq-card')).toBeNull();

    openCategoryAdvancedSettings(1);

    const heading = document.getElementById('menu-workspace-heading') as HTMLElement;
    const standardWorkspace = document.getElementById('menu-standard-workspace') as HTMLElement;
    const advScreen = document.getElementById('menu-category-advanced-screen') as HTMLElement;
    const advTitle = document.getElementById('menu-cat-adv-title') as HTMLElement;
    const advBody = document.getElementById('menu-category-advanced-body') as HTMLElement;

    expect(heading.hidden).toBe(true);
    expect(standardWorkspace.hidden).toBe(true);
    expect(advScreen.hidden).toBe(false);
    expect(advTitle.textContent).toContain('加點項目');
    expect(advBody.querySelector('.cust-category-prereq-card')).not.toBeNull();
    expect(advBody.querySelectorAll('.cust-prereq-chip.selected').length).toBe(1);
    expect(advBody.querySelectorAll('.menu-cat-adv-override-row').length).toBe(1);
    expect(advBody.textContent).toContain('滷蛋');

    toggleCategoryPrerequisiteTarget(1, 'category', 'cat_qqm_main', true);
    expect(menuState.currentMenuData?.[1]?.prerequisiteCategoryIds).toEqual(['cat_qqm_main']);
    const saveBtn = document.getElementById('btn-menu-cat-adv-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    setCategoryPrerequisiteMode(1, 'none');
    expect(menuState.currentMenuData?.[1]?.prerequisiteItemIds).toEqual([]);

    closeCategoryAdvancedSettings();
    expect(advScreen.hidden).toBe(true);
    expect(standardWorkspace.hidden).toBe(false);
    expect(advBtn.classList.contains('has-active-rules')).toBe(false);
    expect(countBadge.hidden).toBe(true);
  });
});
