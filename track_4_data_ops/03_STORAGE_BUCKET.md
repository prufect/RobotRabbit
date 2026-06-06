# Storage Bucket Configuration

> [!TIP]
> **Executive Summary:** Configure the bucket to be public-read so the Vision AI can download the images without signed-URL complexity.

1. Go to InsForge Storage.
2. Create a bucket named `maintenance-photos`.
3. Set the bucket policy to **Public Read**.
4. The frontend (Track 1) will use the `insforge-js` client to upload directly from the browser using Anon keys.
