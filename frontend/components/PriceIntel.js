export function createPriceIntel(container, data = {}) {
  // data: { areaLow, areaHigh, areaAvg, negotiatedPrice }
  const wrapper = document.createElement('div');
  wrapper.className = 'price-intel glass-subtle slide-up';
  
  function render(priceData) {
    const { areaLow, areaHigh, areaAvg, negotiatedPrice } = priceData;
    const range = areaHigh - areaLow;
    // Bound the marker position between 0 and 100
    const markerPos = Math.min(100, Math.max(0, ((negotiatedPrice - areaLow) / range) * 100));
    const saved = areaAvg - negotiatedPrice;
    
    wrapper.innerHTML = `
      <div class="price-intel-header">📊 Price Intelligence</div>
      <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px;">
        Average cost in your area: <strong style="color:var(--text-primary)">$${areaLow} – $${areaHigh}</strong>
      </div>
      <div class="price-bar">
        <div class="price-bar-fill" style="width:${markerPos}%;"></div>
        <div class="price-bar-marker" style="left:${markerPos}%;"></div>
      </div>
      <div class="price-labels">
        <span>$${areaLow}</span>
        <span style="color:var(--accent-primary);font-weight:600;">You: $${negotiatedPrice}</span>
        <span>$${areaHigh}</span>
      </div>
      ${saved > 0 ? `<div style="text-align:center;margin-top:12px;font-size:0.85rem;color:var(--accent-tertiary);font-weight:600;padding-top:8px;border-top:1px dashed rgba(0,0,0,0.1);">🎉 You saved $${saved} compared to the average!</div>` : ''}
    `;
  }
  
  if (data.areaLow) render(data);
  container.appendChild(wrapper);
  
  return {
    el: wrapper,
    update(priceData) { render(priceData); },
    destroy() { wrapper.remove(); }
  };
}
