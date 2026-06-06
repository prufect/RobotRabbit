# Next.js & Vercel Setup Guide

> [!TIP]
> **Executive Summary:** Run these exact commands to scaffold the project and deploy it to Vercel within the first 15 minutes of the hackathon.

## Step 1: Scaffold Next.js
Run the following in your terminal:
```bash
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd frontend
npm install framer-motion lucide-react axios clsx tailwind-merge
```

## Step 2: Push to GitHub
If you haven't already, push this code to the `main` branch of the shared repository.

## Step 3: Vercel Deployment
1. Go to [vercel.com](https://vercel.com).
2. Click **Add New Project**.
3. Import the shared GitHub repository.
4. Ensure the Framework Preset is set to "Next.js".
5. Click **Deploy**.

*Crucial:* Vercel will now auto-deploy on every push. Share the live URL with the rest of the team immediately so they can test the mobile view on their phones.

## Step 4: Setup UI Libraries (shadcn/ui optional but recommended)
If you want to move extremely fast, initialize shadcn/ui:
```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button input card
```
