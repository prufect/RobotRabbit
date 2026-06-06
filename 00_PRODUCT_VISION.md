# Product Vision: AI Maintenance Agent

## Overview
We are building an AI agent for home maintenance. A user takes a picture of a broken item (HVAC, electrical panel). The agent identifies the model and issue. If a sticker is missing, it asks the user for it. Once identified, it searches for local professionals (plumbers, electricians) and messages them via WhatsApp/Telegram with the photo, asking for availability and pricing based on the user's urgency.

## Hackathon Goal
Deliver a working end-to-end prototype in 5 hours. Emphasize the use of sponsor tools: Vercel, InsForge, Limrun, and Replicas.

## Target Audience
Homeowners needing immediate repair quotes without calling around.

## Critical User Journeys (CUJs) - Stage Demo Flow
These CUJs define exactly what we will build and show live on stage. Do not build features outside of these paths.

### CUJ 1: The "Perfect Photo" Happy Path (HVAC Issue)
**Goal:** Show the end-to-end magic when the AI gets everything it needs from one photo.
1. **User Action:** On stage, the presenter opens the Vercel-hosted web app on their phone.
2. **User Action:** Selects "High Urgency" and snaps a clear photo of an AC unit *where the model sticker is visibly clear*.
3. **System Action:** The UI shows a loading state. The InsForge Edge Function + Vision AI parses the image.
4. **System Action:** The Agent replies in the chat UI: *"I see you have a Carrier Infinity 26 Air Conditioner. I'm looking up HVAC technicians in San Francisco right now."*
5. **System Action:** The Integrations backend searches for 3 local HVAC companies.
6. **System Action:** Twilio/Telegram sends automated messages to 3 mock contractor phones (held by team members on stage).
7. **Demo Climax:** The team members hold up their phones showing the incoming WhatsApp message: *"Hi, a homeowner needs immediate service for a Carrier Infinity 26. See photo: [link]. Are you available today and what is your call-out fee?"*

### CUJ 2: The "Missing Context" Conversational Path (Electrical Panel)
**Goal:** Prove the agent has reasoning capabilities and isn't just a simple one-shot image classifier. Show the conversational fallback.
1. **User Action:** Presenter snaps a photo of a generic grey electrical panel from the outside (no labels visible).
2. **System Action:** The Agent replies in the chat UI: *"It looks like an electrical panel, but I can't see the manufacturer or specs. Can you open the door and take a picture of the label inside?"*
3. **User Action:** Presenter takes/uploads a second photo showing the detailed specification label (e.g., Square D 200 Amp).
4. **System Action:** The Agent replies: *"Got it! Square D 200 Amp panel. Contacting local electricians now."*
5. **System Action:** Messages are fired off to the mock electricians as before.

### CUJ 3: The Contractor Response & Close (Optional/Bonus)
**Goal:** Show the closed loop if time permits in the 5 hours.
1. **User Action (Contractor):** A team member (playing the contractor) replies *"Yes, available in 1 hour. $150 call-out fee."* directly to the WhatsApp message.
2. **System Action:** The Twilio webhook hits the InsForge backend.
3. **System Action:** The web app UI automatically updates for the homeowner showing the quote and a "Book Now" button.
