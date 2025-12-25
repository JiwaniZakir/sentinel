/**
 * Event outreach prompts for personalized messaging
 */

/**
 * Generate personalized event outreach prompt
 */
function getOutreachPrompt(partnerProfile, eventDetails) {
  return `You are generating a personalized event invitation DM for a partner.

## PARTNER PROFILE
Name: ${partnerProfile.name || 'Partner'}
Firm: ${partnerProfile.firm}
Type: ${partnerProfile.partnerType}
Role: ${partnerProfile.role || 'N/A'}
Sectors: ${(partnerProfile.sectors || []).join(', ') || 'General'}
Stage Focus: ${(partnerProfile.stageFocus || []).join(', ') || 'All stages'}
What they're looking for: ${partnerProfile.goalsFromCommunity || 'Connecting with founders'}
How they engage: ${(partnerProfile.engagementPreferences || []).join(', ') || 'Various'}

## EVENT DETAILS
Name: ${eventDetails.name}
Date: ${eventDetails.dateTime}
Location: ${eventDetails.location || 'TBD'}
Type: ${eventDetails.eventType}
Description: ${eventDetails.description || 'N/A'}
RSVP Link: ${eventDetails.rsvpLink || '[RSVP Link]'}

## INSTRUCTIONS
Generate a warm, personalized DM (under 150 words) that:
1. References something specific from their profile (firm, focus area, past interest)
2. Explains why THIS event is relevant to THEM specifically
3. Highlights founders/topics aligned with their interests
4. Includes clear CTA with RSVP link
5. Sounds human and personal, not templated

## TONE EXAMPLES

For a VC focused on fintech:
"Hey Sarah! Quick heads up — we have a pitch night coming up on [date] featuring 3 fintech startups in the payments space. One founder previously built payments infra at Stripe, right in your wheelhouse. Thought you'd want first look before we open it wider. [RSVP here]"

For a Corporate partner in healthcare:
"Hi Michael! We're hosting office hours next Thursday with 5 healthtech founders, including two working on clinical workflow automation — I remember you mentioned this was a pain point at [Company]. Would love to connect you. [RSVP here]"

For a Community Builder:
"Hey Lisa! We have a Demo Day on [date] with 10 founders presenting. Given the overlap with your accelerator's focus on B2B SaaS, thought some of your founders might benefit from attending, or we could cross-promote to our networks. Let me know! [Details here]"

## OUTPUT
Generate ONLY the personalized message, no preamble or explanation.`;
}

/**
 * Get batch outreach summary prompt
 */
function getBatchSummaryPrompt(eventDetails, partnerCounts) {
  return `Summarize this event outreach batch:

Event: ${eventDetails.name}
Date: ${eventDetails.dateTime}
Type: ${eventDetails.eventType}

Partners to contact:
- VCs: ${partnerCounts.VC || 0}
- Corporates: ${partnerCounts.CORPORATE || 0}
- Community Builders: ${partnerCounts.COMMUNITY_BUILDER || 0}
- Angels: ${partnerCounts.ANGEL || 0}

Generate a brief 1-2 sentence summary for the admin reviewing these outreach messages.`;
}

/**
 * Event types and their descriptions
 */
const eventTypes = {
  pitch_night: {
    label: 'Pitch Night',
    description: 'Founders pitch to investors and partners',
    defaultAudience: ['VC', 'ANGEL', 'CORPORATE'],
  },
  demo_day: {
    label: 'Demo Day',
    description: 'Cohort showcase event',
    defaultAudience: ['VC', 'ANGEL', 'CORPORATE', 'COMMUNITY_BUILDER'],
  },
  office_hours: {
    label: 'Office Hours',
    description: '1:1 mentorship sessions',
    defaultAudience: ['VC', 'CORPORATE', 'ANGEL'],
  },
  networking_event: {
    label: 'Networking Event',
    description: 'Community networking and connection',
    defaultAudience: ['VC', 'CORPORATE', 'COMMUNITY_BUILDER', 'ANGEL'],
  },
  workshop: {
    label: 'Workshop',
    description: 'Educational session or training',
    defaultAudience: ['CORPORATE', 'COMMUNITY_BUILDER'],
  },
  other: {
    label: 'Other',
    description: 'Custom event type',
    defaultAudience: ['VC', 'CORPORATE', 'COMMUNITY_BUILDER', 'ANGEL'],
  },
};

/**
 * Get event type options for modal
 */
function getEventTypeOptions() {
  return Object.entries(eventTypes).map(([value, data]) => ({
    text: {
      type: 'plain_text',
      text: data.label,
    },
    value,
  }));
}

module.exports = {
  getOutreachPrompt,
  getBatchSummaryPrompt,
  eventTypes,
  getEventTypeOptions,
};

