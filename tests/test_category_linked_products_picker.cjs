const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers/menu-drawer-dom.cjs');

test('category accordion cards are collapsed by default and reflect initial selection', async () => {
  const app = await setup();
  app.context.UnifiedMenu.group('drinks', 'linked');

  const foodCard = app.get('.ug-category-card[data-category="food"]');
  const drinksCard = app.get('.ug-category-card[data-category="drinks"]');
  assert.ok(foodCard, 'Food category card must exist');
  assert.ok(drinksCard, 'Drinks category card must exist');

  // Both categories start collapsed by default ("thu gọn sẵn với dấu mũi tên sổ xuống")
  const foodItems = foodCard.querySelector('.ug-category-items');
  const drinksItems = drinksCard.querySelector('.ug-category-items');
  assert.equal(foodItems.hidden, true, 'Food items must be collapsed by default');
  assert.equal(drinksItems.hidden, true, 'Drinks items must be collapsed by default');

  const foodToggle = foodCard.querySelector('.ug-category-toggle');
  const drinksToggle = drinksCard.querySelector('.ug-category-toggle');
  assert.equal(foodToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(drinksToggle.getAttribute('aria-expanded'), 'false');

  // Selection states:
  // meal in food is already linked -> food category checkbox is checked
  const foodCatCheck = foodCard.querySelector('[data-check="category"]');
  assert.equal(foodCatCheck.checked, true, 'Food category checkbox must be checked when all items are linked');
  assert.equal(foodCatCheck.indeterminate, false);

  // coffee and tea in drinks are not linked -> drinks category checkbox is unchecked
  const drinksCatCheck = drinksCard.querySelector('[data-check="category"]');
  assert.equal(drinksCatCheck.checked, false, 'Drinks category checkbox must be unchecked when no items are linked');
  assert.equal(drinksCatCheck.indeterminate, false);

  await app.click('close');
  assert.equal(app.drawer().hidden, true);
});

test('clicking category toggle expands and collapses the category accordion', async () => {
  const app = await setup();
  app.context.UnifiedMenu.group('drinks', 'linked');

  const drinksCard = app.get('.ug-category-card[data-category="drinks"]');
  const items = drinksCard.querySelector('.ug-category-items');
  const toggle = drinksCard.querySelector('.ug-category-toggle');

  assert.equal(items.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');

  // Click toggle to expand
  await app.click('toggle-category', '[data-category="drinks"]');
  assert.equal(items.hidden, false, 'Items should be visible when expanded');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(drinksCard.classList.contains('ug-category-open'));

  // Click toggle to collapse
  await app.click('toggle-category', '[data-category="drinks"]');
  assert.equal(items.hidden, true, 'Items should be hidden when collapsed again');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(!drinksCard.classList.contains('ug-category-open'));

  await app.click('close');
  assert.equal(app.drawer().hidden, true);
});

test('checking category checkbox selects all products in the category', async () => {
  const app = await setup();
  app.context.UnifiedMenu.group('drinks', 'linked');

  const drinksCard = app.get('.ug-category-card[data-category="drinks"]');
  const drinksCatCheck = drinksCard.querySelector('[data-check="category"]');
  const coffeeCheck = drinksCard.querySelector('[data-check="product"][value="coffee"]');
  const teaCheck = drinksCard.querySelector('[data-check="product"][value="tea"]');

  assert.equal(coffeeCheck.checked, false);
  assert.equal(teaCheck.checked, false);

  // Check the category checkbox to select all drinks
  drinksCatCheck.checked = true;
  app.emit('input', drinksCatCheck);

  assert.equal(coffeeCheck.checked, true, 'Coffee should be checked after category selection');
  assert.equal(teaCheck.checked, true, 'Tea should be checked after category selection');
  assert.equal(drinksCatCheck.checked, true);
  assert.equal(drinksCatCheck.indeterminate, false);

  // Deselecting one product marks category checkbox as indeterminate
  coffeeCheck.checked = false;
  app.emit('input', coffeeCheck);

  assert.equal(drinksCatCheck.checked, false);
  assert.equal(drinksCatCheck.indeterminate, true, 'Category checkbox should be indeterminate when partially selected');

  // Re-selecting the product restores full category check
  coffeeCheck.checked = true;
  app.emit('input', coffeeCheck);

  assert.equal(drinksCatCheck.checked, true);
  assert.equal(drinksCatCheck.indeterminate, false);

  // Unchecking the category checkbox deselects all products in the category
  drinksCatCheck.checked = false;
  app.emit('input', drinksCatCheck);

  assert.equal(coffeeCheck.checked, false, 'Coffee should be unchecked after category deselection');
  assert.equal(teaCheck.checked, false, 'Tea should be unchecked after category deselection');
  assert.equal(drinksCatCheck.checked, false);
  assert.equal(drinksCatCheck.indeterminate, false);

  // Since selection reverted to original, closing is clean without dirty confirmation
  await app.click('close');
  assert.equal(app.drawer().hidden, true);
});

test('applying category selection updates group draft and affects product links', async () => {
  const app = await setup();
  app.context.UnifiedMenu.group('drinks');

  // Navigate to linked products
  await app.click('linked');

  const drinksCard = app.get('.ug-category-card[data-category="drinks"]');
  const drinksCatCheck = drinksCard.querySelector('[data-check="category"]');

  // Select all drinks
  drinksCatCheck.checked = true;
  app.emit('input', drinksCatCheck);

  // Apply selection
  await app.click('apply');

  // Group workspace should now show all 3 items (meal, coffee, tea)
  const groupDraft = app.context.UnifiedMenu.currentDraft ? app.context.UnifiedMenu.currentDraft() : null;
  const linkedText = app.get('.ug-linked').textContent;
  assert.ok(linkedText.includes('Cà phê'), 'Linked products text should contain Coffee');
  assert.ok(linkedText.includes('Trà đen'), 'Linked products text should contain Tea');
  assert.ok(linkedText.includes('Bánh mì'), 'Linked products text should contain Meal');

  // Save the group
  await app.click('save');
  assert.equal(app.posts.length, 1);
  const payload = app.posts[0];
  assert.deepEqual(payload.itemIds.sort(), ['coffee', 'meal', 'tea']);
});

test('searching filters categories and automatically expands categories with matching items', async () => {
  const app = await setup();
  app.context.UnifiedMenu.group('drinks', 'linked');

  const foodCard = app.get('.ug-category-card[data-category="food"]');
  const drinksCard = app.get('.ug-category-card[data-category="drinks"]');

  // Search for tea
  app.input('search', 'Trà');

  assert.equal(foodCard.hidden, true, 'Food category should be hidden when no items match search');
  assert.equal(drinksCard.hidden, false, 'Drinks category should be visible when an item matches');

  const drinksItems = drinksCard.querySelector('.ug-category-items');
  assert.equal(drinksItems.hidden, false, 'Matching category should auto-expand to show search results');

  const teaRow = drinksCard.querySelectorAll('.ug-check').find((r) => r.dataset.search.includes('trà'));
  const coffeeRow = drinksCard.querySelectorAll('.ug-check').find((r) => r.dataset.search.includes('cà phê'));
  assert.equal(teaRow.hidden, false);
  assert.equal(coffeeRow.hidden, true);

  // Clear search restores all categories and collapses auto-expanded categories
  app.input('search', '');
  assert.equal(foodCard.hidden, false);
  assert.equal(drinksCard.hidden, false);
  assert.equal(drinksItems.hidden, true, 'Auto-expanded category should collapse back when search is cleared');
  assert.equal(drinksCard.classList.contains('ug-category-open'), false);

  // If merchant manually expanded food category, it remains open after search is cleared
  await app.click('toggle-category', '[data-category="food"]');
  const foodItems = foodCard.querySelector('.ug-category-items');
  assert.equal(foodItems.hidden, false);

  app.input('search', 'Trà');
  assert.equal(foodCard.hidden, true);
  assert.equal(drinksItems.hidden, false);

  app.input('search', '');
  assert.equal(foodCard.hidden, false);
  assert.equal(foodItems.hidden, false, 'Manually opened category should remain open after clearing search');
  assert.equal(drinksItems.hidden, true, 'Category that was not manually opened should collapse back');
});

test('category accordion labels and accessibility support zh-TW and vi', async () => {
  const viApp = await setup({ lang: 'vi' });
  viApp.context.UnifiedMenu.group('drinks', 'linked');

  const viCard = viApp.get('.ug-category-card[data-category="drinks"]');
  const viToggle = viCard.querySelector('.ug-category-toggle');
  const viCheck = viCard.querySelector('.ug-category-check');
  assert.match(viToggle.getAttribute('aria-label'), /Mở rộng hoặc thu gọn nhóm món/);
  assert.match(viCheck.getAttribute('aria-label'), /Chọn toàn bộ món trong nhóm/);

  const zhApp = await setup({ lang: 'zh-TW' });
  zhApp.context.UnifiedMenu.group('drinks', 'linked');

  const zhCard = zhApp.get('.ug-category-card[data-category="drinks"]');
  const zhToggle = zhCard.querySelector('.ug-category-toggle');
  const zhCheck = zhCard.querySelector('.ug-category-check');
  assert.match(zhToggle.getAttribute('aria-label'), /展開或收合分類/);
  assert.match(zhCheck.getAttribute('aria-label'), /選取該分類全部餐點/);
});
