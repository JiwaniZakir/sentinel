/**
 * Format a date for display
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a date and time for display
 */
function formatDateTime(date) {
  return new Date(date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Format partner type for display
 */
function formatPartnerType(type) {
  const typeMap = {
    VC: 'VC Partner',
    CORPORATE: 'Corporate Partner',
    COMMUNITY_BUILDER: 'Community Builder',
    ANGEL: 'Angel Investor',
    OTHER: 'Partner',
  };
  return typeMap[type] || type;
}

/**
 * Format sectors array for display
 */
function formatSectors(sectors) {
  if (!sectors || sectors.length === 0) return 'N/A';
  return sectors.join(', ');
}

/**
 * Format stage focus array for display
 */
function formatStageFocus(stages) {
  if (!stages || stages.length === 0) return 'N/A';
  return stages.join(', ');
}

/**
 * Truncate text with ellipsis
 */
function truncate(text, maxLength = 100) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Build a divider block
 */
function divider() {
  return { type: 'divider' };
}

/**
 * Build a section block with markdown
 */
function section(text) {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text,
    },
  };
}

/**
 * Build a context block
 */
function context(texts) {
  return {
    type: 'context',
    elements: texts.map(text => ({
      type: 'mrkdwn',
      text,
    })),
  };
}

/**
 * Build action buttons
 */
function actions(actionId, buttons) {
  return {
    type: 'actions',
    block_id: actionId,
    elements: buttons.map(btn => ({
      type: 'button',
      text: {
        type: 'plain_text',
        text: btn.text,
        emoji: true,
      },
      value: btn.value,
      action_id: btn.actionId,
      style: btn.style, // 'primary' or 'danger'
    })),
  };
}

/**
 * Build header block
 */
function header(text) {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text,
      emoji: true,
    },
  };
}

module.exports = {
  formatDate,
  formatDateTime,
  formatPartnerType,
  formatSectors,
  formatStageFocus,
  truncate,
  divider,
  section,
  context,
  actions,
  header,
};

