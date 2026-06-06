# Setup InsForge Edge Functions

> [!TIP]
> **Executive Summary:** Boilerplate for setting up your Edge Function.

## 1. Install CLI
```bash
npm install -g insforge-cli
insforge login
insforge functions new analyze
```

## 2. Dependencies
Inside the `insforge/functions/analyze` directory:
```bash
npm install openai
```

## 3. Configuration
Ensure your `insforge/config.toml` sets a long timeout:
```toml
[functions.analyze]
verify_jwt = false
timeout = 60
```
