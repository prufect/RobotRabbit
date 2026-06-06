-- Track 4 migration: Message Center
-- Run in the InsForge SQL editor (after 02_SCHEMA_DESIGN.md base tables).
-- Captures the full conversation between the agent and service providers.
-- Producer: Track 3 integrations service (src/store.js) via DATABASE_URL.

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id TEXT,
    contractor_phone TEXT NOT NULL,
    contractor_name TEXT,
    direction TEXT NOT NULL,        -- 'outbound' | 'inbound'
    channel TEXT NOT NULL,          -- 'whatsapp' | 'sms' | 'telegram' | 'mock'
    kind TEXT,                      -- 'outreach' | 'reply' | 'booking' | 'decline'
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages (contractor_phone);
CREATE INDEX IF NOT EXISTS idx_messages_request ON messages (request_id);

-- Convenience view: latest message per contractor (for a conversation list).
CREATE OR REPLACE VIEW conversation_summary AS
SELECT DISTINCT ON (contractor_phone)
    contractor_phone,
    contractor_name,
    request_id,
    body        AS last_message,
    created_at  AS last_message_at
FROM messages
ORDER BY contractor_phone, created_at DESC;
