import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { ChevronRightIcon, ModifyIcon, PlusIcon } from '@shared/ui/PosIcons';

type Translate = (key: string) => string;

interface CategoryListProps {
  categories: { index: number; title: string; itemCount: number; active: boolean; combo: boolean }[];
  t: Translate;
  onSelect: (index: number) => void;
  onAdd: () => void;
}

function CategoryList({ categories, t, onSelect, onAdd }: CategoryListProps) {
  return <>
    <button type="button" className="menu-add-option-group-btn" onClick={onAdd}>
      <PlusIcon size={14} /><span>{t('btnAddCatalogCategory')}</span>
    </button>
    {categories.map(({ index, title, itemCount, active, combo }) => (
      <button key={index} type="button" className={`menu-option-card${active ? ' active' : ''}`}
        aria-pressed={active} onClick={() => onSelect(index)}>
        <span className="menu-option-card-content">
          <span className="menu-option-card-title">{title}{combo && <span className="cat-type-badge cat-type-combo">{t('bundleBadge')}</span>}</span>
          <span className="menu-option-card-subtitle">{itemCount} {t('menuItemUnit')}</span>
        </span>
        <span className="menu-option-card-right">
          <span className="menu-option-card-badge">{itemCount}</span>
          <span className="menu-option-card-chevron"><ChevronRightIcon /></span>
        </span>
      </button>
    ))}
  </>;
}

interface ProductRow {
  name: string;
  price?: number | null;
  isOos?: boolean;
  staffOnly?: boolean;
  badge: string;
  bundleCount?: number;
  modifierCount: number;
  imageUrl: string | null;
}

interface ProductListProps {
  categoryIndex: number;
  rows: ProductRow[];
  inheritedCount: number;
  language: string;
  t: Translate;
  onEdit: (index: number) => void;
  onOpen: (event: MouseEvent | KeyboardEvent, index: number) => void;
  onDelete: (index: number) => void;
  onStock: (index: number) => void;
  onOptions: (index: number) => void;
  onBundle: (index: number) => void;
  onChange: () => void;
  onImageError: (src: string) => void;
  onUpload: (file: File, index: number) => Promise<string | null>;
}

function CameraIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
  </svg>;
}

function ProductThumbnail({ product, index, t, onEdit, onUpload, onImageError }: Pick<ProductListProps, 't' | 'onEdit' | 'onUpload' | 'onImageError'> & {
  product: ProductRow; index: number;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [src, setSource] = useState(product.imageUrl);

  async function upload(file?: File) {
    if (!file || uploading.current) return;
    uploading.current = true;
    setBusy(true);
    try {
      const image = await onUpload(file, index);
      if (image) setSource(image);
    } finally {
      uploading.current = false;
      setBusy(false);
    }
  }

  return <>
    <input ref={picker} type="file" accept="image/*" hidden onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      void upload(file);
    }} />
    <button type="button" className={`menu-item-thumb-box${src ? ' has-image' : ''}${dragging ? ' drag-over' : ''}`}
      data-item-thumb-idx={index} title={t('tooltipDropToUpload')} aria-label={`${t('btnItemImage')}: ${product.name}`}
      aria-busy={busy} disabled={busy} onClick={() => src ? onEdit(index) : picker.current?.click()}
      onDragOver={event => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        void upload(event.dataTransfer.files[0]);
      }}>
      {busy ? <div className="thumb-loading-spin" /> : src ? <>
        <img src={src} alt={product.name} className="menu-item-thumb-img" onError={() => {
          onImageError(src);
          setSource(null);
        }} />
        <div className="thumb-hover-overlay"><CameraIcon /></div>
      </> : <div className="menu-item-thumb-placeholder"><CameraIcon /><span className="thumb-upload-text">{t('menuUploadImage')}</span></div>}
    </button>
  </>;
}

function ProductList(props: ProductListProps) {
  const { categoryIndex, rows, inheritedCount, language, t } = props;
  if (!rows.length) return <div className="menu-category-empty"><p>{t('menuEmptyCategory')}</p></div>;

  return rows.map((product, index) => {
    const { name, price, isOos, staffOnly, badge, bundleCount, modifierCount } = product;
    const bundle = bundleCount !== undefined;
    const status = t(isOos ? 'stockStatusOutOfStock' : 'stockStatusInStock');
    const modifierText = modifierCount ? `${modifierCount} ${t('customItemModifiers')}`
      : inheritedCount ? `${inheritedCount} ${t('inheritedCatModifiers')}` : t('noModifiersApplied');
    const tooltip = bundle ? `${t('bundleBadge')} (${bundleCount}${language === 'vi' ? ' ' : ''}${t('bundleGroupUnit')})` : undefined;
    return <div key={index} className={`menu-item-row-card menu-catalog-row${bundle ? ' is-bundle-row' : ''}`}
      id={`menu-item-card-${categoryIndex}-${index}`} data-item-index={index} tabIndex={0} role="group"
      aria-label={`${t('itemDetailTitle')}: ${name}`} aria-keyshortcuts="Enter Space" title={tooltip}
      onClick={event => props.onOpen(event, index)} onKeyDown={event => props.onOpen(event, index)}>
      <div className="menu-item-row-left">
        <span className="menu-item-drag-handle" title={t('menuDragSort')} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 8h16M4 16h16" /></svg>
        </span>
        <ProductThumbnail product={product} index={index} t={t} onEdit={props.onEdit}
          onUpload={props.onUpload} onImageError={props.onImageError} />
        <div className="menu-item-details-col">
          <div className="menu-item-name-col">
            <input type="text" className="menu-item-name-input" defaultValue={name} data-name-cidx={categoryIndex} data-name-iidx={index}
              onInput={props.onChange} placeholder={t('newItemPlaceholder')} aria-label={t('colItemName')} />
          </div>
          <div className="menu-item-meta-col">
            {bundle && <span className="menu-combo-badge">{t('bundleBadge')}</span>}
            {staffOnly && <span className="menu-item-staff-only-badge">{t('staffOnlyBadge')}</span>}
            {badge && <span className="menu-item-quick-badge">{badge}</span>}
            <span className={`item-mod-pill ${modifierCount ? 'custom-mods' : inheritedCount ? 'inherited-mods' : 'empty-mods'}`} title={modifierText}>
              {modifierCount > 0 && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
              <span>{modifierText}</span>
            </span>
            <button type="button" id={`menu-item-options-${categoryIndex}-${index}`} className="menu-item-options-btn" onClick={() => props.onOptions(index)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m0 4v6m-6-8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v4m6-2a2 2 0 100 4m0-4a2 2 0 110 4m0-4V4m0 12v4" />
              </svg>
              <span>{t('btnItemModifiersShort') || t('btnItemModifiers')}</span>
              {modifierCount > 0 && <span className="opt-count-pill">{modifierCount}</span>}
            </button>
            {bundle && <button type="button" className="menu-item-options-btn" onClick={() => props.onBundle(index)}>{t('menuBundleSettings')}</button>}
          </div>
        </div>
      </div>
      <div className="menu-item-row-right">
        <div className="menu-item-price-block">
          <span className="menu-item-price-label">{t('menuPriceLabel')}</span>
          <div className="menu-item-price-wrapper">
            <span className="price-currency">$</span>
            <input type="number" className="menu-item-price-input" defaultValue={price ?? ''} data-cidx={categoryIndex} data-iidx={index}
              onInput={props.onChange} placeholder={t('priceHiddenPlaceholder')} aria-label={`${t('colPrice')}: ${name}`} />
          </div>
        </div>
        <div className="menu-item-status-block">
          <button type="button" className={`menu-item-stock-toggle ${isOos ? 'is-oos' : 'is-instock'}`}
            id={`menu-item-stock-${categoryIndex}-${index}`} aria-haspopup="dialog" aria-controls="stockModal"
            onClick={() => props.onStock(index)} title={status} aria-label={`${name}: ${status}`}>
            <span className="stock-toggle-dot" /><span>{status}</span>
          </button>
          <span className="stock-toggle-sub">{t(isOos ? 'menuPausedStatus' : 'menuServingStatus')}</span>
        </div>
        <div className="menu-item-quick-actions">
          <button type="button" className="menu-item-action-icon-btn" onClick={() => props.onEdit(index)} title={t('itemDetailTitle')} aria-label={t('itemDetailTitle')}>
            <ModifyIcon size={15} />
          </button>
          <button type="button" className="menu-item-action-icon-btn delete-btn" onClick={() => props.onDelete(index)} title={t('btnItemDelete')} aria-label={t('btnItemDelete')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>;
  });
}

let categoryRoot: Root | undefined;
let productRoot: Root | undefined;

Object.assign(window, {
  MenuCatalogLists: {
    clearCategories() {
      categoryRoot?.unmount();
      categoryRoot = undefined;
    },
    renderCategories(host: HTMLElement, props: CategoryListProps) {
      categoryRoot = createRoot(host);
      flushSync(() => categoryRoot?.render(<CategoryList {...props} />));
    },
    clearProducts() {
      productRoot?.unmount();
      productRoot = undefined;
    },
    renderProducts(host: HTMLElement, props: ProductListProps) {
      productRoot = createRoot(host);
      flushSync(() => productRoot?.render(<ProductList {...props} />));
    }
  }
});
