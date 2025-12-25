const OpenAI = require('openai');
const config = require('../config');
const { logger } = require('../utils/logger');
const onboardingPrompts = require('../prompts/onboarding');
const eventOutreachPrompts = require('../prompts/eventOutreach');

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

/**
 * Generate onboarding response in multi-turn conversation
 */
async function generateOnboardingResponse(conversationHistory, userMessage, partnerName) {
  const systemPrompt = onboardingPrompts.getSystemPrompt(config.orgName);
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages,
      temperature: 0.7,
      max_tokens: 800,
    });

    const content = response.choices[0].message.content;
    
    // Check if the response contains JSON (conversation complete)
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        const extractedData = JSON.parse(jsonMatch[1]);
        return {
          type: 'complete',
          message: content.replace(/```json\n?[\s\S]*?\n?```/, '').trim(),
          extractedData,
        };
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to parse JSON from AI response');
      }
    }

    return {
      type: 'continue',
      message: content,
    };
  } catch (error) {
    logger.error({ error: error.message }, 'OpenAI API error in onboarding');
    throw error;
  }
}

/**
 * Extract structured data from completed conversation
 */
async function extractPartnerData(conversationHistory) {
  const extractionPrompt = onboardingPrompts.getExtractionPrompt();
  
  const conversationText = conversationHistory
    .map(m => `${m.role === 'assistant' ? 'Bot' : 'Partner'}: ${m.content}`)
    .join('\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: extractionPrompt },
        { role: 'user', content: `Extract partner information from this conversation:\n\n${conversationText}` },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    logger.error({ error: error.message }, 'OpenAI API error in data extraction');
    throw error;
  }
}

/**
 * Generate personalized event outreach message
 */
async function generateEventOutreach(partnerProfile, eventDetails) {
  const prompt = eventOutreachPrompts.getOutreachPrompt(partnerProfile, eventDetails);

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 300,
    });

    return response.choices[0].message.content;
  } catch (error) {
    logger.error({ error: error.message }, 'OpenAI API error in event outreach');
    throw error;
  }
}

/**
 * Generate introduction message from partner data
 */
async function generateIntroMessage(partnerData) {
  const prompt = onboardingPrompts.getIntroPrompt(partnerData, config.orgName);

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 400,
    });

    return response.choices[0].message.content;
  } catch (error) {
    logger.error({ error: error.message }, 'OpenAI API error in intro generation');
    throw error;
  }
}

/**
 * Generate digest summary
 */
async function generateDigestSummary(digestContent) {
  const prompt = `Generate a brief, engaging summary (2-3 sentences) for this community digest:

Events: ${JSON.stringify(digestContent.events || [])}
New Partners: ${JSON.stringify(digestContent.newPartners || [])}
Highlights: ${JSON.stringify(digestContent.highlights || [])}

Make it warm and community-focused.`;

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 150,
    });

    return response.choices[0].message.content;
  } catch (error) {
    logger.error({ error: error.message }, 'OpenAI API error in digest summary');
    throw error;
  }
}

module.exports = {
  generateOnboardingResponse,
  extractPartnerData,
  generateEventOutreach,
  generateIntroMessage,
  generateDigestSummary,
};

