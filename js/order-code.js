/* Presentation only. Never use the result as an API reference or storage key. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; module.exports.default = api; }
  else root.OrderCode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function format(value) {
    const code = String(value ?? '').trim().replace(/^#+\s*/, '');
    const match = code.match(/((?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-[DT]\d{3,})$/i);
    return match ? match[1] : code;
  }
  return { format };
});
