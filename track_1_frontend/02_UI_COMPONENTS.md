# Core UI Components

> [!IMPORTANT]
> **Executive Summary:** You need three main components: The Chat Window, The Camera Button, and the Urgency Toggle. Below is the exact boilerplate for the Chat Window to save you 30 minutes.

## 1. ChatBubble Component
This component renders individual messages.

```tsx
import clsx from 'clsx';
import { motion } from 'framer-motion';

type Message = {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  imageUrl?: string;
};

export const ChatBubble = ({ message }: { message: Message }) => {
  const isUser = message.sender === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "flex w-full mb-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div className={clsx(
        "max-w-[80%] rounded-2xl px-4 py-3 shadow-sm",
        isUser ? "bg-blue-600 text-white rounded-br-none" : "bg-gray-800 text-gray-100 rounded-bl-none"
      )}>
        {message.imageUrl && (
          <img src={message.imageUrl} alt="Upload" className="rounded-xl mb-2 w-full object-cover max-h-48" />
        )}
        <p className="text-sm leading-relaxed">{message.text}</p>
      </div>
    </motion.div>
  );
};
```

## 2. Urgency Toggle
A simple pill-shaped toggle for "Low", "Medium", and "Emergency". Pass this state up to the parent component so it can be sent in the `/api/analyze` request.
