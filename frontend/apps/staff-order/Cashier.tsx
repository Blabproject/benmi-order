import { useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from '@shared/ui/dialog';
import { staffText as text, money, roundMoney } from './contracts';

export function CashierIcon() {
  return <svg className="staff-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M16 14v4m0-8h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01" />
  </svg>;
}

const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', 'backspace'];

function quickAmounts(total: number) {
  const roundTo = (amount: number) => Math.ceil((total + 0.001) / amount) * amount;
  const candidates = [roundTo(50), 100, 500, 1000, 1500, 2000, 3000, 5000, 10000, roundTo(100), roundTo(500), roundTo(1000)];
  return [total, ...[...new Set(candidates.filter(amount => amount > total))].slice(0, 3).sort((a, b) => a - b)];
}

export function Cashier({ total, onClose, onConfirm }: { total: number; onClose: () => void; onConfirm: (tendered: number) => void }) {
  const [input, setInput] = useState({ value: '', replaceOnDigit: false });
  const closeButton = useRef<HTMLButtonElement>(null);
  const tendered = roundMoney(Number.parseFloat(input.value));
  const difference = roundMoney(tendered - total);
  const empty = !input.value || tendered <= 0;
  const insufficient = !empty && difference < 0;
  const valid = total > 0 && tendered >= total;

  function enterKey(key: string) {
    setInput(previous => {
      if (key === 'backspace') return { value: previous.value.slice(0, -1), replaceOnDigit: false };
      const initial = previous.replaceOnDigit ? '' : previous.value;
      const value = !initial || initial === '0' ? (key === '00' ? '0' : key) : initial + key;
      return { value: value.replace('.', '').length <= 7 ? value : initial, replaceOnDigit: false };
    });
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      enterKey(event.key);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      enterKey('backspace');
    } else if (event.key === 'Enter') {
      if (event.target instanceof Element && event.target.closest('#staff-cashier-close-btn, [data-cashier-chip]')) return;
      event.preventDefault();
      if (valid) onConfirm(tendered);
    }
  }

  const confirmLabel = empty ? text('請輸入實收金額', 'Nhập số tiền khách đưa')
    : insufficient ? text(`尚欠 $${money(-difference)}`, `Còn thiếu $${money(-difference)}`)
    : difference === 0 ? text('確認 · 剛好免找', 'Xác nhận · vừa đủ')
    : text(`確認 · 找零 $${money(difference)}`, `Xác nhận · thối $${money(difference)}`);

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogPortal>
      <DialogOverlay id="staff-cashier-modal" className="staff-cashier-overlay">
        <DialogContent className="staff-cashier-dialog" aria-modal="true" aria-describedby={undefined} onKeyDown={handleKey}
          onOpenAutoFocus={event => {
            event.preventDefault();
            closeButton.current?.focus();
          }}
          onCloseAutoFocus={event => event.preventDefault()}>
          <div className="staff-cashier-header">
            <DialogTitle asChild>
              <div className="staff-cashier-due-wrap">
                <span id="staff-cashier-due-label" className="staff-cashier-due-label">{text('應收金額', 'Cần thu')}</span>
                <span id="staff-cashier-due-amount" className="staff-cashier-due-amount">${money(total)}</span>
              </div>
            </DialogTitle>
            <DialogClose asChild>
              <Button ref={closeButton} id="staff-cashier-close-btn" className="staff-cashier-close-btn">{text('關閉', 'Đóng')}</Button>
            </DialogClose>
          </div>
          <div className="staff-cashier-body">
            <div className="staff-cashier-left">
              <div className="staff-cashier-tender-block">
                <div id="staff-cashier-tender-label" className="staff-cashier-field-label">{text('實收金額', 'Khách đưa')}</div>
                <div id="staff-cashier-tender-display" className={`staff-cashier-tender-display${input.value ? '' : ' is-empty'}`}>${money(tendered)}</div>
              </div>
              <div id="staff-cashier-chips" className="staff-cashier-chips">
                {quickAmounts(total).map((amount, index) => {
                  const selected = input.value !== '' && Math.abs(tendered - amount) < 0.001;
                  return <Button key={amount} className={`staff-cashier-chip${selected ? ' on' : ''}`} data-cashier-chip={amount} aria-pressed={selected}
                    onClick={() => setInput({ value: money(amount), replaceOnDigit: true })}>{index === 0 ? text('剛好 ', 'Vừa đủ ') : ''}${money(amount)}</Button>;
                })}
              </div>
              <div id="staff-cashier-change-box" className={`staff-cashier-change-box${empty ? ' is-empty' : insufficient ? ' is-insufficient' : ''}`}>
                <div id="staff-cashier-change-label" className="staff-cashier-field-label">{insufficient ? text('尚欠金額', 'Còn thiếu') : text('找零', 'Thối lại')}</div>
                <div id="staff-cashier-change-value" className="staff-cashier-change-value">${empty ? '0' : money(Math.abs(difference))}</div>
              </div>
            </div>
            <div className="staff-cashier-keypad">
              {keys.map(key => <Button key={key} className={`staff-cashier-key${key === 'backspace' ? ' staff-cashier-key-backspace' : ''}`} data-cashier-key={key}
                aria-label={key === 'backspace' ? text('退格', 'Xóa số') : undefined} onClick={() => enterKey(key)}>
                {key === 'backspace' ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM12 9l6 6m0-6-6 6" /></svg> : key}
              </Button>)}
            </div>
          </div>
          <div className="staff-cashier-footer">
            <Button id="staff-cashier-confirm-btn" className="staff-cashier-confirm-btn" disabled={!valid} onClick={() => onConfirm(tendered)}>{confirmLabel}</Button>
          </div>
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </Dialog>;
}
