# SQL Schema Design

> [!IMPORTANT]
> **Executive Summary:** Run this exact SQL in the InsForge SQL editor. Do not waste time debating schemas.

## The Boilerplate SQL
```sql
-- Create Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Maintenance Requests Table
CREATE TABLE maintenance_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    image_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, identified, needs_info, contractor_found
    urgency TEXT DEFAULT 'medium',
    category TEXT,
    brand TEXT,
    model TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Contractor Responses Table
CREATE TABLE contractor_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID REFERENCES maintenance_requests(id),
    contractor_phone TEXT NOT NULL,
    is_available BOOLEAN,
    quote_amount NUMERIC,
    eta_minutes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message Center: every message between the agent and a service provider,
-- both directions, across any channel. Powers the conversation UI.
-- Written by Track 3 (src/store.js). request_id is TEXT (not a strict FK) so
-- it tolerates whatever conversation id the agent threads through.
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id TEXT,
    contractor_phone TEXT NOT NULL,
    contractor_name TEXT,
    direction TEXT NOT NULL,        -- 'outbound' (agent -> provider) | 'inbound' (provider -> agent)
    channel TEXT NOT NULL,          -- 'whatsapp' | 'sms' | 'telegram' | 'mock'
    kind TEXT,                      -- 'outreach' | 'reply' | 'booking' | 'decline'
    body TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_messages_phone ON messages (contractor_phone);
CREATE INDEX idx_messages_request ON messages (request_id);
```
