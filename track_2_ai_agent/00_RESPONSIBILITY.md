# Track 2 Responsibility: The Agent Architect

> [!IMPORTANT]
> **Executive Summary:** You own the "brain" of the app. Your job is to write the AI prompts and deploy the InsForge Edge Function that processes the image and returns a strict JSON decision tree to the frontend.

## Core Responsibilities
1. Write the System Prompt for GPT-4o or Claude 3.5 Sonnet.
2. Deploy an InsForge Edge Function named `/api/analyze`.
3. Handle the two possible outcomes (Identified vs. Needs More Info).

## Dependencies
You depend on Track 1 to send you the `imageUrl`. You depend on Track 4 to ensure the InsForge environment variables (OpenAI API Keys) are set up.

## Key Risk Factors
- **Latency:** Vision models are slow. You MUST configure the edge function timeout to at least 30-60 seconds.
- **Hallucination:** The model might confidently guess a brand. You must instruct it to return `isIdentified: false` if it is not 95%+ sure.
