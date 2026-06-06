# Track 3 Responsibility: The Integrator

> [!IMPORTANT]
> **Executive Summary:** You connect the AI brain to the real world. You own the web search (finding contractors) and the messaging (contacting contractors). You write Node.js scripts that get triggered by Track 2.

## Core Responsibilities
1. Implement `/api/search-contractors` using SerpApi or Google Custom Search.
2. Implement `/api/notify-contractors` using Twilio (WhatsApp) and/or Telegram API.
3. Define the exact message templates sent to the contractors.

## Dependencies
You depend on Track 2 to trigger your search function when they successfully identify a model. You depend on Track 1 to pass the correct urgency level.
