/**
 * Research Module
 * 
 * Exports all research services for partner intelligence gathering.
 */

const orchestrator = require('./orchestrator');
const linkedin = require('./linkedin');
const perplexity = require('./perplexity');
const tavily = require('./tavily');
const aggregator = require('./aggregator');

module.exports = {
  // Main entry point
  startResearch: orchestrator.startResearch,
  getResearchStatus: orchestrator.getResearchStatus,
  getPartnerResearch: orchestrator.getPartnerResearch,
  
  // Individual services
  linkedin,
  perplexity,
  tavily,
  
  // Aggregation utilities
  generateAIContext: aggregator.generateAIContext,
  generateSummaryCard: aggregator.generateSummaryCard,
  generateTalkingPoints: aggregator.generateTalkingPoints,
  isResearchFresh: aggregator.isResearchFresh,
  mergeResearch: aggregator.mergeResearch,
  
  // Utility functions
  isValidLinkedInUrl: linkedin.isValidLinkedInUrl,
  extractLinkedInUsername: linkedin.extractLinkedInUsername,
};

