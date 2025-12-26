/**
 * Quality Scorer & Fact Checker Service
 * 
 * Evaluates data quality, cross-references facts between sources,
 * and assigns confidence scores.
 */

const { logger } = require('../../utils/logger');

// Source trust weights
const SOURCE_TRUST = {
  'linkedin_scraper': 0.85,
  'tavily_linkedin': 0.80,
  'perplexity': 0.75,
  'tavily': 0.70,
  'wikipedia': 0.85,
  'crawled_techcrunch': 0.85,
  'crawled_forbes': 0.85,
  'crawled_bloomberg': 0.90,
  'crawled_crunchbase': 0.88,
  'crawled_other': 0.50,
};

/**
 * Calculate quality score for a single data point
 * Returns a score from 0-1
 */
function calculateQualityScore(dataPoint) {
  let score = 0;
  let maxScore = 0;
  
  // 1. Source Trust (0-30 points)
  maxScore += 30;
  const sourceTrust = SOURCE_TRUST[dataPoint.source] || 0.5;
  score += sourceTrust * 30;
  
  // 2. Recency (0-25 points)
  maxScore += 25;
  if (dataPoint.scrapedAt || dataPoint.crawledAt) {
    const date = new Date(dataPoint.scrapedAt || dataPoint.crawledAt);
    const ageInDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    
    if (ageInDays < 7) score += 25;
    else if (ageInDays < 30) score += 20;
    else if (ageInDays < 90) score += 15;
    else if (ageInDays < 365) score += 10;
    else score += 5;
  }
  
  // 3. Specificity (0-25 points)
  maxScore += 25;
  const content = JSON.stringify(dataPoint.data || dataPoint);
  
  // Has specific dates?
  if (/\b(19|20)\d{2}\b/.test(content)) score += 5;
  
  // Has specific numbers/amounts?
  if (/\$[\d,.]+\s*(million|billion|m|b|M|B)/i.test(content)) score += 5;
  
  // Has named entities (proper nouns)?
  const properNouns = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g);
  if (properNouns && properNouns.length > 3) score += 5;
  
  // Has URLs/citations?
  if (/https?:\/\//.test(content)) score += 5;
  
  // Has direct quotes?
  if (/"[^"]{20,}"/.test(content)) score += 5;
  
  // 4. Completeness (0-20 points)
  maxScore += 20;
  const completeness = assessCompleteness(dataPoint);
  score += completeness * 20;
  
  return score / maxScore;
}

/**
 * Assess completeness of a data point
 */
function assessCompleteness(dataPoint) {
  const data = dataPoint.data || dataPoint;
  let filledFields = 0;
  let totalFields = 0;
  
  function countFields(obj, depth = 0) {
    if (depth > 3) return; // Limit recursion
    
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('_') || key === 'id') continue;
      
      totalFields++;
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value)) {
          if (value.length > 0) filledFields++;
        } else if (typeof value === 'object') {
          countFields(value, depth + 1);
        } else {
          filledFields++;
        }
      }
    }
  }
  
  if (typeof data === 'object' && data !== null) {
    countFields(data);
  }
  
  return totalFields > 0 ? filledFields / totalFields : 0;
}

/**
 * Cross-reference facts between multiple sources
 * Returns fact check results
 */
function crossReferenceFacts(facts, allSources) {
  console.log('=== FACT CHECKING ===');
  console.log(`Checking ${facts.length} facts against ${allSources.length} sources`);
  
  const checkedFacts = [];
  
  for (const fact of facts) {
    const result = {
      fact: fact,
      originalSource: fact.source,
      confidence: 0.3, // Base confidence
      corroboratingSources: [],
      contradictions: [],
      status: 'unverified',
    };
    
    // Normalize fact value for comparison
    const normalizedFact = normalizeFact(fact.value);
    
    // Check against each source
    for (const source of allSources) {
      if (source.source === fact.source) continue; // Skip same source
      
      const sourceContent = JSON.stringify(source.data || source).toLowerCase();
      const match = findMatchingInfo(normalizedFact, sourceContent, fact.type);
      
      if (match.type === 'confirms') {
        result.corroboratingSources.push({
          source: source.source,
          matchedText: match.matchedText,
        });
        result.confidence += 0.15;
      } else if (match.type === 'contradicts') {
        result.contradictions.push({
          source: source.source,
          conflictingValue: match.conflictingValue,
        });
        result.confidence -= 0.1;
      }
    }
    
    // Determine status based on corroboration
    if (result.corroboratingSources.length >= 2) {
      result.status = 'verified';
      result.confidence = Math.min(result.confidence + 0.2, 1);
    } else if (result.contradictions.length > 0) {
      result.status = result.corroboratingSources.length > 0 ? 'disputed' : 'contradicted';
    } else if (result.corroboratingSources.length === 1) {
      result.status = 'partially_verified';
    }
    
    // Cap confidence
    result.confidence = Math.max(0, Math.min(1, result.confidence));
    
    checkedFacts.push(result);
  }
  
  const verified = checkedFacts.filter(f => f.status === 'verified').length;
  const disputed = checkedFacts.filter(f => f.status === 'disputed').length;
  console.log(`Fact check complete: ${verified} verified, ${disputed} disputed`);
  
  return checkedFacts;
}

/**
 * Normalize a fact for comparison
 */
function normalizeFact(value) {
  if (typeof value !== 'string') return String(value).toLowerCase();
  
  return value
    .toLowerCase()
    .replace(/[^\w\s$]/g, '') // Remove punctuation except $
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Find matching information in source content
 */
function findMatchingInfo(normalizedFact, sourceContent, factType) {
  const result = { type: 'none', matchedText: null, conflictingValue: null };
  
  // Extract key terms from the fact
  const keyTerms = extractKeyTerms(normalizedFact, factType);
  
  if (keyTerms.length === 0) return result;
  
  // Check how many key terms appear in source
  const matchedTerms = keyTerms.filter(term => sourceContent.includes(term.toLowerCase()));
  const matchRatio = matchedTerms.length / keyTerms.length;
  
  if (matchRatio >= 0.7) {
    result.type = 'confirms';
    result.matchedText = matchedTerms.join(', ');
  } else if (factType === 'funding' || factType === 'amount') {
    // Special handling for numbers - check for contradicting values
    const factNumbers = normalizedFact.match(/\d+(?:\.\d+)?/g);
    const sourceNumbers = sourceContent.match(/\d+(?:\.\d+)?/g);
    
    if (factNumbers && sourceNumbers) {
      const hasContradiction = factNumbers.some(fn => {
        const factNum = parseFloat(fn);
        return sourceNumbers.some(sn => {
          const sourceNum = parseFloat(sn);
          // If numbers are in similar range but different, might be contradiction
          const ratio = Math.max(factNum, sourceNum) / Math.min(factNum, sourceNum);
          return ratio > 1.5 && ratio < 10; // Similar magnitude but different
        });
      });
      
      if (hasContradiction) {
        result.type = 'contradicts';
        result.conflictingValue = 'Different amount found';
      }
    }
  }
  
  return result;
}

/**
 * Extract key terms from a fact based on type
 */
function extractKeyTerms(fact, factType) {
  const terms = [];
  
  // Extract amounts
  const amounts = fact.match(/\$?[\d,.]+\s*(million|billion|m|b)?/gi);
  if (amounts) terms.push(...amounts.map(a => a.toLowerCase()));
  
  // Extract proper nouns (company/person names)
  const names = fact.match(/[a-z]+(?:\s+[a-z]+)*/gi);
  if (names) {
    terms.push(...names.filter(n => n.length > 3));
  }
  
  // Extract years
  const years = fact.match(/\b(19|20)\d{2}\b/g);
  if (years) terms.push(...years);
  
  // Type-specific terms
  if (factType === 'funding') {
    const fundingTerms = fact.match(/(seed|series\s*[a-z]|round|raised|funding)/gi);
    if (fundingTerms) terms.push(...fundingTerms.map(t => t.toLowerCase()));
  }
  
  if (factType === 'position') {
    const positions = fact.match(/(ceo|cto|cfo|partner|director|founder|manager)/gi);
    if (positions) terms.push(...positions.map(p => p.toLowerCase()));
  }
  
  return [...new Set(terms)]; // Deduplicate
}

/**
 * Deduplicate facts from multiple sources
 */
function deduplicateFacts(facts) {
  const uniqueFacts = [];
  const seen = new Set();
  
  for (const fact of facts) {
    const normalized = normalizeFact(fact.value);
    const key = `${fact.type}:${normalized.substring(0, 50)}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFacts.push(fact);
    } else {
      // If we've seen this fact, merge confidence scores
      const existing = uniqueFacts.find(f => 
        f.type === fact.type && 
        normalizeFact(f.value).substring(0, 50) === normalized.substring(0, 50)
      );
      
      if (existing) {
        existing.confidence = Math.min(1, (existing.confidence || 0.5) + 0.1);
        existing.sources = existing.sources || [];
        existing.sources.push(fact.source);
      }
    }
  }
  
  return uniqueFacts;
}

/**
 * Calculate overall profile quality score
 */
function calculateProfileQualityScore(researchResults) {
  const scores = [];
  const weights = {
    linkedin: 2.0,
    personNews: 1.5,
    firmInfo: 1.5,
    socialProfiles: 1.0,
    wikipediaPerson: 1.2,
    wikipediaCompany: 1.2,
  };
  
  for (const [key, result] of Object.entries(researchResults)) {
    if (result?.success && weights[key]) {
      const qualityScore = calculateQualityScore(result);
      scores.push({
        source: key,
        score: qualityScore,
        weight: weights[key],
      });
    }
  }
  
  if (scores.length === 0) return 0;
  
  // Weighted average
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  const weightedSum = scores.reduce((sum, s) => sum + s.score * s.weight, 0);
  
  return weightedSum / totalWeight;
}

/**
 * Get high-confidence facts only (for intro generation)
 */
function getHighConfidenceFacts(checkedFacts, minConfidence = 0.7) {
  return checkedFacts
    .filter(f => f.confidence >= minConfidence && f.status !== 'contradicted')
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Merge duplicate person/company entries
 */
function mergeEntities(entities) {
  const merged = {};
  
  for (const entity of entities) {
    const normalizedName = entity.name?.toLowerCase().trim();
    if (!normalizedName) continue;
    
    if (merged[normalizedName]) {
      // Merge data
      merged[normalizedName] = {
        ...merged[normalizedName],
        ...entity,
        sources: [...(merged[normalizedName].sources || []), entity.source],
        confidence: Math.min(1, (merged[normalizedName].confidence || 0.5) + 0.1),
      };
    } else {
      merged[normalizedName] = {
        ...entity,
        sources: [entity.source],
      };
    }
  }
  
  return Object.values(merged);
}

module.exports = {
  calculateQualityScore,
  crossReferenceFacts,
  deduplicateFacts,
  calculateProfileQualityScore,
  getHighConfidenceFacts,
  mergeEntities,
  normalizeFact,
  SOURCE_TRUST,
};

