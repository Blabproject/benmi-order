/* Shared customer receipt presentation. Text is always inserted with textContent. */
window.PaymentView = (function () {
  const text=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
  function element(tag, className, value) {
    const el = document.createElement(tag); el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  }
  // Lucide check / clock / credit-card geometry, MIT license; no decorative emoji.
  function icon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(key, value);
    const paths = kind === 'check' ? ['M20 6 9 17l-5-5'] : kind === 'cancel' ? ['m18 6-12 12','m6 6 12 12'] : kind === 'clock'
      ? ['M12 8v4l3 2', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0']
      : ['M2 8h20', 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2'];
    for (const d of paths) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); }
    return svg;
  }
  function receiptDetails(snapshot) {
    const details = element('details', 'payment-receipt-details');
    const summary = element('summary', 'payment-receipt-toggle', text('查看訂單明細', 'Xem chi tiết đơn'));
    details.append(summary);
    const body = element('div', 'payment-receipt-body');
    if (OrderDetailView.isSnapshot?.(snapshot)) {
      const choices = OrderDetailView.globalChoices(snapshot);
      if (choices.length) {
        const list = element('dl', 'payment-receipt-choices');
        for (const choice of choices) {
          const row = element('div', 'payment-receipt-choice');
          row.append(element('dt', '', choice.label), element('dd', '', choice.value)); list.append(row);
        }
        body.append(list);
      }
      const items = element('ul', 'payment-receipt-items');
      for (const line of OrderDetailView.lines(snapshot)) {
        const item = element('li', 'payment-receipt-item');
        const heading = element('div', 'payment-receipt-line');
        heading.append(element('span', 'payment-receipt-name', line.quantity + ' × ' + line.name),
          element('span', 'payment-receipt-price', '$' + line.subtotal)); item.append(heading);
        for (const option of line.options) item.append(element('p', 'payment-receipt-note', option.choice));
        if (line.note) item.append(element('p', 'payment-receipt-note', line.note));
        items.append(item);
      }
      body.append(items);
      const note = OrderDetailView.notes(snapshot);
      if (note) body.append(element('p', 'payment-receipt-note', note));
    } else body.append(element('p', 'payment-receipt-note', OrderDetailView.text(snapshot)));
    details.append(body); return details;
  }
  return {element,icon,receiptDetails};
})();
