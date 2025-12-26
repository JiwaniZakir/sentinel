# Research & Intelligence Pipeline Architecture

## Overview

A robust multi-stage pipeline that collects, validates, aggregates, and stores comprehensive intelligence on partners and their firms.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESEARCH PIPELINE ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │   TRIGGER    │
                              │  (Onboarding │
                              │   LinkedIn)  │
                              └──────┬───────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STAGE 1: DATA COLLECTION                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Tavily    │ │  Perplexity │ │  Perplexity │ │  Wikipedia  │           │
│  │  LinkedIn   │ │   Person    │ │    Firm     │ │   Search    │           │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘           │
│         │               │               │               │                   │
│         └───────────────┴───────────────┴───────────────┘                   │
│                                   │                                         │
│                                   ▼                                         │
│                        ┌──────────────────┐                                 │
│                        │  Raw Data Store  │                                 │
│                        │ (PartnerResearch)│                                 │
│                        └────────┬─────────┘                                 │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STAGE 2: CITATION CRAWLING                            │
│                                                                             │
│  Extract URLs from Perplexity citations → Web Crawler → Extract content     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │ Perplexity Citations    │ Crawled Articles  │ Extracted Facts   │        │
│  │ - TechCrunch articles   │ - Full text       │ - Funding rounds  │        │
│  │ - Forbes profiles       │ - Publication date│ - Key quotes      │        │
│  │ - Crunchbase pages      │ - Author          │ - Investments     │        │
│  │ - Company blogs         │ - Key paragraphs  │ - Achievements    │        │
│  └─────────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STAGE 3: QUALITY & VALIDATION                          │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │ Quality Scorer  │  │  Fact Checker   │  │  Deduplicator   │              │
│  │                 │  │                 │  │                 │              │
│  │ - Source trust  │  │ - Cross-ref     │  │ - Entity match  │              │
│  │ - Recency       │  │ - Consistency   │  │ - Merge records │              │
│  │ - Completeness  │  │ - Contradictions│  │ - Resolve dups  │              │
│  │ - Specificity   │  │ - Verification  │  │                 │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           └────────────────────┴────────────────────┘                       │
│                                │                                            │
│                                ▼                                            │
│                    ┌───────────────────────┐                                │
│                    │  Validated Data Pool  │                                │
│                    │  (scored & verified)  │                                │
│                    └───────────┬───────────┘                                │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STAGE 4: PROFILE AGGREGATION                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                      PERSON PROFILE                              │        │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │        │
│  │  │ Identity     │ │ Career       │ │ Achievements │             │        │
│  │  │ - Name       │ │ - Timeline   │ │ - Deals      │             │        │
│  │  │ - LinkedIn   │ │ - Companies  │ │ - Awards     │             │        │
│  │  │ - Social     │ │ - Roles      │ │ - Press      │             │        │
│  │  │ - Location   │ │ - Education  │ │ - Speaking   │             │        │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │        │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │        │
│  │  │ Investment   │ │ Content      │ │ Personality  │             │        │
│  │  │ - Thesis     │ │ - Articles   │ │ - Interests  │             │        │
│  │  │ - Sectors    │ │ - Podcasts   │ │ - Fun facts  │             │        │
│  │  │ - Stage      │ │ - Tweets     │ │ - Quotes     │             │        │
│  │  │ - Check size │ │ - Videos     │ │ - Style      │             │        │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                       FIRM PROFILE                               │        │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │        │
│  │  │ Identity     │ │ Investment   │ │ Team         │             │        │
│  │  │ - Name       │ │ - AUM        │ │ - Partners[] │ ◄─ Links to │        │
│  │  │ - Founded    │ │ - Portfolio  │ │ - Leadership │   Person    │        │
│  │  │ - HQ         │ │ - Thesis     │ │ - Headcount  │   Profiles  │        │
│  │  │ - Website    │ │ - Sectors    │ │              │             │        │
│  │  └──────────────┘ └──────────────┘ └──────────────┘             │        │
│  │  ┌──────────────┐ ┌──────────────┐                              │        │
│  │  │ News/PR      │ │ Reputation   │                              │        │
│  │  │ - Recent news│ │ - Rankings   │                              │        │
│  │  │ - Press      │ │ - Reviews    │                              │        │
│  │  │ - Funding    │ │ - Sentiment  │                              │        │
│  │  └──────────────┘ └──────────────┘                              │        │
│  └─────────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STAGE 5: INTRO GENERATION                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    AI INTRODUCTION ENGINE                        │        │
│  │                                                                  │        │
│  │  Input:                      Output:                            │        │
│  │  - Person Profile            - Unique, personal intro           │        │
│  │  - Firm Profile              - Specific achievements            │        │
│  │  - Onboarding answers        - Conversation starters            │        │
│  │  - Quality scores            - Connection opportunities         │        │
│  │                                                                  │        │
│  │  Rules:                                                         │        │
│  │  - Only use high-confidence facts (score > 0.7)                 │        │
│  │  - Include 2-3 specific achievements                            │        │
│  │  - Mention unique interests/fun facts                           │        │
│  │  - Highlight connection opportunities with community            │        │
│  └─────────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Models

### PartnerResearch (Raw Data - Already Exists)
Stores raw data from each source with metadata.

### PersonProfile (NEW - Aggregated)
```prisma
model PersonProfile {
  id                String   @id @default(uuid())
  partnerId         String   @unique
  
  // Core Identity
  name              String
  linkedinUrl       String?
  twitterUrl        String?
  email             String?
  location          String?
  photoUrl          String?
  
  // Career Timeline (JSON array)
  careerTimeline    Json?    // [{company, role, startDate, endDate, highlights}]
  education         Json?    // [{school, degree, field, year}]
  
  // Investment/Professional Focus
  investmentThesis  String?
  sectors           String[]
  stageFocus        String[]
  checkSizeRange    String?
  
  // Achievements & Recognition
  notableDeals      Json?    // [{company, round, amount, date, outcome}]
  awards            Json?    // [{name, year, organization}]
  pressFeatures     Json?    // [{publication, title, url, date}]
  speakingEvents    Json?    // [{event, topic, date}]
  
  // Content & Thought Leadership
  publications      Json?    // [{title, url, type, date}]
  podcasts          Json?    // [{show, episode, url, date}]
  socialContent     Json?    // Recent interesting tweets/posts
  
  // Personal (for engaging intros)
  funFacts          String[]
  interests         String[]
  quotableQuotes    String[]
  
  // Quality & Metadata
  dataQualityScore  Float    @default(0)
  factCheckScore    Float    @default(0)
  lastUpdated       DateTime @updatedAt
  sourcesUsed       String[]
}
```

### FirmProfile (NEW - Aggregated)
```prisma
model FirmProfile {
  id              String   @id @default(uuid())
  
  // Core Identity
  name            String   @unique
  type            String   // VC, Corporate, Angel Network, etc.
  foundedYear     Int?
  headquarters    String?
  website         String?
  linkedinUrl     String?
  
  // Investment Profile (for VC/Investment firms)
  aum             String?  // Assets under management
  fundCount       Int?
  portfolioSize   Int?
  investmentThesis String?
  sectorFocus     String[]
  stageFocus      String[]
  geographyFocus  String[]
  
  // Portfolio & Track Record
  notablePortfolio Json?   // [{company, round, outcome}]
  exits           Json?    // [{company, type, value, date}]
  
  // Team
  teamMembers     Json?    // [{name, role, linkedinUrl, partnerId}]
  partnerCount    Int?
  
  // News & Reputation
  recentNews      Json?    // [{title, url, date, summary}]
  fundingNews     Json?    // Fund raises, etc.
  rankings        Json?    // [{source, rank, category, year}]
  
  // Quality & Metadata
  dataQualityScore Float   @default(0)
  lastUpdated     DateTime @updatedAt
  sourcesUsed     String[]
  
  // Relationships
  partners        Partner[]
}
```

### CitationCrawl (NEW - Crawled URLs)
```prisma
model CitationCrawl {
  id            String   @id @default(uuid())
  url           String   @unique
  domain        String
  
  // Content
  title         String?
  author        String?
  publishedDate DateTime?
  fullText      String?  // Extracted article text
  summary       String?  // AI-generated summary
  
  // Extracted Facts
  extractedFacts Json?   // [{type, value, confidence}]
  mentionedPeople String[]
  mentionedCompanies String[]
  
  // Metadata
  crawledAt     DateTime @default(now())
  httpStatus    Int?
  contentType   String?
  trustScore    Float    @default(0.5) // Domain trust score
  
  // Relationships
  researchId    String?  // Which research triggered this crawl
}
```

## Quality Scoring Algorithm

```javascript
function calculateQualityScore(dataPoint) {
  let score = 0;
  
  // Source Trust (0-30 points)
  const sourceTrust = {
    'linkedin': 25,
    'wikipedia': 20,
    'perplexity': 15,
    'tavily': 15,
    'crawled_crunchbase': 25,
    'crawled_forbes': 20,
    'crawled_techcrunch': 20,
    'crawled_blog': 10,
  };
  score += sourceTrust[dataPoint.source] || 10;
  
  // Recency (0-25 points)
  const ageInDays = daysSince(dataPoint.scrapedAt);
  if (ageInDays < 7) score += 25;
  else if (ageInDays < 30) score += 20;
  else if (ageInDays < 90) score += 15;
  else if (ageInDays < 365) score += 10;
  else score += 5;
  
  // Specificity (0-25 points)
  if (dataPoint.hasSpecificDates) score += 5;
  if (dataPoint.hasSpecificNumbers) score += 5;
  if (dataPoint.hasNamedEntities) score += 5;
  if (dataPoint.hasCitations) score += 5;
  if (dataPoint.hasDirectQuotes) score += 5;
  
  // Corroboration (0-20 points)
  score += Math.min(dataPoint.corroboratingSourcesCount * 5, 20);
  
  return score / 100; // Normalize to 0-1
}
```

## Fact Checking Logic

```javascript
async function factCheck(facts, allSources) {
  const checkedFacts = [];
  
  for (const fact of facts) {
    const result = {
      fact: fact,
      confidence: 0,
      corroboratingSources: [],
      contradictions: [],
      status: 'unverified'
    };
    
    // Check against other sources
    for (const source of allSources) {
      const match = findMatchingInfo(fact, source);
      
      if (match.type === 'confirms') {
        result.corroboratingSources.push(source.name);
        result.confidence += 0.2;
      } else if (match.type === 'contradicts') {
        result.contradictions.push({
          source: source.name,
          conflictingValue: match.value
        });
        result.confidence -= 0.1;
      }
    }
    
    // Determine status
    if (result.corroboratingSources.length >= 2) {
      result.status = 'verified';
    } else if (result.contradictions.length > 0) {
      result.status = 'disputed';
    } else if (result.corroboratingSources.length === 1) {
      result.status = 'partially_verified';
    }
    
    checkedFacts.push(result);
  }
  
  return checkedFacts;
}
```

## Introduction Generation Prompt

```
You are crafting a warm, engaging introduction for a new community member. 
You have access to deeply researched information about them.

PERSON PROFILE:
{personProfile}

FIRM PROFILE:
{firmProfile}

ONBOARDING ANSWERS:
{onboardingData}

HIGH-CONFIDENCE FACTS (use these!):
{verifiedFacts}

RULES:
1. Only mention facts with confidence > 0.7
2. Lead with something unique/impressive (not generic "works at X")
3. Include 2-3 specific achievements or interesting details
4. Add a personal touch (interests, fun facts)
5. End with connection opportunities for the community
6. Keep it under 200 words
7. Use warm, welcoming tone

AVOID:
- Generic statements like "experienced investor"
- Unverified claims
- Anything marked as "disputed"
- Overly formal language

Generate an introduction that will make people excited to connect with this person.
```

## Implementation Phases

### Phase 1: Database Schema (Today)
- Add PersonProfile, FirmProfile, CitationCrawl models
- Run migrations

### Phase 2: Citation Crawler (Today)
- Extract URLs from Perplexity citations
- Web scraper using Cheerio/Puppeteer
- Content extraction and summarization

### Phase 3: Quality & Fact Checking (Today)
- Quality scoring service
- Cross-reference fact checker
- Deduplication logic

### Phase 4: Profile Aggregator (Today)
- Combine all sources into PersonProfile
- Build/update FirmProfile (multi-person aware)
- Generate quality scores

### Phase 5: Enhanced Intro Generation (Today)
- Update prompts to use rich profiles
- Only use verified facts
- Test with real data

