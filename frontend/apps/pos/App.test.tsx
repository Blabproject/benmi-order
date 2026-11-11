import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import { DEFAULT_SANDBOX_ORDERS, SANDBOX_REFERENCE_NOW_MS } from './history-fixtures';

beforeAll(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});

describe('POS Order History Sandbox App', () => {
  it('renders grouped history dates, switches zh-TW <-> vi, filters, searches, and opens read-only detail', () => {
    render(
      <App
        initialOrders={DEFAULT_SANDBOX_ORDERS}
        initialLocale="zh-TW"
        nowMs={SANDBOX_REFERENCE_NOW_MS}
      />
    );

    expect(document.documentElement.lang).toBe('zh-TW');
    expect(screen.getByText('2026-11-11')).toBeInTheDocument();
    expect(screen.getByText('2026-11-10')).toBeInTheDocument();
    expect(screen.getByText('$490')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();

    // Switch language to Vietnamese POS dictionary
    fireEvent.click(screen.getByRole('button', { name: '切換至 Tiếng Việt' }));
    expect(document.documentElement.lang).toBe('vi');
    expect(screen.getByRole('button', { name: 'Tại bàn' })).toBeInTheDocument();
    expect(screen.getByText('Hôm nay')).toBeInTheDocument();

    // Filter dine-in only
    fireEvent.click(screen.getByRole('button', { name: 'Tại bàn' }));
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.queryByText('陳美玲')).not.toBeInTheDocument();

    // Clear filter restores all orders
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(screen.getByText('陳美玲')).toBeInTheDocument();

    // Accent-insensitive Vietnamese search
    const searchInput = screen.getByLabelText('Tìm kiếm lịch sử đơn hàng');
    fireEvent.change(searchInput, { target: { value: 'nguyen' } });
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.queryByText('陳美玲')).not.toBeInTheDocument();

    // Non-matching query displays empty search state + reset CTA
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });
    expect(screen.getByText('Không tìm thấy đơn hàng phù hợp')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(screen.getByText('陳美玲')).toBeInTheDocument();

    // Collapse All toggles accordion groups closed
    const collapseBtn = screen.getByRole('button', { name: 'Thu gọn' });
    fireEvent.click(collapseBtn);
    expect(screen.getByRole('button', { name: 'Mở tất cả' })).toHaveAttribute('aria-expanded', 'false');

    // View detail opens native dialog and closes cleanly
    fireEvent.click(screen.getByRole('button', { name: 'Xem #261111-005' }));
    expect(screen.getByRole('heading', { name: /#261111-005/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('heading', { name: /#261111-005/ })).not.toBeInTheDocument();
  });

  it('hides toolbar when total history order list is empty', () => {
    render(<App initialOrders={[]} initialLocale="zh-TW" nowMs={SANDBOX_REFERENCE_NOW_MS} />);
    expect(screen.getByText('尚無歷史訂單')).toBeInTheDocument();
    expect(screen.queryByLabelText('搜尋歷史訂單')).not.toBeInTheDocument();
  });
});
