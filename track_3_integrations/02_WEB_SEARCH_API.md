# SerpApi Web Search Implementation

> [!TIP]
> **Executive Summary:** Use Google Local results to find actual contractors near the user.

## Boilerplate Code
```javascript
import axios from 'axios';

export async function searchContractors(query, location) {
  const apiKey = process.env.SERPAPI_KEY;
  const url = `https://serpapi.com/search.json?engine=google_local&q=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&api_key=${apiKey}`;

  try {
    const response = await axios.get(url);
    const results = response.data.local_results || [];
    
    // Grab the top 3 results
    return results.slice(0, 3).map(res => ({
      name: res.title,
      phone: res.phone,
      rating: res.rating
    }));
  } catch (error) {
    console.error("Search failed:", error);
    return [];
  }
}
```
