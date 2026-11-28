import {
  canonicalMenuSnapshot as contractCanonicalMenuSnapshot,
  getMenuDeletions as contractGetMenuDeletions,
  normalizeBootstrapMenuCategories,
  serializeMenuData as contractSerializeMenuData
} from '@shared/contracts/menu-model';
import {
  clearBundleConfig,
  closeBundleEditorModal,
  computeEligibleItemsCount,
  openBundleEditorModal,
  renderBundleEligiblePreview,
  renderBundleEditorSidebar,
  renderBundleGroupConfigPanel,
  renderBundleSourcesSection,
  saveBundleConfig,
  selectBundleGroup,
  addBundleGroup,
  deleteBundleGroup,
  syncBundleCurrentGroupFromDOM,
  updateBundleGroupName,
  updateBundleGroupLabel,
  stepBundleQty,
  toggleBundleRepeat,
  switchBundleSourceTab,
  toggleBundleSourceCategory,
  toggleBundleSourceItem
} from './bundle-editor';
import {
  closeBundleWizard,
  comboSetGroupName,
  comboWizardAddGroup,
  comboWizardBack,
  comboWizardError,
  comboWizardField,
  comboWizardFilter,
  comboWizardGroupField,
  comboWizardImage,
  comboWizardItemValue,
  comboWizardJumpToStep,
  comboWizardNext,
  comboWizardPreviewPick,
  comboWizardRemoveGroup,
  comboWizardSearch,
  comboWizardTemplate,
  comboWizardToggleCategory,
  comboWizardToggleItem,
  dismissComboWizard,
  isComboItemSelected,
  openBundleWizard,
  persistComboWizard,
  renderBundleStepper,
  renderComboWizard,
  saveComboWizard
} from './bundle-wizard';
import {
  closeAllItemActionMenus,
  applyMenuItemFilters,
  deleteItemImage,
  duplicateMenuItemAt,
  getItemImageUrl,
  getStoreModifiersList,
  handleCreateComboFromSidebar,
  handleCreateCustomFromSidebar,
  handleImageSelect,
  handleMenuItemsSearch,
  isComboCategory,
  isModifierAppliedToCategory,
  moveMenuItem,
  openImageModal,
  openMenuItemFromCard,
  readMenuImageAsWebp,
  removeMenuItemAt,
  renderMenuCategories,
  renderMenuCategoryEditor,
  selectAllCategoryModifiers,
  selectMenuCatalogCategory,
  setCategoryAvailabilityMode,
  setMenuItemFilter,
  setMenuSidebarTab,
  toggleCategoryHideWhenUnavailable,
  toggleCategoryModifierItem,
  toggleCategoryModifierSelectAll,
  toggleCategoryModifiersCollapse,
  toggleCategoryShiftId,
  toggleMenuSectionCollapse,
  uploadDirectItemImage,
  uploadImage
} from './catalog-editor';
import {
  captureMenuDisplayOrder,
  closeAddCategoryModal,
  closeCategoriesManager,
  commitMenuDisplayRanks,
  confirmAddCategory,
  deleteActiveCategory,
  deleteCategoryAtIndex,
  formatPlusBtnText,
  getMenuDisplayEntries,
  getMenuOrderGroups,
  handleMenuCreateClick,
  handleSelectCreateType,
  onAddCategoryTypeChange,
  openAddCategoryModal,
  openCategoriesManager,
  openCreationTypeModal,
  closeCreationTypeModal,
  promptRenameCategory,
  promptRenameCategoryAtIndex,
  renderCategoriesManagerView,
  revertCategoriesDisplayOrder,
  updateAddCategoryViewport
} from './categories-manager';
import {
  addCustomizationGroup,
  addCustomizationOption,
  addItemModifierGroup,
  addItemModifierOption,
  applyNewGroupQuickChip,
  cancelNewCustomizationGroup,
  cancelRenameCustomizationGroup,
  closeItemModifiersModal,
  closeModifierLibraryModal,
  filterItemModifierCards,
  getInheritedItemModifierGroups,
  getModifierCategorySelectionState,
  goToCustomizationTabFromItemModal,
  openItemModifiersModal,
  openModifierLibraryModal,
  openNewCustomGroupCreator,
  promptAddSubOptionChip,
  removeCustomizationGroup,
  removeCustomizationOption,
  removeItemModifierGroup,
  removeItemModifierOption,
  removeSubOptionChip,
  renameCustomizationGroup,
  renderItemModifiersEditor,
  renderOrderCustomizationEditor,
  saveItemModifiersModal,
  saveNewCustomizationGroup,
  saveRenameCustomizationGroup,
  selectAllItemModifiers,
  setCustomizationGroupScope,
  setItemModifierFilter,
  setNewCustomGroupScope,
  setNewGroupType,
  startRenameCustomizationGroup,
  syncCategoryCheckboxIndeterminateState,
  syncItemModifiersFromDOM,
  toggleCustomizationGroupRequired,
  toggleCustomizationGroupType,
  toggleGroupAppliedCategory,
  toggleGroupAppliedItem,
  toggleItemModifierCardSelection,
  toggleItemModifierGroupRequired,
  toggleNewGroupAppliedCategory,
  toggleNewGroupRequired,
  updateItemModifiersToolbarCounts
} from './customizations-legacy';
import {
  autoCommitItemDetailFields,
  checkItemDetailImage,
  closeItemDetailModal,
  deleteItemDetailPhoto,
  formatMenuI18nSectionTitle,
  getActiveMenuTargetLocales,
  handleItemDetailImageSelect,
  handleQuickTagClick,
  openCreateItemModal,
  openItemDetailModal,
  populateItemDetailI18nInputs,
  readItemDetailI18nInputs,
  renderQuickTags,
  saveItemDetailModal,
  setAiTranslateButtonLoading,
  showItemDetailForm,
  transitionToSubEditor,
  translateItemDetailWithAI,
  translateMissingMenuWithAI,
  triggerItemDetailPhotoUpload,
  updateItemDetailPhoto,
  updateMenuAiTranslateVisibility
} from './item-detail';
import { installMenuStateAccessors, menuState } from './state';
import {
  applySavedStockStatus,
  chooseStockStatus,
  closeStockModal,
  handleStockDurationChange,
  openStockModal,
  openStockModalForCustomization,
  readStockChoice,
  saveStockStatus,
  setStockError,
  showStockDrawer,
  stockChoiceKey,
  stockTomorrowDate,
  updateStockSaveState
} from './stock-drawer';
import { getHostTargets, invokeHook } from './types';
import { registerGlobalFunctions } from './types';
import {
  _menuApiFetch,
  acknowledgeMenuScheduleSave,
  canonicalMenuSnapshot,
  checkMenuDirty,
  clearMenuDirty,
  confirmLeaveMenu,
  fetchMenuData,
  getMenuDeletions,
  getMenuModel,
  isCustomizationCategory,
  loadMenuData,
  markMenuDirty,
  openMenuSettings,
  pruneSavedMenuShiftAssignments,
  saveMenuData,
  serializeMenuData,
  setMenuLoading,
  setMenuMobileView,
  syncMenuDataFromDOM,
  syncMenuScheduleEntryButtonVisibility,
  updateMenuMobileNavButtons,
  updateMenuSaveState,
  updateMenuWorkspace
} from './workspace';

function installMenuEditorModel(): void {
  const modelApi = {
    canonicalMenuSnapshot: contractCanonicalMenuSnapshot,
    serializeMenuData: contractSerializeMenuData,
    getMenuDeletions: contractGetMenuDeletions,
    normalizeBootstrapMenuCategories
  };
  for (const target of getHostTargets()) {
    if (!target.MenuEditorModel) {
      target.MenuEditorModel = modelApi;
    }
  }
}

function installGlobalMenuListeners(): void {
  const flagKey = '__benmiPosMenuListenersInstalled';
  const g = globalThis as Record<string, unknown>;
  if (g[flagKey]) return;
  g[flagKey] = true;

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', event => {
      document.querySelectorAll<HTMLDetailsElement>('.menu-help[open]').forEach(help => {
        if (!help.contains(event.target as Node | null)) help.open = false;
      });
      const itemDetailModalEl = document.getElementById('itemDetailModal');
      if (itemDetailModalEl && event.target === itemDetailModalEl) {
        closeItemDetailModal();
      }
      const itemModModalEl = document.getElementById('itemModifiersModal');
      if (itemModModalEl && event.target === itemModModalEl) {
        closeItemModifiersModal();
      }
      const bundleModalEl = document.getElementById('modal-bundle-editor');
      if (bundleModalEl && event.target === bundleModalEl) {
        closeBundleEditorModal();
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeAllItemActionMenus();
        document.querySelectorAll<HTMLDetailsElement>('.menu-help[open]').forEach(help => {
          help.open = false;
        });
        const itemDetail = document.getElementById('itemDetailModal');
        if (itemDetail && itemDetail.style.display !== 'none') {
          closeItemDetailModal();
          return;
        }
        const itemMods = document.getElementById('itemModifiersModal');
        if (itemMods && itemMods.style.display !== 'none') {
          closeItemModifiersModal();
          return;
        }
        const bundleEditor = document.getElementById('modal-bundle-editor');
        if (bundleEditor && bundleEditor.style.display !== 'none') {
          closeBundleEditorModal();
        }
      }
    });

    document.addEventListener(
      'keydown',
      event => {
        const modal = document.getElementById('stockModal');
        if (!modal || modal.style.display !== 'flex') return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeStockModal();
        } else if (event.key === 'Tab') {
          const controls = [
            ...modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"])')
          ].filter(control => control.getClientRects().length);
          if (!controls.length) {
            event.preventDefault();
            return;
          }
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      },
      true
    );

    document.addEventListener(
      'toggle',
      event => {
        const help = event.target as (HTMLDetailsElement & { matches?: (sel: string) => boolean }) | null;
        if (!help?.matches?.('.menu-help') || !help.open) return;
        const text = help.querySelector<HTMLElement>('.menu-help-text');
        if (!text) return;
        const anchor = help.getBoundingClientRect();
        text.style.right = 'auto';
        text.style.maxWidth = `${window.innerWidth - 24}px`;
        text.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - text.offsetWidth - 12))}px`;
        text.style.top = `${Math.max(12, Math.min(anchor.bottom, window.innerHeight - text.offsetHeight - 12))}px`;
      },
      true
    );
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', event => {
      invokeHook('checkMenuDirty', checkMenuDirty);
      if (!menuState.isMenuDirty && !menuState.isMenuSaving && !menuState.isStockSaving) return;
      event.preventDefault();
      event.returnValue = '';
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateAddCategoryViewport);
      window.visualViewport.addEventListener('scroll', updateAddCategoryViewport);
    }
  }
}

export function installPosMenuApp(): void {
  installMenuEditorModel();
  installMenuStateAccessors();
  installGlobalMenuListeners();

  registerGlobalFunctions({
    // Workspace, lifecycle & snapshot helpers
    updateMenuWorkspace: updateMenuWorkspace as (...args: never[]) => unknown,
    setMenuMobileView: setMenuMobileView as (...args: never[]) => unknown,
    updateMenuMobileNavButtons: updateMenuMobileNavButtons as (...args: never[]) => unknown,
    updateMenuSaveState: updateMenuSaveState as (...args: never[]) => unknown,
    getMenuModel: getMenuModel as (...args: never[]) => unknown,
    canonicalMenuSnapshot: canonicalMenuSnapshot as (...args: never[]) => unknown,
    checkMenuDirty: checkMenuDirty as (...args: never[]) => unknown,
    markMenuDirty: markMenuDirty as (...args: never[]) => unknown,
    clearMenuDirty: clearMenuDirty as (...args: never[]) => unknown,
    acknowledgeMenuScheduleSave: acknowledgeMenuScheduleSave as (...args: never[]) => unknown,
    pruneSavedMenuShiftAssignments: pruneSavedMenuShiftAssignments as (...args: never[]) => unknown,
    confirmLeaveMenu: confirmLeaveMenu as (...args: never[]) => unknown,
    openMenuSettings: openMenuSettings as (...args: never[]) => unknown,
    setMenuLoading: setMenuLoading as (...args: never[]) => unknown,
    _menuApiFetch: _menuApiFetch as (...args: never[]) => unknown,
    loadMenuData: loadMenuData as (...args: never[]) => unknown,
    fetchMenuData: fetchMenuData as (...args: never[]) => unknown,
    syncMenuDataFromDOM: syncMenuDataFromDOM as (...args: never[]) => unknown,
    serializeMenuData: serializeMenuData as (...args: never[]) => unknown,
    getMenuDeletions: getMenuDeletions as (...args: never[]) => unknown,
    saveMenuData: saveMenuData as (...args: never[]) => unknown,
    syncMenuScheduleEntryButtonVisibility: syncMenuScheduleEntryButtonVisibility as (...args: never[]) => unknown,
    isCustomizationCategory: isCustomizationCategory as (...args: never[]) => unknown,

    // Categories, display order & creation modals
    formatPlusBtnText: formatPlusBtnText as (...args: never[]) => unknown,
    getMenuOrderGroups: getMenuOrderGroups as (...args: never[]) => unknown,
    getMenuDisplayEntries: getMenuDisplayEntries as (...args: never[]) => unknown,
    commitMenuDisplayRanks: commitMenuDisplayRanks as (...args: never[]) => unknown,
    captureMenuDisplayOrder: captureMenuDisplayOrder as (...args: never[]) => unknown,
    openCategoriesManager: openCategoriesManager as (...args: never[]) => unknown,
    revertCategoriesDisplayOrder: revertCategoriesDisplayOrder as (...args: never[]) => unknown,
    closeCategoriesManager: closeCategoriesManager as (...args: never[]) => unknown,
    renderCategoriesManagerView: renderCategoriesManagerView as (...args: never[]) => unknown,
    openAddCategoryModal: openAddCategoryModal as (...args: never[]) => unknown,
    updateAddCategoryViewport: updateAddCategoryViewport as (...args: never[]) => unknown,
    onAddCategoryTypeChange: onAddCategoryTypeChange as (...args: never[]) => unknown,
    closeAddCategoryModal: closeAddCategoryModal as (...args: never[]) => unknown,
    confirmAddCategory: confirmAddCategory as (...args: never[]) => unknown,
    promptRenameCategoryAtIndex: promptRenameCategoryAtIndex as (...args: never[]) => unknown,
    deleteCategoryAtIndex: deleteCategoryAtIndex as (...args: never[]) => unknown,
    promptRenameCategory: promptRenameCategory as (...args: never[]) => unknown,
    deleteActiveCategory: deleteActiveCategory as (...args: never[]) => unknown,
    openCreationTypeModal: openCreationTypeModal as (...args: never[]) => unknown,
    closeCreationTypeModal: closeCreationTypeModal as (...args: never[]) => unknown,
    handleMenuCreateClick: handleMenuCreateClick as (...args: never[]) => unknown,
    handleSelectCreateType: handleSelectCreateType as (...args: never[]) => unknown,

    // Catalog, categories sidebar & image editor
    moveMenuItem: moveMenuItem as (...args: never[]) => unknown,
    toggleMenuSectionCollapse: toggleMenuSectionCollapse as (...args: never[]) => unknown,
    isComboCategory: isComboCategory as (...args: never[]) => unknown,
    setMenuSidebarTab: setMenuSidebarTab as (...args: never[]) => unknown,
    handleCreateComboFromSidebar: handleCreateComboFromSidebar as (...args: never[]) => unknown,
    handleCreateCustomFromSidebar: handleCreateCustomFromSidebar as (...args: never[]) => unknown,
    selectMenuCatalogCategory: selectMenuCatalogCategory as (...args: never[]) => unknown,
    renderMenuCategories: renderMenuCategories as (...args: never[]) => unknown,
    getItemImageUrl: getItemImageUrl as (...args: never[]) => unknown,
    isModifierAppliedToCategory: isModifierAppliedToCategory as (...args: never[]) => unknown,
    getStoreModifiersList: getStoreModifiersList as (...args: never[]) => unknown,
    toggleCategoryModifiersCollapse: toggleCategoryModifiersCollapse as (...args: never[]) => unknown,
    toggleCategoryModifierSelectAll: toggleCategoryModifierSelectAll as (...args: never[]) => unknown,
    readMenuImageAsWebp: readMenuImageAsWebp as (...args: never[]) => unknown,
    uploadDirectItemImage: uploadDirectItemImage as (...args: never[]) => unknown,
    closeAllItemActionMenus: closeAllItemActionMenus as (...args: never[]) => unknown,
    duplicateMenuItemAt: duplicateMenuItemAt as (...args: never[]) => unknown,
    openMenuItemFromCard: openMenuItemFromCard as (...args: never[]) => unknown,
    handleMenuItemsSearch: handleMenuItemsSearch as (...args: never[]) => unknown,
    setMenuItemFilter: setMenuItemFilter as (...args: never[]) => unknown,
    applyMenuItemFilters: applyMenuItemFilters as (...args: never[]) => unknown,
    renderMenuCategoryEditor: renderMenuCategoryEditor as (...args: never[]) => unknown,
    removeMenuItemAt: removeMenuItemAt as (...args: never[]) => unknown,
    toggleCategoryModifierItem: toggleCategoryModifierItem as (...args: never[]) => unknown,
    setCategoryAvailabilityMode: setCategoryAvailabilityMode as (...args: never[]) => unknown,
    toggleCategoryShiftId: toggleCategoryShiftId as (...args: never[]) => unknown,
    toggleCategoryHideWhenUnavailable: toggleCategoryHideWhenUnavailable as (...args: never[]) => unknown,
    selectAllCategoryModifiers: selectAllCategoryModifiers as (...args: never[]) => unknown,
    openImageModal: openImageModal as (...args: never[]) => unknown,
    handleImageSelect: handleImageSelect as (...args: never[]) => unknown,
    uploadImage: uploadImage as (...args: never[]) => unknown,
    deleteItemImage: deleteItemDetailPhotoAlias(deleteItemImage),

    // Legacy customizations & item modifier hub
    renderOrderCustomizationEditor: renderOrderCustomizationEditor as (...args: never[]) => unknown,
    openNewCustomGroupCreator: openNewCustomGroupCreator as (...args: never[]) => unknown,
    cancelNewCustomizationGroup: cancelNewCustomizationGroup as (...args: never[]) => unknown,
    setNewGroupType: setNewGroupType as (...args: never[]) => unknown,
    setNewCustomGroupScope: setNewCustomGroupScope as (...args: never[]) => unknown,
    toggleNewGroupAppliedCategory: toggleNewGroupAppliedCategory as (...args: never[]) => unknown,
    setCustomizationGroupScope: setCustomizationGroupScope as (...args: never[]) => unknown,
    toggleGroupAppliedCategory: toggleGroupAppliedCategory as (...args: never[]) => unknown,
    toggleGroupAppliedItem: toggleGroupAppliedItem as (...args: never[]) => unknown,
    toggleNewGroupRequired: toggleNewGroupRequired as (...args: never[]) => unknown,
    applyNewGroupQuickChip: applyNewGroupQuickChip as (...args: never[]) => unknown,
    saveNewCustomizationGroup: saveNewCustomizationGroup as (...args: never[]) => unknown,
    addCustomizationGroup: addCustomizationGroup as (...args: never[]) => unknown,
    startRenameCustomizationGroup: startRenameCustomizationGroup as (...args: never[]) => unknown,
    saveRenameCustomizationGroup: saveRenameCustomizationGroup as (...args: never[]) => unknown,
    cancelRenameCustomizationGroup: cancelRenameCustomizationGroup as (...args: never[]) => unknown,
    renameCustomizationGroup: renameCustomizationGroup as (...args: never[]) => unknown,
    toggleCustomizationGroupType: toggleCustomizationGroupType as (...args: never[]) => unknown,
    toggleCustomizationGroupRequired: toggleCustomizationGroupRequired as (...args: never[]) => unknown,
    removeCustomizationGroup: removeCustomizationGroup as (...args: never[]) => unknown,
    promptAddSubOptionChip: promptAddSubOptionChip as (...args: never[]) => unknown,
    removeSubOptionChip: removeSubOptionChip as (...args: never[]) => unknown,
    addCustomizationOption: addCustomizationOption as (...args: never[]) => unknown,
    removeCustomizationOption: removeCustomizationOption as (...args: never[]) => unknown,
    getInheritedItemModifierGroups: getInheritedItemModifierGroups as (...args: never[]) => unknown,
    getModifierCategorySelectionState: getModifierCategorySelectionState as (...args: never[]) => unknown,
    syncCategoryCheckboxIndeterminateState: syncCategoryCheckboxIndeterminateState as (...args: never[]) => unknown,
    openItemModifiersModal: openItemModifiersModal as (...args: never[]) => unknown,
    closeItemModifiersModal: closeItemModifiersModal as (...args: never[]) => unknown,
    syncItemModifiersFromDOM: syncItemModifiersFromDOM as (...args: never[]) => unknown,
    goToCustomizationTabFromItemModal: goToCustomizationTabFromItemModal as (...args: never[]) => unknown,
    updateItemModifiersToolbarCounts: updateItemModifiersToolbarCounts as (...args: never[]) => unknown,
    selectAllItemModifiers: selectAllItemModifiers as (...args: never[]) => unknown,
    filterItemModifierCards: filterItemModifierCards as (...args: never[]) => unknown,
    setItemModifierFilter: setItemModifierFilter as (...args: never[]) => unknown,
    toggleItemModifierCardSelection: toggleItemModifierCardSelection as (...args: never[]) => unknown,
    toggleItemModifierGroupRequired: toggleItemModifierGroupRequired as (...args: never[]) => unknown,
    renderItemModifiersEditor: renderItemModifiersEditor as (...args: never[]) => unknown,
    addItemModifierGroup: addItemModifierGroup as (...args: never[]) => unknown,
    removeItemModifierGroup: removeItemModifierGroup as (...args: never[]) => unknown,
    addItemModifierOption: addItemModifierOption as (...args: never[]) => unknown,
    removeItemModifierOption: removeItemModifierOption as (...args: never[]) => unknown,
    saveItemModifiersModal: saveItemModifiersModal as (...args: never[]) => unknown,
    openModifierLibraryModal: openModifierLibraryModal as (...args: never[]) => unknown,
    closeModifierLibraryModal: closeModifierLibraryModal as (...args: never[]) => unknown,

    // Stock drawer
    stockTomorrowDate: stockTomorrowDate as (...args: never[]) => unknown,
    stockChoiceKey: stockChoiceKey as (...args: never[]) => unknown,
    readStockChoice: readStockChoice as (...args: never[]) => unknown,
    setStockError: setStockError as (...args: never[]) => unknown,
    showStockDrawer: showStockDrawer as (...args: never[]) => unknown,
    applySavedStockStatus: applySavedStockStatus as (...args: never[]) => unknown,
    openStockModal: openStockModal as (...args: never[]) => unknown,
    openStockModalForCustomization: openStockModalForCustomization as (...args: never[]) => unknown,
    closeStockModal: closeStockModal as (...args: never[]) => unknown,
    chooseStockStatus: chooseStockStatus as (...args: never[]) => unknown,
    handleStockDurationChange: handleStockDurationChange as (...args: never[]) => unknown,
    saveStockStatus: saveStockStatus as (...args: never[]) => unknown,
    updateStockSaveState: updateStockSaveState as (...args: never[]) => unknown,

    // Bundle editor
    openBundleEditorModal: openBundleEditorModal as (...args: never[]) => unknown,
    closeBundleEditorModal: closeBundleEditorModal as (...args: never[]) => unknown,
    syncBundleCurrentGroupFromDOM: syncBundleCurrentGroupFromDOM as (...args: never[]) => unknown,
    renderBundleEditorSidebar: renderBundleEditorSidebar as (...args: never[]) => unknown,
    computeEligibleItemsCount: computeEligibleItemsCount as (...args: never[]) => unknown,
    renderBundleEligiblePreview: renderBundleEligiblePreview as (...args: never[]) => unknown,
    renderBundleSourcesSection: renderBundleSourcesSection as (...args: never[]) => unknown,
    renderBundleGroupConfigPanel: renderBundleGroupConfigPanel as (...args: never[]) => unknown,
    selectBundleGroup: selectBundleGroup as (...args: never[]) => unknown,
    addBundleGroup: addBundleGroup as (...args: never[]) => unknown,
    deleteBundleGroup: deleteBundleGroup as (...args: never[]) => unknown,
    updateBundleGroupName: updateBundleGroupName as (...args: never[]) => unknown,
    updateBundleGroupLabel: updateBundleGroupLabel as (...args: never[]) => unknown,
    stepBundleQty: stepBundleQty as (...args: never[]) => unknown,
    toggleBundleRepeat: toggleBundleRepeat as (...args: never[]) => unknown,
    switchBundleSourceTab: switchBundleSourceTab as (...args: never[]) => unknown,
    toggleBundleSourceCategory: toggleBundleSourceCategory as (...args: never[]) => unknown,
    toggleBundleSourceItem: toggleBundleSourceItem as (...args: never[]) => unknown,
    saveBundleConfig: saveBundleConfig as (...args: never[]) => unknown,
    clearBundleConfig: clearBundleConfig as (...args: never[]) => unknown,

    // Bundle wizard (+ legacy HTML onclick aliases)
    isComboItemSelected: isComboItemSelected as (...args: never[]) => unknown,
    comboSetGroupName: comboSetGroupName as (...args: never[]) => unknown,
    persistComboWizard: persistComboWizard as (...args: never[]) => unknown,
    openBundleWizard: openBundleWizard as (...args: never[]) => unknown,
    closeBundleWizard: closeBundleWizard as (...args: never[]) => unknown,
    dismissComboWizard: dismissComboWizard as (...args: never[]) => unknown,
    comboWizardBack: comboWizardBack as (...args: never[]) => unknown,
    bundleWizardBack: comboWizardBack as (...args: never[]) => unknown,
    comboWizardField: comboWizardField as (...args: never[]) => unknown,
    comboWizardImage: comboWizardImage as (...args: never[]) => unknown,
    comboWizardGroupField: comboWizardGroupField as (...args: never[]) => unknown,
    comboWizardTemplate: comboWizardTemplate as (...args: never[]) => unknown,
    comboWizardAddGroup: comboWizardAddGroup as (...args: never[]) => unknown,
    comboWizardRemoveGroup: comboWizardRemoveGroup as (...args: never[]) => unknown,
    comboWizardToggleItem: comboWizardToggleItem as (...args: never[]) => unknown,
    comboWizardToggleCategory: comboWizardToggleCategory as (...args: never[]) => unknown,
    comboWizardItemValue: comboWizardItemValue as (...args: never[]) => unknown,
    comboWizardSearch: comboWizardSearch as (...args: never[]) => unknown,
    comboWizardFilter: comboWizardFilter as (...args: never[]) => unknown,
    comboWizardPreviewPick: comboWizardPreviewPick as (...args: never[]) => unknown,
    comboWizardError: comboWizardError as (...args: never[]) => unknown,
    comboWizardNext: comboWizardNext as (...args: never[]) => unknown,
    bundleWizardNext: comboWizardNext as (...args: never[]) => unknown,
    renderComboWizard: renderComboWizard as (...args: never[]) => unknown,
    saveComboWizard: saveComboWizard as (...args: never[]) => unknown,
    comboWizardJumpToStep: comboWizardJumpToStep as (...args: never[]) => unknown,
    renderBundleStepper: renderBundleStepper as (...args: never[]) => unknown,

    // Item detail modal & AI translations
    updateItemDetailPhoto: updateItemDetailPhoto as (...args: never[]) => unknown,
    checkItemDetailImage: checkItemDetailImage as (...args: never[]) => unknown,
    triggerItemDetailPhotoUpload: triggerItemDetailPhotoUpload as (...args: never[]) => unknown,
    handleItemDetailImageSelect: handleItemDetailImageSelect as (...args: never[]) => unknown,
    deleteItemDetailPhoto: deleteItemDetailPhoto as (...args: never[]) => unknown,
    renderQuickTags: renderQuickTags as (...args: never[]) => unknown,
    handleQuickTagClick: handleQuickTagClick as (...args: never[]) => unknown,
    getActiveMenuTargetLocales: getActiveMenuTargetLocales as (...args: never[]) => unknown,
    formatMenuI18nSectionTitle: formatMenuI18nSectionTitle as (...args: never[]) => unknown,
    updateMenuAiTranslateVisibility: updateMenuAiTranslateVisibility as (...args: never[]) => unknown,
    populateItemDetailI18nInputs: populateItemDetailI18nInputs as (...args: never[]) => unknown,
    readItemDetailI18nInputs: readItemDetailI18nInputs as (...args: never[]) => unknown,
    autoCommitItemDetailFields: autoCommitItemDetailFields as (...args: never[]) => unknown,
    setAiTranslateButtonLoading: setAiTranslateButtonLoading as (...args: never[]) => unknown,
    showItemDetailForm: showItemDetailForm as (...args: never[]) => unknown,
    openCreateItemModal: openCreateItemModal as (...args: never[]) => unknown,
    openItemDetailModal: openItemDetailModal as (...args: never[]) => unknown,
    closeItemDetailModal: closeItemDetailModal as (...args: never[]) => unknown,
    saveItemDetailModal: saveItemDetailModal as (...args: never[]) => unknown,
    transitionToSubEditor: transitionToSubEditor as (...args: never[]) => unknown,
    translateItemDetailWithAI: translateItemDetailWithAI as (...args: never[]) => unknown,
    translateMissingMenuWithAI: translateMissingMenuWithAI as (...args: never[]) => unknown
  });
}

function deleteItemDetailPhotoAlias(fn: () => Promise<void>): (...args: never[]) => unknown {
  return fn as (...args: never[]) => unknown;
}

installPosMenuApp();
