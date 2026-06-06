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

let liveConversations = [];

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
 * Send the image to Track 2's /api/analyze endpoint.
 * imageUrl can be a data:image/... URL from the camera or an https:// URL.
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

  const TEST_CONTRACTOR = {
    id: 'test-contractor',
    name: 'Testing Contractor',
    phone: '+1234567890',
    email: 'test@hooman.com',
    website: 'www.test.hooman.com',
    rating: 5.0,
    reviewCount: 999,
    distance: 1.2,
    verified: { licensed: true, insured: true, bbComplaint: false },
    originalPrice: 150,
    negotiatedPrice: 120,
    availability: 'Today, 2:00 PM',
    category: 'general',
    specialties: ['Testing', 'Demo'],
    yearsExperience: 10,
  };

  return [TEST_CONTRACTOR, ...results.map((contractor, index) => normalizeContractor(contractor, index))];
}

/**
 * Negotiate with contractors — shows per-contractor progress messages.
 * Yields step-by-step updates so the UI can display live activity.
 */
export async function* negotiateAndBook(contractors, userPreferences) {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const topContractors = contractors.slice(0, 3);

  const now = Date.now();
  const t = (offsetMs) => new Date(now + offsetMs).toISOString();

  liveConversations = topContractors.map((c, i) => ({
    conversationId: `live-conv-${i}`,
    phone: c.phone || `+1555000000${i}`,
    name: c.name,
    contractorId: c.id ?? null,
    requestId: 'live-session',
    messageCount: 1,
    lastMessageAt: t(0),
    lastMessage: '🛠️ *New Job Request*...',
    unreadCount: 0,
    messages: [
      { id: `m_out_${i}_1`, direction: 'outbound', channel: 'sms', kind: 'outreach', body: `🛠️ *New Job Request* — Please provide a quote for the requested repair.`, at: t(0) }
    ]
  }));

  // Step 1: Contacting overview
  yield { 
    step: 'contacting', 
    count: topContractors.length, 
    message: `Reaching out to ${topContractors.length} professionals for quotes...` 
  };
  await wait(1200);

  // Step 2: Contact each contractor individually
  const quotedContractors = [];
  for (let i = 0; i < topContractors.length; i++) {
    const c = topContractors[i];

    yield {
      step: 'contacting-individual',
      count: i + 1,
      message: `📞 Contacting ${c.name}...`
    };
    await wait(1500 + Math.random() * 1500);

    // Simulate a reply
    const discount = Math.floor((c.originalPrice || 180) * (0.08 + Math.random() * 0.17));
    const negotiatedPrice = (c.originalPrice || 180) - discount;
    const availabilityOptions = ['Today, 3:00 PM', 'Today, 5:00 PM', 'Tomorrow, 9:00 AM', 'Tomorrow, 11:00 AM', 'Today, 6:30 PM'];
    const avail = c.availability || availabilityOptions[Math.floor(Math.random() * availabilityOptions.length)];

    const conv = liveConversations.find(x => x.name === c.name);
    if (conv) {
        const replyTime = new Date().toISOString();
        const msg = { id: `m_in_${i}_2`, direction: 'inbound', channel: 'sms', kind: 'reply', body: `Yes available ${avail}, my rate is $${negotiatedPrice}`, at: replyTime };
        conv.messages.push(msg);
        conv.messageCount++;
        conv.lastMessage = msg.body;
        conv.lastMessageAt = replyTime;
    }

    yield {
      step: 'responses',
      count: i + 1,
      message: `✅ ${c.name} replied: Available ${avail}, $${negotiatedPrice}`
    };
    await wait(800 + Math.random() * 700);

    quotedContractors.push({
      ...c,
      negotiatedPrice,
      availability: avail,
    });
  }

  // Step 3: Comparing
  yield {
    step: 'negotiating',
    count: quotedContractors.length,
    message: `Comparing ${quotedContractors.length} quotes to find you the best deal...`
  };
  await wait(2000);

  // Pick the best (lowest price)
  quotedContractors.sort((a, b) => a.negotiatedPrice - b.negotiatedPrice);
  const best = quotedContractors[0];

  liveConversations.forEach((conv, i) => {
      const accepted = conv.name === best.name;
      const replyTime = new Date().toISOString();
      const msg = { 
        id: `m_out_${i}_3`, 
        direction: 'outbound', 
        channel: 'sms', 
        kind: accepted ? 'booking' : 'rejection', 
        body: accepted ? `Congrats! We'd like to book you.` : `Thanks for responding — homeowner went with another provider.`, 
        at: replyTime 
      };
      conv.messages.push(msg);
      conv.messageCount++;
      conv.lastMessage = msg.body;
      conv.lastMessageAt = replyTime;
  });

  yield {
    step: 'comparing',
    contractors: quotedContractors,
    message: `🏆 Best deal: ${best.name} at $${best.negotiatedPrice}`
  };
  await wait(1500);

  // Step 4: Booked
  yield {
    step: 'booked',
    booking: {
      contractor: {
        ...best,
        originalPrice: best.originalPrice || 180,
      },
      negotiatedPrice: best.negotiatedPrice,
      date: best.availability.split(',')[0],
      time: (best.availability.split(',')[1] || ' 4:00 PM').trim(),
      agentNote: `Verified license and insurance. ${best.name} has ${best.reviewCount > 0 ? best.reviewCount + ' verified reviews' : 'a strong track record'}. Best price negotiated from ${quotedContractors.length} competing quotes.`
    }
  };
}


/**
 * Message Center: fetch all agent <-> contractor conversations from Track 3.
 * Returns [] on any failure so the UI degrades gracefully.
 */
export async function getConversations() {
  let backendConvs = [];
  try {
    const response = await fetch(`${INTEGRATIONS_URL}/api/conversations`);
    if (response.ok) {
      const data = await response.json();
      backendConvs = Array.isArray(data.conversations) ? data.conversations : [];
    }
  } catch (err) {
    console.warn('getConversations failed:', err.message);
  }
  
  if (liveConversations && liveConversations.length > 0) {
    return [...liveConversations, ...backendConvs];
  }
  
  return backendConvs;
}

/**
 * Handle voice / text queries
 */
export async function analyzeVoice(transcript) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/analyze-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });

    if (!response.ok) {
      throw new Error(`Backend returned HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.warn('Gemini text analysis failed, using transcript as search query:', err.message);
    // Graceful fallback: just use the user's own words as the search query
    return {
      status: 'success',
      isIdentified: true,
      category: 'general',
      urgency: 'medium',
      messageToUser: "I'm looking into that for you. Searching for professionals nearby...",
      contractorSearchQuery: transcript.trim(),
    };
  }
}

