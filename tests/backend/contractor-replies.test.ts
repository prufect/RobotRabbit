import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordContractorReply } from '../../functions/_shared/contractor-replies.ts';

class FakeQuery {
  constructor(private db: any, private table: string) {}

  private filters: Array<[string, unknown]> = [];
  private operation: 'select' | 'insert' | 'update' = 'select';
  private payload: unknown = null;
  private limitValue: number | null = null;

  select() {
    if (this.operation !== 'select') return this.execute();
    return this;
  }

  insert(rows: unknown[]) {
    this.operation = 'insert';
    this.payload = rows;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operation = 'update';
    this.payload = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  maybeSingle() {
    return this.executeSingle(false);
  }

  single() {
    return this.executeSingle(true);
  }

  then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  private executeSingle(required: boolean) {
    const result = this.execute();
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return Promise.resolve(row || required
      ? { data: row ?? null, error: row ? null : { message: 'not found' } }
      : { data: null, error: null });
  }

  private execute() {
    return this.db.handle({
      table: this.table,
      operation: this.operation,
      payload: this.payload,
      filters: this.filters,
      limit: this.limitValue,
    });
  }
}

function createFakeClient() {
  const state = {
    request: {
      id: 'request-1',
      user_id: 'user-1',
      status: 'negotiating',
      category: 'plumbing',
      location_text: 'San Francisco, CA',
      best_quote_id: null,
    },
    contractor: {
      id: 'contractor-1',
      name: 'Testing Contractor',
      phone: null,
      website: null,
      category: 'plumbing',
      location_text: 'San Francisco, CA',
      source: 'telegram',
      source_ref: null,
      metadata: {},
    },
    quote: {
      id: 'quote-1',
      request_id: 'request-1',
      user_id: 'user-1',
      contractor_id: 'contractor-1',
      contractor_name: 'Testing Contractor',
      contractor_phone: null,
      available: true,
      price: 349,
      availability: 'Tomorrow',
      raw_message: 'Tomorrow 349',
      approval_status: 'pending',
      created_at: '2026-06-07T00:21:23.399Z',
      updated_at: '2026-06-07T00:21:23.399Z',
    },
    conversations: [{ id: 'conversation-1', user_id: 'user-1', contractor_id: 'contractor-1', unread_count: 0 }],
    repairRequestUpdates: [] as Record<string, unknown>[],
    conversationUpdates: [] as Record<string, unknown>[],
    conversationMessages: [] as Record<string, unknown>[],
    requestMessages: [] as Record<string, unknown>[],
  };

  const db = {
    state,
    from(table: string) {
      return new FakeQuery(this, table);
    },
    handle(query: any) {
      const matches = (row: Record<string, unknown>) =>
        query.filters.every(([column, value]: [string, unknown]) => row[column] === value);

      if (query.operation === 'select') {
        if (query.table === 'repair_requests') return { data: state.request, error: null };
        if (query.table === 'contractors') return { data: matches(state.contractor) ? state.contractor : null, error: null };
        if (query.table === 'contractor_quotes') return { data: [state.quote].filter(matches), error: null };
        if (query.table === 'conversations') return { data: state.conversations.filter(matches).slice(0, query.limit ?? undefined), error: null };
      }

      if (query.operation === 'update') {
        if (query.table === 'contractor_quotes') {
          state.quote = { ...state.quote, ...query.payload, updated_at: '2026-06-07T00:22:00.000Z' };
          return { data: [state.quote], error: null };
        }
        if (query.table === 'repair_requests') {
          state.repairRequestUpdates.push(query.payload);
          state.request = { ...state.request, ...query.payload };
          return { data: [state.request], error: null };
        }
        if (query.table === 'conversations') {
          state.conversationUpdates.push(query.payload);
          return { data: [], error: null };
        }
      }

      if (query.operation === 'insert') {
        if (query.table === 'request_messages') state.requestMessages.push(...query.payload);
        if (query.table === 'conversation_messages') state.conversationMessages.push(...query.payload);
        return { data: query.payload, error: null };
      }

      return { data: [], error: null };
    },
  };

  return { client: { database: db }, state };
}

describe('contractor reply intake', () => {
  const originalDeno = globalThis.Deno;

  beforeEach(() => {
    vi.stubGlobal('Deno', { env: { get: vi.fn(() => undefined) } });
  });

  afterEach(() => {
    vi.stubGlobal('Deno', originalDeno);
  });

  it('uses the counteroffer target when a contractor accepts without repeating the price', async () => {
    const { client, state } = createFakeClient();

    const result = await recordContractorReply(client as any, {
      requestId: 'request-1',
      contractorId: 'contractor-1',
      contractorName: 'Testing Contractor',
      contractorPhone: null,
      messageBody: 'Yes I can',
      source: 'telegram',
      notificationId: 'notification-1',
      providerMessageId: '73',
      approvalStatus: 'pending',
      targetPrice: 314,
    });

    expect(result.quote).toEqual(expect.objectContaining({
      id: 'quote-1',
      price: 314,
      availability: 'Tomorrow',
      raw_message: 'Yes I can',
    }));
    expect(result.readyForUser).toBe(true);
    expect(result.bestQuote).toEqual(expect.objectContaining({ id: 'quote-1', price: 314 }));
    expect(state.repairRequestUpdates.at(-1)).toEqual(expect.objectContaining({
      status: 'pending_approval',
      best_quote_id: 'quote-1',
    }));
    expect(state.conversationUpdates.at(-1)).toEqual(expect.objectContaining({
      negotiation_status: 'pending_approval',
    }));
    expect(state.conversationMessages.at(-1)).toEqual(expect.objectContaining({
      direction: 'inbound',
      body: 'Yes I can',
      metadata: expect.objectContaining({ price: 314, availability: 'Tomorrow' }),
    }));
  });
});
