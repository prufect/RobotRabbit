function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    category: 'hvac', 
    brand: 'Carrier', 
    modelNumber: 'Infinity 26', 
    messageToUser: 'I\'ve identified a Carrier Infinity 26 Air Conditioner. Searching for certified HVAC technicians nearby...', 
    contractorSearchQuery: 'Carrier HVAC repair San Francisco' 
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
  yield { step: 'contacting', count: contractors.length, message: `Contacting ${contractors.length} professionals in your area...` };
  await delay(1500);
  
  yield { step: 'responses', count: 4, message: '4 professionals replied with availability.' };
  await delay(1000);
  
  yield { step: 'negotiating', count: 3, message: 'Negotiating rates with the top 3 certified pros...' };
  await delay(2500);
  
  // Calculate negotiated prices
  const negotiatedContractors = contractors.slice(0, 3).map(c => {
    const discount = Math.floor(c.originalPrice * (0.1 + Math.random() * 0.15)); // 10-25% discount
    return { ...c, negotiatedPrice: c.originalPrice - discount };
  });
  
  // Sort by best value (combination of rating, distance, price)
  negotiatedContractors.sort((a, b) => {
    const scoreA = (a.rating * 10) - (a.negotiatedPrice * 0.1) - a.distance;
    const scoreB = (b.rating * 10) - (b.negotiatedPrice * 0.1) - b.distance;
    return scoreB - scoreA;
  });
  
  yield { step: 'comparing', contractors: negotiatedContractors, message: 'Comparing finalized offers...' };
  await delay(1500);
  
  const bestContractor = negotiatedContractors[0];
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
  
  return {
    status: 'success',
    isIdentified: true,
    category,
    urgency,
    messageToUser,
    contractorSearchQuery: query
  };
}
