declare global {
  interface Window {
    isStaffOrderMode?: boolean;
    __TENANT_RESOLUTION_FAILED?: boolean;
  }
}

if (window.isStaffOrderMode && !window.__TENANT_RESOLUTION_FAILED) {
  void import('./staff-order-view').then(({ startStaffOrder }) => startStaffOrder()).catch(error => {
    const message = document.createElement('p');
    message.id = 'staff-access-error';
    message.setAttribute('role', 'alert');
    message.textContent = document.documentElement.lang === 'vi'
      ? 'Không tải được giao diện nhân viên. Vui lòng tải lại trang.'
      : '無法載入員工點餐介面，請重新整理頁面。';
    document.getElementById('page-body-content')?.replaceWith(message);
    console.warn('[StaffOrder] UI load failed:', error);
  });
}

export {};
