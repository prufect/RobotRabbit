# Twilio WhatsApp Integration

> [!IMPORTANT]
> **Executive Summary:** Use the Twilio WhatsApp Sandbox for the hackathon. Sending templates to non-whitelisted numbers requires approval outside the sandbox, so you must have your stage volunteers join the sandbox!

## Stage Setup
Before the demo, have your "contractors" (team members) text `join <sandbox-keyword>` to the Twilio number.

## Boilerplate Send Code
```javascript
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function notifyContractor(contractorPhone, imageUrl, issueDetails) {
  const message = `🚨 *New Job Request* 🚨

` +
                  `*Issue:* ${issueDetails.brand} ${issueDetails.model}
` +
                  `*Urgency:* ${issueDetails.urgency}
` +
                  `*Photo:* ${imageUrl}

` +
                  `Reply 'YES' if you are available today, along with your call-out fee.`;

  try {
    const response = await client.messages.create({
      body: message,
      from: 'whatsapp:+14155238886', // Twilio Sandbox number
      to: `whatsapp:${contractorPhone}`
    });
    console.log(`Message sent to ${contractorPhone}: ${response.sid}`);
    return true;
  } catch (err) {
    console.error(`Twilio Error:`, err);
    return false;
  }
}
```
