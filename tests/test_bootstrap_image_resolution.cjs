const test = require('node:test');
const assert = require('node:assert/strict');

test('bootstrap image resolution preserves dish images when product.image_key is unset', () => {
  // Simulate the image resolution logic from bootstrap.ts
  const imageList = ['meat_松阪豬', '松阪豬', 'signature_香雞排', '香雞排', 'product:yzs_sig_08'];
  const imageListLoaded = true;
  const tenantId = 'blab_demo';

  const items = [
    { id: 'item_1', name: '松阪豬', category_id: 'cat_meat', image_key: null },
    { id: 'item_2', name: '香雞排', category_id: 'cat_meat', image_key: null },
    { id: 'item_3', name: '柳葉魚 (4隻)', category_id: 'cat_meat', image_key: 'product:yzs_sig_08' },
    { id: 'item_4', name: '無圖片餐點', category_id: 'cat_meat', image_key: null }
  ];

  // Step 1: Initial item mapping (lines 933-936)
  const mappedItems = items.map(item => {
    const hasImage = imageList.includes(item.name) ||
                     imageList.includes(item.id) ||
                     imageList.includes(`product:${item.id}`) ||
                     (item.image_key && imageList.includes(item.image_key)) ||
                     imageList.some(k => k.endsWith(`_${item.name}`) || (k.includes('_') && k.split('_').slice(1).join('_') === item.name));
    const imageLookupKey = (item.image_key && imageList.includes(item.image_key))
      ? item.image_key
      : (imageList.includes(`product:${item.id}`) ? `product:${item.id}` : (imageList.includes(item.id) ? item.id : item.name));
    const imageUrl = hasImage ? `/api/image?tenant_id=${tenantId}&name=${encodeURIComponent(imageLookupKey)}` : null;
    return {
      id: item.id,
      name: item.name,
      imageUrl
    };
  });

  // Step 2: UnifiedMenu pass (lines 1098-1111)
  const products = [
    { id: 'item_1', name: '松阪豬', image_key: null },
    { id: 'item_2', name: '香雞排', image_key: null },
    { id: 'item_3', name: '柳葉魚 (4隻)', image_key: 'product:yzs_sig_08' },
    { id: 'item_4', name: '無圖片餐點', image_key: null }
  ];

  for (const item of mappedItems) {
    const product = products.find(p => p.id === item.id);
    item.imageKey = product?.image_key || null;
    if (product?.image_key) {
      item.imageUrl = (!imageListLoaded || imageList.includes(product.image_key))
        ? `/api/image?tenant_id=${encodeURIComponent(tenantId)}&name=${encodeURIComponent(product.image_key)}`
        : null;
    }
  }

  // Verification
  assert.equal(mappedItems[0].name, '松阪豬');
  assert.equal(mappedItems[0].imageUrl, '/api/image?tenant_id=blab_demo&name=%E6%9D%BE%E9%98%AA%E8%B1%AC');

  assert.equal(mappedItems[1].name, '香雞排');
  assert.equal(mappedItems[1].imageUrl, '/api/image?tenant_id=blab_demo&name=%E9%A6%99%E9%9B%9E%E6%8E%92');

  assert.equal(mappedItems[2].name, '柳葉魚 (4隻)');
  assert.equal(mappedItems[2].imageUrl, '/api/image?tenant_id=blab_demo&name=product%3Ayzs_sig_08');

  assert.equal(mappedItems[3].name, '無圖片餐點');
  assert.equal(mappedItems[3].imageUrl, null);
});
