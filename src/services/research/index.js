/**
 * Research Module
 * 
 * Comprehensive research pipeline for partner intelligence gathering.
 * 
 * Pipeline Stages:
 * 1. Data Collection (LinkedIn, Perplexity, Tavily, Wikipedia)
 * 2. Citation Crawling (follow Perplexity links)
 * 3. Quality Scoring & Fact Checking
 * 4. Profile Aggregation (PersonProfile, FirmProfile)
 * 5. Introduction Generation
 */

const orchestrator = require('./orchestrator');
const linkedin = require('./linkedin');
const perplexity = require('./perplexity');
const tavily = require('./tavily');
const wikipedia = require('./wikipedia');
const twitter = require('./twitter');
const reddit = require('./reddit');
const podcast = require('./podcast');
const crawler = require('./crawler');
const qualityScorer = require('./qualityScorer');
const profileAggregator = require('./profileAggregator');
const introGenerator = require('./introGenerator');

module.exports = {
  // ============ MAIN ENTRY POINTS ============
  
  // Quick research (Stage 1 only - fast)
  startResearch: orchestrator.startResearch,
  
  // Full pipeline (all 5 stages - comprehensive)
  runFullPipeline: orchestrator.runFullPipeline,
  
  // Status and retrieval
  getResearchStatus: orchestrator.getResearchStatus,
  getPartnerResearch: orchestrator.getPartnerResearch,
  
  // ============ DATA COLLECTION SERVICES ============
  
  linkedin,
  perplexity,
  tavily,
  wikipedia,
  twitter,
  reddit,
  podcast,
  
  // ============ PROCESSING SERVICES ============
  
  // Web crawler for citations
  crawler: {
    crawlUrl: crawler.crawlUrl,
    crawlUrls: crawler.crawlUrls,
    extractCitations: crawler.extractCitationsFromPerplexity,
    getDomainTrustScore: crawler.getDomainTrustScore,
  },
  
  // Quality and fact checking
  quality: {
    calculateQualityScore: qualityScorer.calculateQualityScore,
    calculateProfileQualityScore: qualityScorer.calculateProfileQualityScore,
    crossReferenceFacts: qualityScorer.crossReferenceFacts,
    deduplicateFacts: qualityScorer.deduplicateFacts,
    getHighConfidenceFacts: qualityScorer.getHighConfidenceFacts,
  },
  
  // Profile aggregation
  profiles: {
    buildPersonProfile: profileAggregator.buildPersonProfile,
    buildFirmProfile: profileAggregator.buildFirmProfile,
    linkPersonToFirm: profileAggregator.linkPersonToFirm,
  },
  
  // Introduction generation
  intro: {
    generateRichIntro: introGenerator.generateRichIntro,
    generateIntroPreview: introGenerator.generateIntroPreview,
  },
  
  // ============ UTILITY FUNCTIONS ============
  
  isValidLinkedInUrl: linkedin.isValidLinkedInUrl,
  extractLinkedInUsername: linkedin.extractLinkedInUsername,
  aggregateResults: orchestrator.aggregateResults,
};
