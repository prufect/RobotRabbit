export function createContractorCard(contractor, options = {}) {
  // contractor: { name, rating, reviewCount, distance, verified, originalPrice, negotiatedPrice, availability, specialties, yearsExperience }
  const card = document.createElement('div');
  card.className = `contractor-card glass ${options.isBestMatch ? 'best-match' : ''}`;
  
  const starsHtml = '★'.repeat(Math.floor(contractor.rating)) + 
    (contractor.rating % 1 >= 0.5 ? '½' : '');
  
  const badgesHtml = [
    contractor.verified?.licensed ? '<span class="verified-badge">✓ Licensed</span>' : '',
    contractor.verified?.insured ? '<span class="verified-badge">✓ Insured</span>' : '',
    !contractor.verified?.bbComplaint ? '<span class="verified-badge">✓ No Complaints</span>' : '',
  ].filter(Boolean).join('');
  
  const saved = contractor.originalPrice - contractor.negotiatedPrice;
  const savedPercent = Math.round((saved / contractor.originalPrice) * 100);
  
  card.innerHTML = `
    ${options.isBestMatch ? '<div class="contractor-badge">⭐ Best Match</div>' : ''}
    <div class="contractor-header">
      <div>
        <div class="contractor-name">${contractor.name}</div>
        <div class="contractor-meta">
          ${contractor.distance > 0 ? `<span>📍 ${contractor.distance} mi</span>` : ''}
          <span>🔧 ${contractor.yearsExperience}yr exp</span>
        </div>
      </div>
      ${contractor.rating > 0 ? `
      <div class="contractor-rating">
        <span class="contractor-star">${starsHtml}</span>
        <span>${contractor.rating}</span>
        ${contractor.reviewCount > 0 ? `<span style="color:var(--text-muted);font-size:0.75rem;">(${contractor.reviewCount})</span>` : ''}
      </div>
      ` : ''}
    </div>
    <div class="contractor-verified">${badgesHtml}</div>
    <div class="contractor-price-section">
      <div class="contractor-price">
        <span class="price-negotiated" style="font-size:1.1rem;">Est. $${contractor.negotiatedPrice}–$${contractor.originalPrice}</span>
      </div>
      <div style="font-size:0.8rem;color:var(--text-secondary);text-align:right;">
        <div style="font-weight:500;">${contractor.availability}</div>
      </div>
    </div>
  `;
  
  card.addEventListener('click', () => {
    card.dispatchEvent(new CustomEvent('contractor-selected', {
      detail: { contractor },
      bubbles: true
    }));
  });
  
  return { el: card };
}

export function createContractorCards(contractors, container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'contractor-cards';
  
  contractors.forEach((c, i) => {
    const card = createContractorCard(c, { isBestMatch: i === 0 });
    wrapper.appendChild(card.el);
  });
  
  container.appendChild(wrapper);
  return { el: wrapper, destroy() { wrapper.remove(); } };
}
