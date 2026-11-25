import { useSyncExternalStore } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OptionCatalogDto } from '@shared/contracts/option-groups-model';
import { PosOptionGroupsDrawer } from './PosOptionGroupsDrawer';
import { createOptionGroupsStore, type OptionGroupsStore } from './option-groups-store';

const CATALOG: OptionCatalogDto = {
  categories: [{ id: 'c1', name: 'Đồ uống' }],
  products: [
    { id: 'p1', category_id: 'c1', name: 'Trà đào', price: 45, menu_revision: 1 },
    { id: 'p2', category_id: 'c1', name: 'Thạch đào', price: 10, menu_revision: 1 },
  ],
  groups: [
    {
      id: 'g1',
      name: 'Kích cỡ',
      scope: 'item',
      minSelection: 1,
      maxSelection: 1,
      options: [{ id: 'o1', name: 'Lớn', price: 10, isDefault: true }],
    },
  ],
  links: [{ groupId: 'g1', itemId: 'p1', optionIds: null, sortOrder: 0 }],
};

function Harness({
  store,
  multilingual = true,
}: {
  store: OptionGroupsStore;
  multilingual?: boolean;
}) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <PosOptionGroupsDrawer
      store={store}
      snapshot={snap}
      multilingualEnabled={multilingual}
      aiTargetLocales={['vi', 'en']}
    />
  );
}

describe('PosOptionGroupsDrawer', () => {
  it('renders group editor, steppers, help disclosure, and discard confirm card', async () => {
    const store = createOptionGroupsStore({
      getLocale: () => 'zh-TW',
      getTenantId: () => 'benmi',
      getWorkerBase: () => 'https://worker.test',
      getCurrentMenuData: () => [],
      getSavedMenuSnapshot: () => '[]',
      setMenuSnapshots: vi.fn(),
      getAuthHeaders: () => ({}),
      fetchImpl: vi.fn(async () => new Response(JSON.stringify(CATALOG), { status: 200 })),
    });

    await store.openGroup('g1');
    render(<Harness store={store} />);

    const nameInput = document.querySelector<HTMLInputElement>('[data-field="name"]')!;
    expect(nameInput.value).toBe('Kích cỡ');

    const helpBtn = document.querySelector<HTMLButtonElement>('[data-action="help"][data-help="required"]')!;
    expect(helpBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(helpBtn);
    expect(helpBtn).toHaveAttribute('aria-expanded', 'true');

    fireEvent.input(nameInput, { target: { value: 'Kích cỡ mới' } });
    fireEvent.click(document.querySelector('[data-action="close"]')!);

    expect(screen.getByRole('alertdialog')).toBeVisible();
    fireEvent.click(document.querySelector('[data-action="discard"]')!);
    expect(document.getElementById('unified-menu-drawer')).toHaveAttribute('hidden');
  });

  it('renders new-group scope selector and opens item group draft without footer', async () => {
    const store = createOptionGroupsStore({
      getLocale: () => 'vi',
      getTenantId: () => 'benmi',
      getWorkerBase: () => 'https://worker.test',
      getCurrentMenuData: () => [],
      getSavedMenuSnapshot: () => '[]',
      setMenuSnapshots: vi.fn(),
      getAuthHeaders: () => ({}),
      fetchImpl: vi.fn(async () => new Response(JSON.stringify(CATALOG), { status: 200 })),
    });

    await store.openNewGroupScope();
    render(<Harness store={store} />);

    expect((document.querySelector('.ug-footer') as HTMLElement | null)?.hidden).toBe(true);
    fireEvent.click(document.querySelector('[data-action="select-new-scope"][data-scope="item"]')!);
    expect((document.querySelector('.ug-footer') as HTMLElement | null)?.hidden).toBe(false);
  });

  it('toggles staffOnly in product drawer, marks dirty, and sends staffOnly on save', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/menu/product')) {
        const body = JSON.parse(String(init?.body || '{}'));
        return new Response(
          JSON.stringify({
            success: true,
            id: 'p1',
            catalog: {
              ...CATALOG,
              products: CATALOG.products.map((p) =>
                p.id === 'p1' ? { ...p, staff_only: body.staffOnly ? 1 : 0, menu_revision: 2 } : p
              ),
            },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify(CATALOG), { status: 200 });
    });

    const store = createOptionGroupsStore({
      getLocale: () => 'vi',
      getTenantId: () => 'benmi',
      getWorkerBase: () => 'https://worker.test',
      getCurrentMenuData: () => [],
      getSavedMenuSnapshot: () => '[]',
      setMenuSnapshots: vi.fn(),
      getAuthHeaders: () => ({ 'Content-Type': 'application/json' }),
      fetchImpl: fetchMock,
    });

    await store.openProduct('p1');
    render(<Harness store={store} />);

    const toggle = document.querySelector<HTMLInputElement>('[data-field="staffOnly"]')!;
    expect(toggle).toBeTruthy();
    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(store.getSnapshot().drawer?.draft.staffOnly).toBe(true);

    let saved = false;
    await act(async () => {
      saved = await store.save();
    });
    expect(saved).toBe(true);

    const productSaveCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/menu/product'));
    expect(productSaveCall).toBeTruthy();
    const sentPayload = JSON.parse(String(productSaveCall![1]?.body || '{}'));
    expect(sentPayload.staffOnly).toBe(true);
  });
});
