import type { HistoryOrderDto } from '@shared/contracts/api';

/** Fixed reference clock (2026-11-11T14:00:00+08:00) for deterministic sandbox & unit testing. */
export const SANDBOX_REFERENCE_NOW_MS = new Date('2026-11-11T14:00:00+08:00').getTime();

export const DEFAULT_SANDBOX_ORDERS: readonly HistoryOrderDto[] = [
  {
    key: 'ORD-20261111-D05',
    displayKey: '261111-005',
    customer: 'Nguyễn Văn A',
    phone: '0912345678',
    time: '2026-11-11 12:20',
    content: '1x Bánh mì thịt nướng $95\n1x Cà phê sữa đá $65',
    status: 'PAID',
    createdAt: new Date('2026-11-11T12:20:00+08:00').getTime(),
    pickedUpAt: new Date('2026-11-11T13:05:00+08:00').getTime(),
    total: 255,
    diningOption: 'dine_in',
    tableNumber: '5',
    roundCount: 2,
    is_modified: 1,
    note: 'Ít hành ngò',
    items: [
      { item_name: 'Bánh mì thịt nướng', quantity: 1, subtotal: 95 },
      { item_name: 'Cà phê sữa đá', quantity: 2, subtotal: 130 },
      { item_name: 'Chả lụa thêm', quantity: 1, subtotal: 30 }
    ]
  },
  {
    key: 'ORD-20261111-T14',
    displayKey: '261111-014',
    customer: '陳美玲',
    phone: '0987654321',
    time: '2026-11-11 13:15',
    content: '2x 法式經典越南麵包 $190\n1x 檸檬紅茶 $45',
    status: 'PICKED_UP',
    createdAt: new Date('2026-11-11T11:50:00+08:00').getTime(),
    pickedUpAt: new Date('2026-11-11T12:45:00+08:00').getTime(),
    total: 235,
    diningOption: 'takeaway',
    items: [
      { item_name: '法式經典越南麵包', quantity: 2, subtotal: 190 },
      { item_name: '檸檬紅茶', quantity: 1, subtotal: 45 }
    ]
  },
  {
    key: 'ORD-20261110-T03',
    displayKey: '261110-003',
    customer: '林志明',
    time: '2026-11-10 18:30',
    content: '1x 越式烤肉涼麵 $140\n💰 總金額: $140',
    status: 'REJECTED',
    createdAt: new Date('2026-11-10T18:10:00+08:00').getTime(),
    pickedUpAt: new Date('2026-11-10T18:15:00+08:00').getTime(),
    total: 140,
    diningOption: 'takeaway',
    reason: 'Customer rescheduled'
  }
];
