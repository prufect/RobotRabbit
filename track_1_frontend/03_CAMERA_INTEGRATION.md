# Camera Integration

> [!TIP]
> **Executive Summary:** Do not build a complex WebRTC custom camera UI. It will take hours and crash on iOS Safari. Use the native HTML file input with the `capture` attribute.

## The Boilerplate Code
This is the fastest, most reliable way to get a photo from a mobile device browser.

```tsx
import { useState, useRef } from 'react';
import { Camera } from 'lucide-react';

export const CameraCapture = ({ onCapture }: { onCapture: (file: File) => void }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onCapture(e.target.files[0]);
    }
  };

  return (
    <div className="w-full flex justify-center py-4 bg-gray-900 border-t border-gray-800">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      
      <button 
        onClick={handleClick}
        className="flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full shadow-lg hover:bg-blue-500 transition-transform active:scale-95"
      >
        <Camera className="text-white w-8 h-8" />
      </button>
    </div>
  );
};
```

## Handling the File
When `onCapture` is triggered, you must:
1. Show the image optimistically in the chat UI.
2. Upload the file to InsForge Storage (Track 4 provides this).
3. Send the resulting URL to `/api/analyze`.
