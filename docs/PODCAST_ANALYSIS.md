# Podcast Transcription & Analysis

## Overview

**STATUS: Built but DISABLED by default (opt-in)**

The podcast analysis service transcribes podcast episodes using OpenAI's Whisper API and extracts key insights using GPT-4.

## Why It's Opt-In

1. **Cost**: ~$0.30-0.60 per podcast episode
2. **Time**: Adds 2-5 minutes per podcast to pipeline
3. **Platform limitations**: Only YouTube podcasts fully supported currently

## What It Does

### Step 1: Find Podcasts
- From Tavily social search
- From Perplexity citations
- From LinkedIn mentions

### Step 2: Download Audio
- YouTube: Uses `yt-dlp` (supports 1000+ platforms)
- Spotify: Requires Spotify API (not implemented)
- Apple Podcasts: Requires Apple API (not implemented)

### Step 3: Transcribe with Whisper
- OpenAI's Whisper API
- Highly accurate transcription
- Handles accents and multiple speakers
- Returns timestamped segments
- Cost: $0.006/minute

### Step 4: AI Analysis
Extracts:
- **Topics discussed** (with time estimates)
- **Investment thesis** mentioned
- **Companies/deals** discussed
- **Expertise areas** demonstrated
- **Notable quotes** (direct quotes)
- **Questions asked** (reveals what they're known for)
- **Personal stories** or anecdotes
- **Predictions/trends** mentioned

Cost: ~$0.10 per analysis

## Example Output

```json
{
  "url": "https://youtube.com/watch?v=xyz",
  "duration": 2700, // 45 minutes
  "platform": "youtube",
  "transcription": "Welcome to the show...",
  "analysis": {
    "topics": [
      "Developer tools and infrastructure (15 min)",
      "Open source business models (8 min)",
      "Series A investment criteria (6 min)"
    ],
    "thesis": "I invest in developer tools that improve productivity by 10x",
    "deals": [
      "Led Series A in CompanyX ($12M)",
      "Participated in CompanyY seed round"
    ],
    "expertise": [
      "Developer Tools (high confidence)",
      "Infrastructure (high confidence)",
      "Open Source (medium confidence)"
    ],
    "quotes": [
      "The best developer tools are built BY developers FOR developers",
      "We look for 10x improvements, not 10% improvements"
    ],
    "questions": [
      "What do you look for in a founding team?",
      "How has your investment thesis evolved?"
    ],
    "predictions": [
      "AI will transform developer productivity in the next 2 years",
      "Infrastructure will consolidate around a few key platforms"
    ]
  },
  "costs": {
    "transcription": "$0.27",
    "analysis": "$0.10",
    "total": "$0.37"
  }
}
```

## How to Enable

### Prerequisites

1. **yt-dlp installed** (for YouTube podcasts):
```bash
pip install yt-dlp
```

2. **Railway Environment Variables**:
```bash
PODCAST_ANALYSIS_ENABLED=true
MAX_PODCASTS_PER_PARTNER=3      # Limit podcasts per person
MAX_PODCAST_DURATION_MINUTES=90 # Skip podcasts longer than 90 min
```

### Enable in Orchestrator

The service is built but NOT integrated into `orchestrator.js` yet.

To enable, you would add to Stage 1:

```javascript
// In orchestrator.js parallelTasks (COMMENTED OUT BY DEFAULT)

// Podcast analysis (opt-in)
if (config.podcast.enabled) {
  const podcastUrls = podcastService.extractPodcastUrls(results);
  
  if (podcastUrls.length > 0) {
    console.log('Found podcast URLs:', podcastUrls.length);
    
    parallelTasks.push(
      podcastService.processPodcasts(podcastUrls, { name, firm, role }, {
        maxPodcasts: config.podcast.maxPodcastsPerPartner,
      })
        .then(async (podcastResults) => {
          results.podcasts = podcastResults;
          
          for (const podcast of podcastResults) {
            if (podcast.success) {
              await saveResearchRecord(
                partnerId, 
                'PODCAST_ANALYSIS', 
                'podcast', 
                podcast, 
                podcast.url
              );
            }
          }
          
          console.log('Podcast analysis complete');
          return podcastResults;
        })
        .catch((error) => {
          console.error('Podcast analysis error:', error.message);
          results.errors.push({ source: 'podcast', error: error.message });
        })
    );
  }
}
```

## Cost Estimates

| Podcast Length | Transcription | Analysis | Total |
|----------------|---------------|----------|-------|
| 30 minutes | $0.18 | $0.10 | **$0.28** |
| 45 minutes | $0.27 | $0.10 | **$0.37** |
| 60 minutes | $0.36 | $0.15 | **$0.51** |
| 90 minutes | $0.54 | $0.20 | **$0.74** |

**Per Partner (3 podcasts):** ~$1.00-2.00

For 50 partners/month: **$50-100** additional cost

## Supported Platforms

| Platform | Status | Method |
|----------|--------|--------|
| YouTube | ✅ Fully supported | yt-dlp |
| SoundCloud | ✅ Supported | yt-dlp |
| Vimeo | ✅ Supported | yt-dlp |
| Spotify | ❌ Requires Spotify API | Not implemented |
| Apple Podcasts | ❌ Requires Apple API | Not implemented |
| Anchor.fm | ❌ Limited access | Not implemented |

## When to Enable

**Enable if:**
- Budget allows for $50-100/month extra costs
- Partners frequently appear on podcasts
- Want deep expertise validation
- Need unique conversation starters
- Premium research experience desired

**Keep disabled if:**
- Budget is tight
- Speed is priority (adds 2-5 min per podcast)
- Basic research is sufficient

## Test Command (When Enabled)

```
/partnerbot test-podcast https://youtube.com/watch?v=xyz
```

Shows:
- Transcription length
- Analysis breakdown
- Cost incurred
- Processing time

## Value Proposition

**Unique Intelligence:**
- Hear them speak in their own words
- Understand communication style
- Validate expertise through depth of discussion
- Find unique talking points for introductions
- Discover investment thesis evolution

Most research tools DON'T do this - you'd have a competitive advantage!

## Future Enhancements

1. **Spotify integration** (requires Premium account)
2. **Apple Podcasts RSS parsing**
3. **Speaker diarization** (identify who said what)
4. **Topic timestamps** (jump to relevant sections)
5. **Cross-episode analysis** (track evolution over time)

