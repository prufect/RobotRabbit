/**
 * Mock data used when Track 3 is unavailable or in development mode.
 *
 * Provides realistic contractor search results, raw reply messages,
 * and pre-parsed quote objects for integration testing.
 */

// ─── Mock Contractor Search Results ──────────────────────────────────────────

export const MOCK_CONTRACTORS = [
  { name: "Bob's Quick HVAC",   phone: '+14155550101', rating: 4.8 },
  { name: 'SF Carrier Experts', phone: '+14155550202', rating: 4.5 },
  { name: 'Bay Area Fix-It',    phone: '+14155550303', rating: 4.7 },
];

// ─── Mock Contractor Reply Messages (natural language) ───────────────────────

export const MOCK_REPLY_MESSAGES = [
  {
    contractorPhone: '+14155550101',
    contractorName: "Bob's Quick HVAC",
    messageBody: 'Yes, available in 1 hour. $150 call-out fee. Can have it fixed same day.',
  },
  {
    contractorPhone: '+14155550202',
    contractorName: 'SF Carrier Experts',
    messageBody: "We can come out in about 2 hours. Our rate is $120 for the call-out plus parts. We're certified Carrier dealers.",
  },
  {
    contractorPhone: '+14155550303',
    contractorName: 'Bay Area Fix-It',
    messageBody: 'Hi! I can squeeze you in tomorrow morning, around 9 AM. $180 flat rate including diagnosis. Parts extra if needed.',
  },
];

// ─── Mock Parsed Quotes ─────────────────────────────────────────────────────

export const MOCK_PARSED_QUOTES = [
  {
    contractorName: "Bob's Quick HVAC",
    contractorPhone: '+14155550101',
    available: true,
    price: 150,
    availability: '1 hour',
    rawMessage: MOCK_REPLY_MESSAGES[0].messageBody,
  },
  {
    contractorName: 'SF Carrier Experts',
    contractorPhone: '+14155550202',
    available: true,
    price: 120,
    availability: '2 hours',
    rawMessage: MOCK_REPLY_MESSAGES[1].messageBody,
  },
  {
    contractorName: 'Bay Area Fix-It',
    contractorPhone: '+14155550303',
    available: true,
    price: 180,
    availability: 'tomorrow morning',
    rawMessage: MOCK_REPLY_MESSAGES[2].messageBody,
  },
];
