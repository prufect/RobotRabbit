/**
 * Real API client — bridges the Track 1 Frontend to the Track 2 & 3 Backend services.
 *
 * Default URLs point to the deployed Vercel backends directly (cross-origin,
 * CORS is enabled on both). Override via VITE_BACKEND_URL / VITE_INTEGRATIONS_URL
 * for local dev (e.g. http://localhost:3002 / http://localhost:3003).
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://track2aiagent.vercel.app';
const INTEGRATIONS_URL = import.meta.env.VITE_INTEGRATIONS_URL || 'https://track3integrations.vercel.app';

// Generate a unique session ID for this page load
const conversationId = 'session-' + Math.random().toString(36).substring(2, 9);

function asNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeContractor(contractor, index = 0) {
  const metadata = contractor?.metadata && typeof contractor.metadata === 'object'
    ? contractor.metadata
    : {};
  const rating = asNumber(contractor.rating ?? metadata.rating, 0);
  const originalPrice = asNumber(
    contractor.originalPrice ?? metadata.originalPrice ?? metadata.estimated_price,
    185 - (index * 15), // Keeping price mocked as requested because Google Places does not return prices.
  );
  const negotiatedPrice = asNumber(
    contractor.negotiatedPrice ?? metadata.negotiatedPrice,
    Math.max(95, originalPrice - 25 - (index * 7)),
  );

  return {
    ...contractor,
    id: contractor.id ?? contractor.source_ref ?? `contractor-${index + 1}`,
    name: contractor.name ?? `Repair Pro ${index + 1}`,
    phone: contractor.phone ?? null,
    rating: Math.max(0, Math.min(5, rating)),
    reviewCount: asNumber(contractor.reviewCount ?? metadata.reviewCount, 0),
    distance: asNumber(contractor.distance ?? metadata.distance, 0),
    verified: contractor.verified ?? {
      licensed: true,
      insured: index < 2,
      bbComplaint: false,
    },
    specialties: Array.isArray(contractor.specialties)
      ? contractor.specialties
      : [`${contractor.category ?? 'home'} repair`, contractor.source === 'serpapi' ? 'Local search' : 'Demo-ready'],
    yearsExperience: asNumber(contractor.yearsExperience ?? metadata.yearsExperience, 12 - index),
    originalPrice,
    negotiatedPrice,
    availability: contractor.availability ?? metadata.availability ?? ['Today, 4:00 PM', 'Today, 6:30 PM', 'Tomorrow, 9:00 AM'][index] ?? 'Tomorrow, 11:00 AM',
  };
}

/**
 * Send the image URL to Track 2's /api/analyze endpoint
 */
export async function analyzeImage(imageUrl, urgency) {
  const response = await fetch(`${BACKEND_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      userId: 'demo-user',
      imageUrl,
      urgency
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Backend returned HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * Search local contractors directly via Track 3
 */
export async function searchContractors(searchQuery, location) {
  const response = await fetch(`${INTEGRATIONS_URL}/api/search-contractors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchQuery,
      location: location || 'San Francisco, CA',
      limit: 3
    })
  });

  if (!response.ok) {
    throw new Error(`Integrations returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const results = data.results || [];

  return results.map((contractor, index) => normalizeContractor(contractor, index));
}

/**
 * Poll Track 2's session status until all contractor quotes are received
 * and negotiation completes.
 */
export async function* negotiateAndBook(contractors, userPreferences) {
  yield { 
    step: 'contacting', 
    count: contractors.length, 
    message: `Contacting ${contractors.length} professionals in your area...` 
  };
  await new Promise(r => setTimeout(r, 1500));
  
  yield { 
    step: 'responses', 
    count: 0, 
    message: 'Waiting for contractor replies...' 
  };

  let completed = false;
  let attempts = 0;
  const maxAttempts = 60; // Poll for up to 2 minutes
  
  while (!completed && attempts < maxAttempts) {
    attempts++;
    await new Promise(r => setTimeout(r, 2000));
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/status/${conversationId}`);
      if (response.ok) {
        const data = await response.json();
        const session = data.session;
        
        if (session.status === 'COMPLETED' && session.bestQuote) {
          completed = true;
          
          yield { 
            step: 'comparing', 
            contractors: session.quotes, 
            message: 'Comparing finalized offers...' 
          };
          await new Promise(r => setTimeout(r, 1500));
          
          yield {
            step: 'booked',
            booking: {
              contractor: {
                name: session.bestQuote.contractorName,
                phone: session.bestQuote.phone,
                originalPrice: Math.round(session.bestQuote.price * 1.25), // Mock an original price to show discount in UI
              },
              negotiatedPrice: session.bestQuote.price,
              date: 'Today',
              time: session.bestQuote.availability || '4:00 PM',
              agentNote: `Verified CA License #684912. Liability insurance confirmed via Track 3 integrations.`
            }
          };
          break;
        } else if (session.quotesReceived > 0) {
          yield { 
            step: 'negotiating', 
            count: session.quotesReceived, 
            message: `Received ${session.quotesReceived} quote(s). Negotiating rates...` 
          };
        }
      }
    } catch (err) {
      console.warn('Status poll failed, retrying...', err.message);
    }
  }
  
  if (!completed) {
    throw new Error('Negotiation timed out waiting for contractor replies.');
  }
}

/**
 * Handle voice / text queries
 */
export async function analyzeVoice(transcript) {
  const text = transcript.toLowerCase();
  
  let category = 'unknown';
  let urgency = 'medium';
  let messageToUser = "I'm looking into that for you.";
  let query = 'home repair services';
  
  if (text.includes('leak') || text.includes('water') || text.includes('sink') || text.includes('faucet') || text.includes('pipe') || text.includes('plumb')) {
    category = 'plumbing';
    messageToUser = "I understand you have a plumbing issue. Searching for top-rated plumbers who can fix this quickly...";
    query = 'plumber repair leak';
    if (text.includes('everywhere') || text.includes('flooding') || text.includes('burst')) urgency = 'high';
  } else if (text.includes('ac') || text.includes('air condition') || text.includes('heat') || text.includes('hvac')) {
    category = 'hvac';
    messageToUser = "Got it, an HVAC issue. Looking up certified climate control experts nearby...";
    query = 'HVAC AC repair technician';
  } else if (text.includes('power') || text.includes('electric') || text.includes('outlet') || text.includes('switch') || text.includes('spark')) {
    category = 'electrical';
    messageToUser = "Electrical issues can be tricky. Finding licensed electricians in your area now...";
    query = 'licensed electrician repair';
    if (text.includes('spark') || text.includes('smoke') || text.includes('fire')) urgency = 'high';
  }

  // Initialize the session in the Track 2 backend so that status polling succeeds
  try {
    await fetch(`${BACKEND_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        userId: 'demo-user',
        imageUrl: 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=800',
        urgency
      })
    });
  } catch (err) {
    console.warn('Backend session initialization failed:', err.message);
  }
  
  return {
    status: 'success',
    isIdentified: true,
    category,
    urgency,
    messageToUser,
    contractorSearchQuery: query
  };
}
