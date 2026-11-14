import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AiSettingsDto } from '@shared/contracts/api';
import { PosAiSettingsPanel } from './PosAiSettingsPanel';

const SAMPLE_VALUES: AiSettingsDto = {
  enabled: true,
  address: true,
  hours: false,
  delivery: true,
  customReplies: true,
  orderRedirect: true,
  orderStatus: true,
  pendingOrderReplies: true
};

describe('PosAiSettingsPanel', () => {
  it('renders localized copy, switches, and triggers toggle callbacks', () => {
    const onToggle = vi.fn();
    render(
      <PosAiSettingsPanel
        values={SAMPLE_VALUES}
        busy={false}
        status="aiAutoSave"
        locale="vi"
        onToggleSetting={onToggle}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Cài đặt AI' })).toBeInTheDocument();
    const master = screen.getByRole('switch', { name: 'Tự động trả lời tin nhắn' });
    const address = screen.getByRole('switch', { name: 'Địa chỉ cửa hàng' });
    const hours = screen.getByRole('switch', { name: 'Giờ mở cửa' });

    expect(master).toBeChecked();
    expect(address).toBeChecked();
    expect(hours).not.toBeChecked();

    fireEvent.click(address);
    expect(onToggle).toHaveBeenCalledWith('address', false);
  });

  it('disables behavior switches when master switch is off and shows retry on load error', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <PosAiSettingsPanel
        values={{ ...SAMPLE_VALUES, enabled: false }}
        busy={false}
        status="aiAutoSave"
        locale="zh-TW"
        onToggleSetting={vi.fn()}
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole('switch', { name: '門市地址' })).toBeDisabled();
    expect(document.getElementById('ai-settings-retry')).toHaveAttribute('hidden');

    rerender(
      <PosAiSettingsPanel
        values={null}
        busy={false}
        status="aiLoadError"
        locale="zh-TW"
        onToggleSetting={vi.fn()}
        onRetry={onRetry}
      />
    );

    const retryBtn = screen.getByRole('button', { name: '重新載入' });
    expect(retryBtn).not.toHaveAttribute('hidden');
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
