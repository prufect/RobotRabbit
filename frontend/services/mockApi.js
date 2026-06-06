function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let liveConversations = [];

export async function analyzeImage(imageUrl, urgency) {
  await delay(2000);
  
  // 50% chance to need more info on first try (for the hackathon demo)
  const needsMoreInfo = Math.random() > 0.5 && !imageUrl.includes('closer');
  
  if (needsMoreInfo) {
    return { 
      status: 'success', 
      isIdentified: false, 
      messageToUser: 'I can see what looks like an electrical panel, but the model sticker is too blurry. Can you take a closer photo of the label on the inside door?', 
      category: 'unknown' 
    };
  }
  
  return { 
    status: 'success', 
    isIdentified: true, 
    category: 'general', 
    brand: null, 
    modelNumber: null, 
    messageToUser: 'I can see a home maintenance issue. Let me find qualified professionals nearby...', 
    contractorSearchQuery: 'home repair maintenance contractor San Francisco' 
  };
}

export async function searchContractors(searchQuery, location) {
  await delay(1500);
  
  return [
    { 
      id: 'c1',
      name: 'Bay Area Climate Pros', 
      phone: '+14155550101', 
      rating: 4.9, 
      distance: 2.3, 
      reviewCount: 412, 
      verified: { licensed: true, insured: true, bbComplaint: false },
      specialties: ['Carrier certified', 'Emergency repair'], 
      yearsExperience: 15,
      originalPrice: 185, 
      availability: 'Today, 4:00 PM' 
    },
    { 
      id: 'c2',
      name: 'SwiftFix HVAC Services', 
      phone: '+14155550102', 
      rating: 4.7, 
      distance: 4.1, 
      reviewCount: 189, 
      verified: { licensed: true, insured: true, bbComplaint: false },
      specialties: ['AC Repair', 'Maintenance'], 
      yearsExperience: 8,
      originalPrice: 150, 
      availability: 'Today, 6:30 PM' 
    },
    { 
      id: 'c3',
      name: 'Martinez Heating & Air', 
      phone: '+14155550103', 
      rating: 4.5, 
      distance: 5.5, 
      reviewCount: 86, 
      verified: { licensed: true, insured: false, bbComplaint: false },
      specialties: ['Residential HVAC'], 
      yearsExperience: 22,
      originalPrice: 140, 
      availability: 'Tomorrow, 9:00 AM' 
    },
    { 
      id: 'c4',
      name: 'Elite Climate Control', 
      phone: '+14155550104', 
      rating: 4.8, 
      distance: 8.2, 
      reviewCount: 305, 
      verified: { licensed: true, insured: true, bbComplaint: false },
      specialties: ['Carrier', 'Trane', 'Lennox'], 
      yearsExperience: 12,
      originalPrice: 195, 
      availability: 'Tomorrow, 11:00 AM' 
    },
    { 
      id: 'c5',
      name: 'SF City HVAC', 
      phone: '+14155550105', 
      rating: 4.2, 
      distance: 1.5, 
      reviewCount: 45, 
      verified: { licensed: false, insured: false, bbComplaint: false },
      specialties: ['General repair'], 
      yearsExperience: 3,
      originalPrice: 120, 
      availability: 'Today, 2:00 PM' 
    }
  ];
}

export async function* negotiateAndBook(contractors, userPreferences) {
  const topContractors = contractors.slice(0, 3);
  
  const now = Date.now();
  const t = (offsetMs) => new Date(now + offsetMs).toISOString();

  liveConversations = topContractors.map((c, i) => ({
    phone: c.phone || `+1555000000${i}`,
    name: c.name,
    requestId: 'live-session',
    messageCount: 1,
    lastMessageAt: t(0),
    lastMessage: '🛠️ *New Job Request*...',
    messages: [
      { id: `m_out_${i}_1`, direction: 'outbound', channel: 'sms', kind: 'outreach', body: `🛠️ *New Job Request* — Please provide a quote for the requested repair.`, at: t(0) }
    ]
  }));

  yield { step: 'contacting', count: topContractors.length, message: `Contacting ${topContractors.length} professionals in your area...` };
  await delay(1500);

  const quotedContractors = [];
  for (let i = 0; i < topContractors.length; i++) {
    const c = topContractors[i];
    
    yield { step: 'contacting-individual', count: i + 1, message: `📞 Contacting ${c.name}...` };
    await delay(1500 + Math.random() * 1500);
    
    const discount = Math.floor((c.originalPrice || 180) * (0.1 + Math.random() * 0.15));
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

    yield { step: 'responses', count: i + 1, message: `✅ ${c.name} replied: Available ${avail}, $${negotiatedPrice}` };
    await delay(800 + Math.random() * 700);
    
    quotedContractors.push({
      ...c,
      negotiatedPrice,
      availability: avail,
    });
  }
  
  yield { step: 'negotiating', count: quotedContractors.length, message: 'Negotiating rates with the top 3 certified pros...' };
  await delay(2500);
  
  quotedContractors.sort((a, b) => {
    const scoreA = (a.rating * 10) - (a.negotiatedPrice * 0.1) - a.distance;
    const scoreB = (b.rating * 10) - (b.negotiatedPrice * 0.1) - b.distance;
    return scoreB - scoreA;
  });
  
  const bestContractor = quotedContractors[0];

  liveConversations.forEach((conv, i) => {
      const accepted = conv.name === bestContractor.name;
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

  yield { step: 'comparing', contractors: quotedContractors, message: 'Comparing finalized offers...' };
  await delay(1500);
  
  yield { 
    step: 'booked', 
    booking: { 
      contractor: bestContractor, 
      negotiatedPrice: bestContractor.negotiatedPrice, 
      date: bestContractor.availability.split(',')[0],
      time: bestContractor.availability.split(',')[1].trim(),
      agentNote: `Verified CA License #${Math.floor(Math.random()*900000)+100000}. Current liability insurance confirmed. No BBB complaints in the last 5 years.`
    } 
  };
}

export async function analyzeVoice(transcript) {
  await delay(1500);
  const text = transcript.toLowerCase();
  
  let category = 'general';
  let urgency = 'medium';
  let messageToUser = "I'm looking into that for you. Searching for the right professionals nearby...";
  let query = transcript.trim(); // Default: use the user's own words
  
  if (/\b(leak|water|sink|faucet|pipe|plumb|plumber|drain|toilet|sewer)\b/i.test(text)) {
    category = 'plumbing';
    messageToUser = "I understand you have a plumbing issue. Searching for top-rated plumbers who can fix this quickly...";
    query = 'plumber repair';
    if (/\b(everywhere|flooding|burst|emergency)\b/i.test(text)) urgency = 'high';
  } else if (/\b(ac|air condition|air conditioning|heater|heating|hvac|furnace|thermostat)\b/i.test(text)) {
    category = 'hvac';
    messageToUser = "Got it, an HVAC issue. Looking up certified climate control experts nearby...";
    query = 'HVAC AC repair technician';
  } else if (/\b(power|electric|electrician|outlet|switch|spark|wire|wiring|breaker|circuit)\b/i.test(text)) {
    category = 'electrical';
    messageToUser = "Electrical issues can be tricky. Finding licensed electricians in your area now...";
    query = 'licensed electrician repair';
    if (/\b(spark|smoke|fire)\b/i.test(text)) urgency = 'high';
  } else if (/\b(paint|painting|painter)\b/i.test(text)) {
    category = 'painting';
    messageToUser = "A fresh coat of paint sounds great. Looking for top-rated painters nearby...";
    query = 'house painter contractor';
  } else if (/\b(roof|roofing|roofer|gutter|shingle)\b/i.test(text)) {
    category = 'roofing';
    messageToUser = "Roof issues need expert attention. Finding qualified roofers nearby...";
    query = 'roof repair contractor';
  } else if (/\b(architect|architecture|redesign|remodel|renovation)\b/i.test(text)) {
    category = 'architecture';
    messageToUser = "Great project! Searching for residential architects and designers nearby...";
    query = 'residential architect home design';
  } else if (/\b(landscape|landscaping|landscaper|garden|gardener|lawn|yard|tree)\b/i.test(text)) {
    category = 'landscaping';
    messageToUser = "Let's find the right landscaping professional for you...";
    query = 'landscaping contractor';
  } else if (/\b(carpenter|carpentry|cabinet|woodwork|deck|fence)\b/i.test(text)) {
    category = 'carpentry';
    messageToUser = "Searching for skilled carpenters and woodworkers nearby...";
    query = 'carpenter contractor';
  } else if (/\b(lock|locksmith|key|deadbolt|door lock)\b/i.test(text)) {
    category = 'locksmith';
    messageToUser = "Finding locksmiths who can help you right away...";
    query = 'locksmith service';
  } else if (/\b(clean|cleaning|cleaner|maid|housekeeping|janitor)\b/i.test(text)) {
    category = 'cleaning';
    messageToUser = "Looking for professional cleaning services nearby...";
    query = 'house cleaning service';
  } else if (/\b(handyman|general repair|fix|broken|maintenance)\b/i.test(text)) {
    category = 'handyman';
    messageToUser = "Searching for reliable handymen in your area...";
    query = 'handyman home repair';
  }
  // If none matched, category stays 'general' and query stays as the user's raw transcript
  
  return {
    status: 'success',
    isIdentified: true,
    category,
    urgency,
    messageToUser,
    contractorSearchQuery: query
  };
}

// Mock Message Center threads so the panel demos without a live backend.
export async function getConversations() {
  await delay(300);
  
  if (liveConversations && liveConversations.length > 0) {
    return [...liveConversations];
  }
  
  const now = Date.now();
  const t = (min) => new Date(now - min * 60000).toISOString();
  return [
    {
      phone: '+14155550707',
      name: 'Pacific Plumbing',
      requestId: 'demo-session',
      messageCount: 3,
      lastMessageAt: t(1),
      lastMessage: "Congrats! You've got the job.",
      messages: [
        { id: 'm1', direction: 'outbound', channel: 'whatsapp', kind: 'outreach', body: '🛠️ *New Job Request* from a homeowner about a plumbing issue.\n\n*Issue:* Kohler water heater\n*Urgency:* 🚨 URGENT', at: t(8) },
        { id: 'm2', direction: 'inbound', channel: 'whatsapp', kind: 'reply', body: 'YES, $120, there in 30 mins', at: t(4) },
        { id: 'm3', direction: 'outbound', channel: 'whatsapp', kind: 'booking', body: "Congrats! You've got the job. The homeowner is expecting you.", at: t(1) },
      ],
    },
    {
      phone: '+14155550808',
      name: 'Mission Drain Masters',
      requestId: 'demo-session',
      messageCount: 2,
      lastMessageAt: t(3),
      lastMessage: 'Thanks for responding — homeowner went with another provider.',
      messages: [
        { id: 'm4', direction: 'outbound', channel: 'whatsapp', kind: 'outreach', body: '🛠️ *New Job Request* — Kohler water heater', at: t(8) },
        { id: 'm5', direction: 'inbound', channel: 'whatsapp', kind: 'reply', body: 'Yes available, $180', at: t(5) },
      ],
    },
  ];
}
