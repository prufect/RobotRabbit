export function showContractorDetailModal(contractor, onNegotiate, alreadyNegotiating = false) {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.style.zIndex = '9999';

  // Generate some mock details if missing
  const email = contractor.email || `contact@${contractor.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
  const website = contractor.website || `www.${contractor.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
  const license = contractor.license || `CA-${Math.floor(100000 + Math.random() * 900000)}`;

  const starsHtml = '★'.repeat(Math.floor(contractor.rating)) + 
    (contractor.rating % 1 >= 0.5 ? '½' : '');

  const badgesHtml = [
    contractor.verified?.licensed ? '<span class="verified-badge">✓ Licensed</span>' : '',
    contractor.verified?.insured ? '<span class="verified-badge">✓ Insured</span>' : '',
    !contractor.verified?.bbComplaint ? '<span class="verified-badge">✓ No Complaints</span>' : '',
  ].filter(Boolean).join('');

  const negotiateButtonHtml = alreadyNegotiating
    ? `<button class="btn-primary" id="btn-start-negotiating" disabled style="width: 100%; padding: 12px; font-size: 1rem; border-radius: 12px; border: none; background: #94a3b8; color: white; font-weight: 600; cursor: not-allowed; opacity: 0.7;">
        🤝 Already Negotiating
      </button>
      <p style="text-align: center; font-size: 0.78rem; color: var(--text-muted); margin-top: 8px;">Check Messages for live updates</p>`
    : `<button class="btn-primary" id="btn-start-negotiating" style="width: 100%; padding: 12px; font-size: 1rem; border-radius: 12px; border: none; background: var(--accent-primary); color: white; font-weight: 600; cursor: pointer;">
        🤖 Start Negotiating
      </button>`;

  overlay.innerHTML = `
    <div class="auth-card glass-solid" style="max-width: 400px; padding: 24px; position: relative;">
      <button class="auth-close" type="button" aria-label="Close" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
      
      <div style="margin-bottom: 20px;">
        <h2 style="margin: 0 0 8px 0; font-size: 1.4rem; color: var(--text-primary);">${contractor.name}</h2>
        ${contractor.rating > 0 ? `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--text-secondary);">
          <span style="color: #F59E0B;">${starsHtml}</span>
          <span>${contractor.rating}${contractor.reviewCount > 0 ? ` (${contractor.reviewCount} reviews)` : ''}</span>
        </div>
        ` : ''}
      </div>
      
      <div style="margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 6px;">
        ${badgesHtml}
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.2rem;">📞</span>
          <a href="tel:${contractor.phone || ''}" style="color: var(--accent-primary); text-decoration: none; font-weight: 500;">${contractor.phone || 'Phone not available'}</a>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.2rem;">📧</span>
          <a href="mailto:${email}" style="color: var(--accent-primary); text-decoration: none; font-weight: 500;">${email}</a>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.2rem;">🌐</span>
          <a href="https://${website}" target="_blank" style="color: var(--accent-primary); text-decoration: none; font-weight: 500;">${website}</a>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.2rem;">📜</span>
          <span style="color: var(--text-secondary);">License: <strong>${license}</strong></span>
        </div>
        ${(contractor.address || contractor.distance > 0) ? `
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.2rem;">📍</span>
          <span style="color: var(--text-secondary);">${contractor.address || `${contractor.distance} miles away`}</span>
        </div>
        ` : ''}
      </div>
      
      ${negotiateButtonHtml}
    </div>
  `;

  (document.getElementById('app') || document.body).appendChild(overlay);

  const closeBtn = overlay.querySelector('.auth-close');
  closeBtn.addEventListener('click', () => {
    overlay.remove();
  });

  // Close on outside click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  const negotiateBtn = overlay.querySelector('#btn-start-negotiating');
  if (!alreadyNegotiating) {
    negotiateBtn.addEventListener('click', () => {
      overlay.remove();
      if (onNegotiate) onNegotiate(contractor);
    });
  }
}
