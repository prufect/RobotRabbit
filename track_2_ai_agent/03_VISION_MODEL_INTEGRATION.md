# OpenAI Vision Integration

> [!TIP]
> **Executive Summary:** Copy and paste this to call GPT-4o with an image URL.

## Edge Function Boilerplate
```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function processImage(imageUrl) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT // defined in 02_PROMPT_ENGINEERING.md
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this maintenance issue." },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content);
}
```
