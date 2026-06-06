# Track 1 Responsibility: Frontend Wizard

> [!IMPORTANT]
> **Executive Summary:** Your sole responsibility is to build a stunning, mobile-first frontend using Next.js and Vercel. You will not write database queries. You will not write AI prompts. You consume APIs.

## Your Domain
You own everything the user sees and touches. Because this is a mobile-focused maintenance app, the core UX relies heavily on **Camera access** and a **Chat Interface**. The user experience must feel like a premium, native app, even if it's running in the browser.

## The Goal for the 5 Hours
1. Setup Next.js with TailwindCSS.
2. Deploy to Vercel immediately so the team has a live URL.
3. Build the Camera Capture component.
4. Build the Chat UI (similar to iMessage or ChatGPT).
5. Hook up the UI to the API contracts defined in `/02_API_CONTRACTS.md`.

## Aesthetic Requirements
- Use smooth animations (e.g., Framer Motion).
- Implement a Dark Mode by default.
- Use glassmorphism for chat bubbles.
- Do not use generic red/green colors; use curated palettes.

## Dependencies
You depend on Track 4 (Data Ops) for the image upload URL generator. You depend on Track 2 (AI Agent) for the `/api/analyze` endpoint. If they are slow, **MOCK THE API** using `setTimeout` to simulate latency so you are never blocked.
