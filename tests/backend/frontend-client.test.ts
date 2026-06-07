import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

describe('frontend InsForge integration helper', () => {
  it('stores both storage URL and key before invoking the analyze function', () => {
    const source = readFileSync('track_1_frontend/insforgeAgentClient.ts', 'utf8');

    expect(source).toMatch(/storage\s*\.\s*from\('repair-photos'\)/);
    expect(source).toContain('image_url: upload.data.url');
    expect(source).toContain('image_key: upload.data.key');
    expect(source).toContain("functions.invoke('analyze'");
    expect(source).toContain('.insert([');
  });

  it('ships a browser adapter for the deployed frontend flow', async () => {
    const servicePath = 'frontend/services/insforgeApi.js';

    expect(existsSync(servicePath), 'frontend/services/insforgeApi.js should exist').toBe(true);
    if (!existsSync(servicePath)) return;

    const source = readFileSync(servicePath, 'utf8');
    expect(source).toContain("const REPAIR_PHOTO_BUCKET = 'repair-photos'");
    expect(source).toMatch(/storage\s*\.\s*from\(REPAIR_PHOTO_BUCKET\)/);
    expect(source).toContain("database.from('repair_requests')");
    expect(source).toContain('image_url: upload.data.url');
    expect(source).toContain('image_key: upload.data.key');
    expect(source).toContain("functions.invoke('analyze'");
    expect(source).toContain("functions.invoke('search-contractors'");
    expect(source).toContain("functions.invoke('notify-contractors'");
    expect(source).toContain("functions.invoke('status'");
  });

  it('keeps hidden Message Center elements from intercepting clicks', () => {
    const source = readFileSync('frontend/style.css', 'utf8');

    expect(source).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });

  it('uses the real InsForge adapter from the Vercel frontend entrypoint', () => {
    const source = readFileSync('frontend/app.js', 'utf8');

    expect(source).toContain("./services/insforgeApi.js");
    expect(source).not.toContain("./services/mockApi.js");
  });

  it('keeps the deployed frontend entrypoint syntactically valid', () => {
    expect(() => execFileSync(process.execPath, ['--check', 'frontend/app.js'])).not.toThrow();
  });

  it('waits for the homeowner to tap contractor cards before outreach starts', () => {
    const source = readFileSync('frontend/app.js', 'utf8');

    expect(source).toContain('Tap any contractor to negotiate.');
    expect(source).toContain('You can contact more than one');
    expect(source).toContain('contractor-selected');
    expect(source).not.toContain('startNegotiation(autoNegotiationButton);');
    expect(source).not.toContain("I'm contacting the top 3 now.");
  });

  it('requires frontend auth and exposes Google OAuth when InsForge is configured', () => {
    const appSource = readFileSync('frontend/app.js', 'utf8');
    const serviceSource = readFileSync('frontend/services/insforgeApi.js', 'utf8');

    expect(serviceSource).toContain("signInWithOAuth('google'");
    expect(serviceSource).toContain('signInWithGoogle');
    expect(serviceSource).toContain('verifyEmail');
    expect(serviceSource).toContain('resendVerificationEmail');
    expect(appSource).toContain('name="otp"');
    expect(appSource).toContain('Verify Email');
    expect(appSource).toContain('Resend code');
    expect(appSource).toContain("refreshAuthState({ requireLogin: true })");
    expect(appSource).toContain('if (!requireSignedIn()) return;');
    expect(appSource).toContain('Continue with Google');
    expect(appSource).toContain('required: true');
  });

  it('verifies and resends email verification codes through the InsForge SDK', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { createRepairApi } = await import(serviceUrl);
    const verifyEmail = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com', emailVerified: true }, accessToken: 'token' },
      error: null,
    });
    const resendVerificationEmail = vi.fn().mockResolvedValue({
      data: { success: true, message: 'Verification email sent' },
      error: null,
    });

    const api = createRepairApi({
      config: {
        baseUrl: 'https://pzv974n7.us-east.insforge.app',
        anonKey: 'anon',
        useMock: false,
      },
      insforge: {
        auth: {
          getCurrentUser: vi.fn(),
          verifyEmail,
          resendVerificationEmail,
        },
      },
    });

    await expect(api.verifyEmail({ email: 'test@example.com', otp: '123456' })).resolves.toEqual({
      user: { id: 'user-1', email: 'test@example.com', emailVerified: true },
      accessToken: 'token',
    });
    await expect(api.resendVerificationEmail({
      email: 'test@example.com',
      redirectTo: 'http://localhost:3000/',
    })).resolves.toEqual({ success: true, message: 'Verification email sent' });

    expect(verifyEmail).toHaveBeenCalledWith({ email: 'test@example.com', otp: '123456' });
    expect(resendVerificationEmail).toHaveBeenCalledWith({
      email: 'test@example.com',
      redirectTo: 'http://localhost:3000/',
    });
  });

  it('does not poll the stale Track 3 conversations endpoint before InsForge has a request', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { createRepairApi } = await import(serviceUrl);
    const fallbackApi = { getConversations: vi.fn().mockResolvedValue([{ phone: '+1' }]) };

    const api = createRepairApi({
      config: {
        baseUrl: 'https://pzv974n7.us-east.insforge.app',
        anonKey: '',
        useMock: false,
      },
      fallbackApi,
    });

    await expect(api.getConversations()).resolves.toEqual([]);
    expect(fallbackApi.getConversations).not.toHaveBeenCalled();
  });

  it('builds Message Center threads from the active InsForge status response', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { buildConversationsFromStatus } = await import(serviceUrl);

    const conversations = buildConversationsFromStatus({
      session: {
        requestId: 'request-1',
        notifications: [{
          id: 'notification-1',
          contractor_id: 'contractor-1',
          channel: 'whatsapp',
          destination: '+14155550101',
          status: 'sent',
          message: 'New job request.',
          created_at: '2026-06-06T20:00:00.000Z',
        }],
        quotes: [{
          id: 'quote-1',
          contractor_id: 'contractor-1',
          contractor_name: 'Bay Area Climate Pros',
          contractor_phone: '+14155550101',
          raw_message: 'YES, $120, today at 4pm',
          available: true,
          price: 120,
          created_at: '2026-06-06T20:05:00.000Z',
        }],
        messages: [],
      },
    }, [{
      id: 'contractor-1',
      name: 'Bay Area Climate Pros',
      phone: '+14155550101',
    }]);

    expect(conversations).toEqual([expect.objectContaining({
      phone: '+14155550101',
      name: 'Bay Area Climate Pros',
      requestId: 'request-1',
      messageCount: 2,
      lastMessage: 'YES, $120, today at 4pm',
    })]);
    expect(conversations[0].messages).toEqual([
      expect.objectContaining({ direction: 'outbound', body: 'New job request.' }),
      expect.objectContaining({ direction: 'inbound', body: 'YES, $120, today at 4pm' }),
    ]);
  });

  it('surfaces Telegram contractor replies as pending homeowner approvals', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { buildConversationsFromStatus } = await import(serviceUrl);

    const conversations = buildConversationsFromStatus({
      session: {
        requestId: 'request-1',
        approvalSummary: { pending: 1, approved: 0, rejected: 0 },
        notifications: [{
          id: 'notification-telegram-1',
          contractor_id: 'contractor-telegram-1',
          channel: 'telegram',
          destination: '123456789',
          status: 'replied',
          message: '[Demo contractor: Bay Area Climate Pros]\nCan you quote this repair?',
          reply_body: 'Yes, I can do it today at 4pm for $120.',
          reply_received_at: '2026-06-06T20:04:00.000Z',
          reply_message_id: 'tg-42',
          created_at: '2026-06-06T20:00:00.000Z',
        }],
        quotes: [{
          id: 'quote-telegram-1',
          contractor_id: 'contractor-telegram-1',
          contractor_name: 'Bay Area Climate Pros',
          contractor_phone: null,
          raw_message: 'Yes, I can do it today at 4pm for $120.',
          available: true,
          price: 120,
          approval_status: 'pending',
          created_at: '2026-06-06T20:04:00.000Z',
        }],
        pendingApprovals: [{
          id: 'quote-telegram-1',
          contractor_id: 'contractor-telegram-1',
          contractor_name: 'Bay Area Climate Pros',
          raw_message: 'Yes, I can do it today at 4pm for $120.',
          approval_status: 'pending',
        }],
        messages: [],
      },
    }, [{
      id: 'contractor-telegram-1',
      name: 'Bay Area Climate Pros',
      phone: null,
    }]);

    expect(conversations).toEqual([expect.objectContaining({
      phone: 'telegram:123456789',
      name: 'Bay Area Climate Pros',
      requestId: 'request-1',
      approvalStatus: 'pending',
      needsApproval: true,
      lastMessage: 'Yes, I can do it today at 4pm for $120.',
    })]);
    expect(conversations[0].messages).toEqual([
      expect.objectContaining({ channel: 'telegram', direction: 'outbound', kind: 'sent' }),
      expect.objectContaining({ channel: 'telegram', direction: 'inbound', kind: 'reply', body: 'Yes, I can do it today at 4pm for $120.' }),
      expect.objectContaining({ channel: 'insforge', direction: 'inbound', kind: 'quote', approvalStatus: 'pending' }),
    ]);
  });

  it('builds an in-chat booking proposal from a pending contractor quote', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { buildQuoteApprovalProposal } = await import(serviceUrl);

    const proposal = buildQuoteApprovalProposal({
      session: {
        requestId: 'request-1',
        status: 'pending_approval',
        pendingApprovals: [{
          id: 'quote-1',
          contractor_id: 'contractor-1',
          contractor_name: 'Testing Contractor',
          raw_message: 'Available today at 4 for $300.',
          available: true,
          price: 300,
          availability: 'today at 4',
          approval_status: 'pending',
        }],
        bestQuote: {
          id: 'quote-1',
          contractor_id: 'contractor-1',
          contractor_name: 'Testing Contractor',
          raw_message: 'Available today at 4 for $300.',
          available: true,
          price: 300,
          availability: 'today at 4',
          approval_status: 'pending',
        },
      },
    });

    expect(proposal).toEqual(expect.objectContaining({
      quoteId: 'quote-1',
      contractorId: 'contractor-1',
      message: 'Testing Contractor replied: "Available today at 4 for $300." Should we book?',
      booking: expect.objectContaining({
        negotiatedPrice: 300,
        date: 'Today',
        time: '4:00 PM',
      }),
    }));
    expect(proposal.booking.contractor).toEqual(expect.objectContaining({
      id: 'contractor-1',
      name: 'Testing Contractor',
    }));
  });

  it('does not rebuild an approval prompt for an already decided quote', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { buildQuoteApprovalProposal } = await import(serviceUrl);

    const proposal = buildQuoteApprovalProposal({
      session: {
        requestId: 'request-1',
        status: 'booked',
        bestQuote: {
          id: 'quote-1',
          contractor_id: 'contractor-1',
          contractor_name: 'Testing Contractor',
          raw_message: 'Available today at 4 for $300.',
          available: true,
          price: 300,
          approval_status: 'approved',
        },
        quotes: [{
          id: 'quote-1',
          contractor_id: 'contractor-1',
          contractor_name: 'Testing Contractor',
          raw_message: 'Available today at 4 for $300.',
          available: true,
          price: 300,
          approval_status: 'approved',
        }],
      },
    });

    expect(proposal).toBeNull();
  });

  it('renders quote approval as a chat booking action before finalizing', () => {
    const source = readFileSync('frontend/app.js', 'utf8');

    expect(source).toContain('createQuoteApprovalPrompt');
    expect(source).toContain('data-action="book-quote"');
    expect(source).toContain('finalizeBooking(');
    expect(source).toContain('Should we book?');
  });

  it('does not auto-confirm legacy booked negotiation states', () => {
    const source = readFileSync('frontend/app.js', 'utf8');

    expect(source).toContain('createBookingApprovalFromBooking');
    expect(source).not.toContain('Great news! I successfully negotiated');
    expect(source).not.toContain('bookingConfirm.show(finalBooking)');
  });

  it('lets the homeowner contact more contractors or negotiate a quoted price', () => {
    const source = readFileSync('frontend/app.js', 'utf8');

    expect(source).toContain('data-action="contact-more-contractors"');
    expect(source).toContain('data-action="negotiate-quote"');
    expect(source).toContain('negotiateQuote(');
  });

  it('turns fallback multi-contractor negotiation into an approval prompt instead of booking', async () => {
    const serviceUrl = new URL('../../frontend/services/realApi.js', import.meta.url).href;
    const { negotiateAndBook } = await import(serviceUrl);
    const contractors = [
      { id: 'contractor-1', name: 'Alpha Repair', originalPrice: 420, negotiatedPrice: 390, availability: 'Today, 5:00 PM', rating: 4.9, distance: 1.1, yearsExperience: 12 },
      { id: 'contractor-2', name: 'Beta Repair', originalPrice: 430, negotiatedPrice: 400, availability: 'Today, 6:00 PM', rating: 4.8, distance: 2.0, yearsExperience: 10 },
    ];
    const states = [];

    for await (const state of negotiateAndBook(contractors, { replyDelayMs: 0 })) {
      states.push(state);
    }

    expect(states.map(state => state.step)).toContain('countering');
    expect(states.map(state => state.step)).toContain('approval');
    expect(states.map(state => state.step)).not.toContain('booked');
    expect(states.at(-1)).toEqual(expect.objectContaining({
      step: 'approval',
      message: expect.stringContaining('Should we book?'),
      booking: expect.objectContaining({ contractor: expect.objectContaining({ name: expect.any(String) }) }),
    }));
  });

  it('sends a counteroffer follow-up through notify-contractors', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { createRepairApi } = await import(serviceUrl);
    const insertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'counter-request-1' }], error: null });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const from = vi.fn().mockImplementation(() => ({ insert }));
    const invoke = vi.fn().mockImplementation((slug) => {
      if (slug === 'search-contractors') {
        return Promise.resolve({
          data: { status: 'success', results: [], contractorIds: [] },
          error: null,
        });
      }
      if (slug === 'notify-contractors') {
        return Promise.resolve({ data: { status: 'success', notifiedCount: 1 }, error: null });
      }
      return Promise.resolve({ data: {}, error: null });
    });

    const api = createRepairApi({
      config: {
        baseUrl: 'https://pzv974n7.us-east.insforge.app',
        anonKey: 'anon',
        useMock: false,
        locationText: 'San Francisco, CA',
      },
      cryptoImpl: { randomUUID: () => 'counter-request-1' },
      fallbackApi: {
        analyzeVoice: vi.fn().mockResolvedValue({
          isIdentified: true,
          category: 'painting',
          diagnosis: 'Interior painting request.',
          messageToUser: 'I can help find painters.',
          contractorSearchQuery: 'painting repair',
        }),
      },
      insforge: {
        auth: {
          getCurrentUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        },
        database: { from },
        functions: { invoke },
      },
    });

    await api.analyzeVoice('Find me painters', 'high');
    const [selected] = await api.searchContractors('painting repair', 'San Francisco, CA');
    await expect(api.negotiateQuote(selected, { id: 'quote-1', price: 300 }, { targetPrice: 250 }))
      .resolves.toEqual(expect.objectContaining({ status: 'success' }));

    expect(invoke).toHaveBeenCalledWith('notify-contractors', {
      body: expect.objectContaining({
        requestId: 'counter-request-1',
        contractorIds: ['test-contractor'],
        quoteId: 'quote-1',
        followUpMessage: expect.stringContaining('$250'),
        selectedContractor: expect.objectContaining({ id: 'test-contractor' }),
      }),
    });
  });

  it('direct-uploads storage files and stores normalized metadata before analysis', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { createRepairApi } = await import(serviceUrl);
    const sdkUpload = vi.fn().mockResolvedValue({ data: { key: 'should-not-use-sdk' }, error: null });
    const directUpload = vi.fn().mockResolvedValue({
      bucket: 'repair-photos',
      key: 'users/user-1/requests/request-1/photo.jpg',
      size: 3,
      mimeType: 'image/jpeg',
      uploadedAt: '2026-06-06T19:41:13.000Z',
      url: '/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-1%2Fphoto.jpg',
    });
    const insertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'request-1' }], error: null });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const invoke = vi.fn().mockResolvedValue({
      data: {
        isIdentified: true,
        category: 'hvac',
        brand: 'Carrier',
        modelNumber: 'Infinity 26',
        messageToUser: 'Identified.',
        contractorSearchQuery: 'Carrier HVAC repair',
      },
      error: null,
    });

    const api = createRepairApi({
      config: {
        baseUrl: 'https://pzv974n7.us-east.insforge.app',
        anonKey: 'anon',
        useMock: false,
        locationText: 'San Francisco, CA',
      },
      cryptoImpl: { randomUUID: () => 'request-1' },
      insforge: {
        auth: {
          getCurrentUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        },
        storage: {
          from: vi.fn().mockReturnValue({ upload: sdkUpload }),
        },
        getHttpClient: vi.fn().mockReturnValue({ request: directUpload }),
        database: {
          from: vi.fn().mockReturnValue({ insert }),
        },
        functions: { invoke },
      },
    });

    const result = await api.analyzeImage('blob:preview', 'medium', new File(['abc'], 'photo.jpg', { type: 'image/jpeg' }));

    expect(sdkUpload).not.toHaveBeenCalled();
    expect(directUpload).toHaveBeenCalledWith(
      'PUT',
      '/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-1%2Fphoto.jpg',
      expect.objectContaining({ body: expect.any(FormData), headers: {} }),
    );
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      image_key: 'users/user-1/requests/request-1/photo.jpg',
      image_url: 'https://pzv974n7.us-east.insforge.app/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-1%2Fphoto.jpg',
    })]);
    expect(invoke).toHaveBeenCalledWith('analyze', { body: { requestId: 'request-1' } });
    expect(result.imageKey).toBe('users/user-1/requests/request-1/photo.jpg');
  });

  it('creates an InsForge repair request for text issues before contractor search', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { createRepairApi } = await import(serviceUrl);
    const insertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'text-request-1' }], error: null });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const from = vi.fn().mockImplementation(() => ({ insert }));
    const invoke = vi.fn().mockResolvedValue({
      data: {
        status: 'success',
        results: [{ id: 'contractor-1', name: 'Bay Area Paint Pros', category: 'painting' }],
        contractorIds: ['contractor-1'],
      },
      error: null,
    });

    const api = createRepairApi({
      config: {
        baseUrl: 'https://pzv974n7.us-east.insforge.app',
        anonKey: 'anon',
        useMock: false,
        locationText: 'San Francisco, CA',
      },
      cryptoImpl: { randomUUID: () => 'text-request-1' },
      fallbackApi: {
        analyzeVoice: vi.fn().mockResolvedValue({
          isIdentified: true,
          category: 'painting',
          brand: null,
          modelNumber: null,
          diagnosis: 'Interior painting request.',
          messageToUser: 'I can help find painters.',
          contractorSearchQuery: 'painting repair',
        }),
      },
      insforge: {
        auth: {
          getCurrentUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        },
        database: { from },
        functions: { invoke },
      },
    });

    await expect(api.analyzeVoice('Find me painters', 'high')).resolves.toEqual(expect.objectContaining({
      requestId: 'text-request-1',
      category: 'painting',
    }));
    await expect(api.searchContractors('painting repair', 'San Francisco, CA')).resolves.toEqual([
      expect.objectContaining({ id: 'test-contractor' }),
      expect.objectContaining({ id: 'contractor-1', name: 'Bay Area Paint Pros' }),
    ]);

    expect(from).toHaveBeenCalledWith('repair_requests');
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      id: 'text-request-1',
      user_id: 'user-1',
      status: 'identified',
      category: 'painting',
      image_url: 'text://repair-requests/text-request-1',
      image_key: 'text-requests/text-request-1',
      diagnosis: 'Interior painting request.',
    })]);
    expect(invoke).toHaveBeenCalledWith('search-contractors', {
      body: { requestId: 'text-request-1' },
    });
  });

  it('notifies only the selected contractor and includes test contractor details for Telegram demo routing', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { createRepairApi } = await import(serviceUrl);
    const insertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'selected-request-1' }], error: null });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    const from = vi.fn().mockImplementation(() => ({ insert }));
    const invoke = vi.fn().mockImplementation((slug) => {
      if (slug === 'search-contractors') {
        return Promise.resolve({
          data: {
            status: 'success',
            results: [
              { id: 'contractor-1', name: 'Bay Area Paint Pros', category: 'painting' },
              { id: 'contractor-2', name: 'City Paint Crew', category: 'painting' },
            ],
            contractorIds: ['contractor-1', 'contractor-2'],
          },
          error: null,
        });
      }

      if (slug === 'notify-contractors') {
        return Promise.resolve({ data: { status: 'success', notifiedCount: 1 }, error: null });
      }

      if (slug === 'status') {
        return Promise.resolve({
          data: {
            status: 'success',
            session: {
              requestId: 'selected-request-1',
              status: 'pending_approval',
              bestQuote: {
                id: 'quote-1',
                contractor_id: 'test-contractor',
                contractor_name: 'Testing Contractor',
                raw_message: 'Available today at 4 for $120.',
                available: true,
                price: 120,
                availability: 'today at 4',
                approval_status: 'pending',
              },
              pendingApprovals: [{
                id: 'quote-1',
                contractor_id: 'test-contractor',
                contractor_name: 'Testing Contractor',
                raw_message: 'Available today at 4 for $120.',
                available: true,
                price: 120,
                availability: 'today at 4',
                approval_status: 'pending',
              }],
              quotes: [{
                id: 'quote-1',
                contractor_id: 'test-contractor',
                contractor_name: 'Testing Contractor',
                raw_message: 'Available today at 4 for $120.',
                available: true,
                price: 120,
                availability: 'today at 4',
                approval_status: 'pending',
              }],
              notifications: [],
              messages: [],
              jobs: [],
            },
          },
          error: null,
        });
      }

      return Promise.resolve({ data: {}, error: null });
    });

    const api = createRepairApi({
      config: {
        baseUrl: 'https://pzv974n7.us-east.insforge.app',
        anonKey: 'anon',
        useMock: false,
        locationText: 'San Francisco, CA',
      },
      cryptoImpl: { randomUUID: () => 'selected-request-1' },
      fallbackApi: {
        analyzeVoice: vi.fn().mockResolvedValue({
          isIdentified: true,
          category: 'painting',
          brand: null,
          modelNumber: null,
          diagnosis: 'Interior painting request.',
          messageToUser: 'I can help find painters.',
          contractorSearchQuery: 'painting repair',
        }),
      },
      insforge: {
        auth: {
          getCurrentUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        },
        database: { from },
        functions: { invoke },
      },
    });

    await api.analyzeVoice('Find me painters', 'high');
    const contractors = await api.searchContractors('painting repair', 'San Francisco, CA');
    const selected = contractors.find((contractor: { id?: string }) => contractor.id === 'test-contractor');
    expect(selected).toBeTruthy();

    const states = [];
    for await (const state of api.negotiateAndBook([selected], {
      urgency: 'high',
      replyPollAttempts: 1,
      replyPollIntervalMs: 0,
    })) {
      states.push(state);
    }

    expect(invoke).toHaveBeenCalledWith('notify-contractors', {
      body: {
        requestId: 'selected-request-1',
        contractorIds: ['test-contractor'],
        selectedContractor: expect.objectContaining({
          id: 'test-contractor',
          name: 'Testing Contractor',
        }),
      },
    });
    expect(invoke).not.toHaveBeenCalledWith('notify-contractors', {
      body: expect.objectContaining({
        contractorIds: ['contractor-1', 'contractor-2'],
      }),
    });
    expect(states[0]).toEqual(expect.objectContaining({
      step: 'contacting',
      count: 1,
    }));
    expect(states).toContainEqual(expect.objectContaining({
      step: 'approval',
      quote: expect.objectContaining({ id: 'quote-1' }),
      booking: expect.objectContaining({ negotiatedPrice: 120 }),
    }));
  });

  it('optimizes camera PNGs and direct-uploads without hitting the presigned S3 path', async () => {
    const serviceUrl = new URL('../../frontend/services/insforgeApi.js', import.meta.url).href;
    const { createRepairApi } = await import(serviceUrl);
    const originalFile = new File(['original png bytes'], 'photo.png', { type: 'image/png' });
    const optimizedFile = new File(['compressed jpg'], 'photo.jpg', { type: 'image/jpeg' });
    const preparePhotoForUpload = vi.fn().mockResolvedValue(optimizedFile);
    const sdkUpload = vi.fn().mockResolvedValue({ data: { key: 'should-not-use-sdk' }, error: null });
    const directUpload = vi.fn().mockResolvedValue({
      bucket: 'repair-photos',
      key: 'users/user-1/requests/request-2/photo.jpg',
      size: optimizedFile.size,
      mimeType: optimizedFile.type,
      uploadedAt: '2026-06-06T20:10:00.000Z',
      url: '/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-2%2Fphoto.jpg',
    });
    const insertSelect = vi.fn().mockResolvedValue({ data: [{ id: 'request-2' }], error: null });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });

    const api = createRepairApi({
      config: {
        baseUrl: 'https://pzv974n7.us-east.insforge.app',
        anonKey: 'anon',
        useMock: false,
        locationText: 'San Francisco, CA',
      },
      cryptoImpl: { randomUUID: () => 'request-2' },
      preparePhotoForUpload,
      insforge: {
        auth: {
          getCurrentUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        },
        storage: {
          from: vi.fn().mockReturnValue({ upload: sdkUpload }),
        },
        getHttpClient: vi.fn().mockReturnValue({ request: directUpload }),
        database: {
          from: vi.fn().mockReturnValue({ insert }),
        },
        functions: {
          invoke: vi.fn().mockResolvedValue({
            data: {
              isIdentified: true,
              category: 'hvac',
              brand: 'Carrier',
              modelNumber: 'Infinity 26',
              messageToUser: 'Identified.',
              contractorSearchQuery: 'Carrier HVAC repair',
            },
            error: null,
          }),
        },
      },
    });

    const result = await api.analyzeImage('blob:preview', 'medium', originalFile);

    expect(preparePhotoForUpload).toHaveBeenCalledWith(originalFile);
    expect(sdkUpload).not.toHaveBeenCalled();
    expect(directUpload).toHaveBeenCalledWith(
      'PUT',
      '/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-2%2Fphoto.jpg',
      expect.objectContaining({ body: expect.any(FormData), headers: {} }),
    );
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      image_key: 'users/user-1/requests/request-2/photo.jpg',
      image_url: 'https://pzv974n7.us-east.insforge.app/api/storage/buckets/repair-photos/objects/users%2Fuser-1%2Frequests%2Frequest-2%2Fphoto.jpg',
    })]);
    expect(result.imageKey).toBe('users/user-1/requests/request-2/photo.jpg');
  });
});
