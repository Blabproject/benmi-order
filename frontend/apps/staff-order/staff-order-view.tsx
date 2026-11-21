import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { MouseEvent, ReactNode } from 'react';
import { Button } from '@shared/ui/button';
import { ModifyIcon } from '@shared/ui/PosIcons';
import { Cashier, CashierIcon } from './Cashier';
import { staffText as text, type StaffCartView, type StaffCatalogItem, type StaffCatalogSection, type StaffTableView } from './contracts';
import './staff-ui.css';

declare const StaffOrder: { start(): Promise<void> };
declare function updateQty(category: string, item: string, delta: number): void;
declare function editCartPortion(category: string, item: string, index: number): void;
declare function openImageLightbox(src: string): void;

function TableChips({ model, onSelect }: { model: StaffTableView; onSelect: (id: string) => void }) {
  return <>
    <Button className={`staff-chip${model.takeaway ? ' on' : ''}`} aria-pressed={model.takeaway} data-staff-chip="takeaway" onClick={() => onSelect('')}>
      {text('外帶', 'Mang đi')}
    </Button>
    {model.allowDine && model.tables.map(table => {
      const selected = !model.takeaway && model.selected === table.id;
      return <Button className={`staff-chip${selected ? ' on' : ''}`} aria-pressed={selected} data-staff-table={table.id}
        key={table.id} onClick={() => onSelect(table.id)}>
        {table.label}{table.active_order_key && <span className="staff-dot-occupied" title={text('使用中', 'Đang phục vụ')} />}
      </Button>;
    })}
  </>;
}

function CatalogCard({ category, item, onOptions }: { category: string; item: StaffCatalogItem; onOptions: () => void }) {
  const unavailable = item.soldOut || item.outsideSchedule;
  const id = `${category}-${item.name}`;
  const add = () => { if (!unavailable) updateQty(category, item.name, 1); };
  const onQuantity = (event: MouseEvent, delta: number) => {
    event.stopPropagation();
    if (!unavailable) updateQty(category, item.name, delta);
  };

  return <div id={`item-${id}`} className={`card${item.quantity > 0 ? ' staff-tile-has' : ''}`}
    style={unavailable ? { opacity: 0.65 } : undefined}>
    <div className="card-main" role="button" tabIndex={unavailable ? -1 : 0} aria-label={item.displayName}
      aria-disabled={unavailable || undefined} style={unavailable ? undefined : { cursor: 'pointer' }} onClick={add}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        add();
      }}>
      {item.image && <img className="item-img" src={item.image} alt={item.displayName} loading="lazy"
        onClick={event => { event.stopPropagation(); openImageLightbox(event.currentTarget.src); }}
        onError={event => { event.currentTarget.hidden = true; }} />}
      <div className="card-info">
        <div><div className="card-title">{item.displayName}</div></div>
        <div className="card-footer">
          <div className="card-price">${item.price}</div>
          {unavailable ? <div className={item.soldOut ? 'staff-item-unavailable is-sold-out' : 'staff-item-unavailable'}>
            {item.unavailableLabel}{!item.soldOut && item.schedule && <div>{item.schedule}</div>}
          </div> : <>
            <div className="qty-control">
              <Button className="btn-qty" onClick={event => onQuantity(event, -1)} aria-label={text('減少', 'Giảm số lượng')}>−</Button>
              <span className="qty-text" id={`qty-${id}`}>{item.quantity}</span>
              <Button className="btn-qty" onClick={event => onQuantity(event, 1)} aria-label={text('增加', 'Tăng số lượng')}>+</Button>
            </div>
            {item.required && <span className="staff-tile-req">{text('必選', 'Bắt buộc')}</span>}
          </>}
        </div>
      </div>
    </div>
    {(item.badge || item.limit) && <div className="staff-tile-badges">
      {item.badge && <span className="badge" title={item.badge}>{item.badge}</span>}
      {item.limit && <span className="badge badge-limit" title={item.limit}>{item.limit}</span>}
    </div>}
    {item.quantity > 0 && <span className="staff-tile-qty">×{item.quantity}</span>}
    {!unavailable && item.optional && <Button className="staff-tile-opt-btn"
      aria-label={`${text('選項', 'Tùy chọn')} - ${item.displayName}`} onClick={onOptions}>
      <ModifyIcon size={13} /><span className="staff-tile-opt-label">{text('選項', 'Tùy chọn')}</span>
    </Button>}
    <div id={`combo-container-${id}`} />
  </div>;
}

function Catalog({ sections, active, onOptions }: {
  sections: StaffCatalogSection[]; active: string; onOptions: (category: string, item: string) => void;
}) {
  return <>{sections.map(section => <section id={section.id} key={section.id}
    className={`section-container${section.id === active ? '' : ' staff-tab-hidden'}`}>
    {section.slug && <>
      <div className="section-title">
        <span>{section.title}</span>
        {section.promo && <span className="staff-category-promo">{section.promo}</span>}
        {section.schedule && <span className={`staff-category-schedule${section.outsideSchedule ? ' is-outside' : ''}`}>{section.schedule}</span>}
      </div>
      <div className="grid" id={`grid-${section.slug}`}>
        {section.items?.map(item => <CatalogCard key={item.name} category={section.slug!} item={item}
          onOptions={() => onOptions(section.slug!, item.name)} />)}
      </div>
    </>}
  </section>)}</>;
}

function Cart({ model }: { model: StaffCartView }) {
  if (!model.rows.length) return <div className="staff-cart-empty">{text('點擊左側餐點加入購物車', 'Chạm món bên trái để thêm')}</div>;
  return <>
    {model.rows.map(row => {
      if (row.type === 'discount') {
        return <div className="staff-cart-line staff-cart-discount" key={row.key}><span>{row.label}</span><span>-${row.amount}</span></div>;
      }
      const edit = () => editCartPortion(row.catSlug, row.itemName, row.qty - 1);
      return <div className={`staff-cart-line${row.hasOptions ? ' staff-cart-has-opts' : ''}`} key={row.key}>
        <div className="staff-cart-line-top">
          <div className="staff-cart-line-info" onClick={row.hasOptions ? edit : undefined}
            role={row.hasOptions ? 'button' : undefined} tabIndex={row.hasOptions ? 0 : undefined}
            onKeyDown={event => {
              if (row.hasOptions && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                edit();
              }
            }}>
            <div className="staff-cart-name">{row.displayName}</div>
            <div className="staff-cart-price">${row.lineTotal}</div>
            {row.hasOptions && <div className="staff-cart-portions"><span className="staff-cart-opt-link">{text('修改選項', 'Sửa tùy chọn')}</span></div>}
          </div>
          <div className="staff-cart-stepper">
            <Button className="staff-step-btn" aria-label={text('減少', 'Giảm số lượng')} onClick={() => updateQty(row.catSlug, row.itemName, -1)}>−</Button>
            <span className="staff-step-qty">{row.qty}</span>
            <Button className="staff-step-btn" aria-label={text('增加', 'Tăng số lượng')} onClick={() => updateQty(row.catSlug, row.itemName, 1)}>+</Button>
          </div>
        </div>
      </div>;
    })}
    {model.options.length > 0 && <div className="staff-cart-order-options">
      {model.options.map(group => <div className="staff-cart-order-group" key={group.key}>
        <div className="staff-cart-order-label">{group.title}</div>
        {group.choices.map(({ label, extra }, index) => <div className="staff-cart-order-choice" key={index}>
          <span>{label}</span>{extra !== 0 && <span className="staff-cart-order-extra">+${extra}</span>}
        </div>)}
      </div>)}
    </div>}
  </>;
}

const roots = new Map<Element, Root>();

function render(id: string, view: ReactNode) {
  const host = document.getElementById(id);
  if (!host) return;
  let root = roots.get(host);
  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }
  root.render(view);
}

function mountOverlayHosts() {
  if (document.getElementById('staff-toast-root')) return;
  const host = document.createElement('div');
  host.id = 'staff-toast-root';
  const cashier = document.createElement('div');
  cashier.id = 'staff-cashier-overlay-root';
  document.body.append(host, cashier);
}

export function startStaffOrder() {
  mountOverlayHosts();
  Object.assign(window, { StaffOrderView: {
    tables(model: StaffTableView, onSelect: (id: string) => void) {
      flushSync(() => {
        render('staff-table-chips', <TableChips model={model} onSelect={onSelect} />);
        render('staff-bar-legend', model.allowDine && model.tables.length ? <>
          <span className="staff-dot-occupied" /><span>{text('用餐中', 'Đang có khách')}</span>
        </> : null);
      });
    },
    cartHeader(label: string, round: string) {
      flushSync(() => render('staff-cart-header', <>
        <span id="staff-cart-target">{label}</span><span id="staff-cart-round" hidden={!round}>{round}</span>
      </>));
    },
    catalog(sections: StaffCatalogSection[], active: string, onTab: (id: string) => void, onOptions: (category: string, item: string) => void) {
      flushSync(() => {
        render('main-nav', sections.map(section => <Button key={section.id} className={`nav-btn${active === section.id ? ' active' : ''}`}
          aria-pressed={active === section.id} data-staff-sec={section.id} onClick={() => onTab(section.id)}>{section.label}</Button>));
        render('catalog-sections', <Catalog sections={sections} active={active} onOptions={onOptions} />);
      });
    },
    cart(model: StaffCartView) {
      flushSync(() => {
        render('cart-summary', <Cart model={model} />);
        render('staff-cart-count', `${model.quantity} ${text('份', 'phần')}`);
      });
    },
    message(value: string) { flushSync(() => render('staff-order-status', value)); },
    toast(value: string, type: string, shown: boolean) {
      render('staff-toast-root', <div id="staff-order-toast" role="status" className={`staff-toast staff-toast-${type}${shown ? ' staff-toast-show' : ''}`}>{value}</div>);
    },
    note(open: boolean, onToggle: () => void) {
      flushSync(() => render('staff-note-control', <Button id="staff-note-toggle" aria-expanded={open} onClick={onToggle}>
        {open ? text('備註', 'Ghi chú') : text('+ 備註', '+ Ghi chú')}
      </Button>));
    },
    cashierButton(disabled: boolean, onClick: () => void) {
      flushSync(() => render('staff-cashier-control', <Button id="staff-cashier-btn" className="staff-cashier-btn" disabled={disabled} onClick={onClick}>
        <CashierIcon /><span>{text('計算找零', 'Tính tiền thối')}</span>
      </Button>));
    },
    renderCashier(total: number, onClose: () => void, onConfirm: (tendered: number) => void) {
      flushSync(() => render('staff-cashier-overlay-root', <Cashier total={total} onClose={onClose} onConfirm={onConfirm} />));
    },
    closeCashier() { flushSync(() => render('staff-cashier-overlay-root', null)); },
  } });
  void StaffOrder.start();
}
