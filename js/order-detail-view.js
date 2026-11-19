/* Shared pure presentation contract. Used unchanged by browser and Worker.
 * No label matching, catalog lookup, or text parsing in the snapshot path. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; module.exports.default = api; }
  else root.OrderDetailView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function isSnapshot(value) { return value?.schemaVersion === 1 && Array.isArray(value.rounds); }
  function choiceText(choice) {
    const children = (choice.groups || []).flatMap(group => group.items.map(choiceText));
    const subs = (choice.subOptions || []).map(s => s.name);
    return choice.name + (choice.quantity > 1 ? ` ×${choice.quantity}` : '')
      + (children.length + subs.length ? ` (${children.concat(subs).join('、')})` : '');
  }
  function extra(choice) {
    return (Number(choice.surcharge || 0)
      + (choice.subOptions || []).reduce((sum, s) => sum + Number(s.price || 0), 0)
      + (choice.groups || []).reduce((sum, g) => sum + g.items.reduce((n, c) => n + extra(c), 0), 0)) * choice.quantity;
  }
  function choices(groups) {
    return groups.flatMap(g => g.items.map(c => ({ groupId: g.groupId, optionId: c.optionId,
      label: g.groupName, value: choiceText(c), price: extra(c) })));
  }
  function lines(snapshot) {
    if (!isSnapshot(snapshot)) return [];
    return snapshot.rounds.flatMap(round => round.items.map(item => {
      const options = item.portions.flatMap(p => choices(p.groups).map(c => ({ ...c,
        choice: `${item.quantity > 1 ? `第${p.portionIndex + 1}份: ` : ''}${c.label}: ${c.value}` })));
      const notes = item.portions.filter(p => p.note).map(p =>
        `${item.quantity > 1 ? `第${p.portionIndex + 1}份: ` : ''}${p.note}`);
      if (item.note) notes.unshift(item.note);
      return { lineId: item.lineId, itemId: item.itemId, name: item.name, category: item.category,
        quantity: item.quantity, price: item.unitPrice, unit_price: item.unitPrice, subtotal: item.subtotal,
        note: notes.join('\n'), notes: notes.join('\n'), options, selected_options: JSON.stringify(options),
        round_number: round.roundNumber, detailLine: item };
    }));
  }
  function globalChoices(snapshot) {
    if (!isSnapshot(snapshot)) return [];
    return snapshot.rounds.flatMap(r => choices(r.groups).map(c => ({ ...c, roundNumber: r.roundNumber,
      label: `${snapshot.rounds.length > 1 ? `[第${r.roundNumber}輪] ` : ''}${c.label}` })));
  }
  function printItems(snapshot, expand) {
    // Printed receipts and stickers show only the selected option content (omit group labels and surcharges).
    const printOptions = (groups, prefix = '') => choices(groups)
      .filter(c => c.value)
      .map(c => `${prefix}${c.value}`);
    return lines(snapshot).flatMap(line => {
      const base = { ...line, detailLine: line.detailLine, price: `$${line.subtotal}`, unitPrice: `$${line.unit_price}`,
        baseOptions: '', options: line.detailLine.portions.flatMap(p =>
          printOptions(p.groups, line.quantity > 1 ? `第${p.portionIndex + 1}份: ` : '')).join('\n'),
        round: snapshot.rounds.length > 1 ? `[第${line.round_number}輪]` : '' };
      if (!expand) return [base];
      return line.detailLine.portions.map(p => ({ ...base, quantity: 1, originalQty: line.quantity,
        unitIndex: p.portionIndex + 1, note: [line.detailLine.note, p.note].filter(Boolean).join('\n'),
        options: printOptions(p.groups).join('\n') }));
    });
  }
  function notes(snapshot) {
    return snapshot.rounds.filter(r => r.note).map(r =>
      `${snapshot.rounds.length > 1 ? `[第${r.roundNumber}輪] ` : ''}${r.note}`).join('\n');
  }
  function text(snapshot) {
    return snapshot.rounds.map(r => {
      if (r.legacyContent !== undefined) return r.legacyContent;
      const out = snapshot.rounds.length > 1 ? [`[第${r.roundNumber}輪]`] : [];
      choices(r.groups).forEach(c => out.push(`${c.label}: ${c.value}`));
      lines({ schemaVersion: 1, rounds: [r] }).forEach(i => {
        out.push(`${i.quantity}份 x ${i.name}`);
        i.options.forEach(o => out.push(`  - ${o.choice}${o.price ? ` (+$${o.price})` : ''}`));
        if (i.note) out.push(`  - 備註: ${i.note}`);
      });
      if (r.note) out.push(`顧客備註: ${r.note}`);
      return out.join('\n');
    }).join('\n\n');
  }
  return { isSnapshot, choiceText, extra, choices, lines, printItems, globalChoices, notes, text };
});
