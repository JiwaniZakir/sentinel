const config = require('../config');
const { logger } = require('../utils/logger');

/**
 * Slack API helper functions
 */

/**
 * Get user info by ID
 */
async function getUserInfo(client, userId) {
  try {
    const result = await client.users.info({ user: userId });
    return result.user;
  } catch (error) {
    logger.error({ error: error.message, userId }, 'Failed to get user info');
    return null;
  }
}

/**
 * Get user's display name
 */
async function getUserDisplayName(client, userId) {
  const user = await getUserInfo(client, userId);
  if (!user) return 'Partner';
  return user.profile?.display_name || user.profile?.real_name || user.name || 'Partner';
}

/**
 * Get user's email
 */
async function getUserEmail(client, userId) {
  const user = await getUserInfo(client, userId);
  return user?.profile?.email || null;
}

/**
 * Send a DM to a user
 */
async function sendDM(client, userId, blocks, text) {
  try {
    // Open DM channel
    const dmChannel = await client.conversations.open({ users: userId });
    
    // Send message
    const result = await client.chat.postMessage({
      channel: dmChannel.channel.id,
      blocks,
      text: text || 'Message from PartnerBot',
    });
    
    return result;
  } catch (error) {
    logger.error({ error: error.message, userId }, 'Failed to send DM');
    throw error;
  }
}

/**
 * Post message to a channel
 */
async function postToChannel(client, channelId, blocks, text) {
  try {
    const result = await client.chat.postMessage({
      channel: channelId,
      blocks,
      text: text || 'Message from PartnerBot',
    });
    return result;
  } catch (error) {
    logger.error({ error: error.message, channelId }, 'Failed to post to channel');
    throw error;
  }
}

/**
 * Update a message
 */
async function updateMessage(client, channelId, ts, blocks, text) {
  try {
    const result = await client.chat.update({
      channel: channelId,
      ts,
      blocks,
      text: text || 'Message updated',
    });
    return result;
  } catch (error) {
    logger.error({ error: error.message, channelId, ts }, 'Failed to update message');
    throw error;
  }
}

/**
 * Add user to a channel
 */
async function addUserToChannel(client, channelId, userId) {
  try {
    await client.conversations.invite({
      channel: channelId,
      users: userId,
    });
    return true;
  } catch (error) {
    // User might already be in channel
    if (error.data?.error === 'already_in_channel') {
      return true;
    }
    logger.error({ error: error.message, channelId, userId }, 'Failed to add user to channel');
    return false;
  }
}

/**
 * Add user to a user group
 */
async function addUserToGroup(client, groupId, userId) {
  try {
    // Get current members
    const group = await client.usergroups.users.list({ usergroup: groupId });
    const currentUsers = group.users || [];
    
    if (currentUsers.includes(userId)) {
      return true; // Already in group
    }
    
    // Add user
    await client.usergroups.users.update({
      usergroup: groupId,
      users: [...currentUsers, userId].join(','),
    });
    return true;
  } catch (error) {
    logger.error({ error: error.message, groupId, userId }, 'Failed to add user to group');
    return false;
  }
}

/**
 * Get user group ID for a partner type
 */
function getUserGroupForPartnerType(partnerType) {
  const groupMap = {
    VC: config.userGroups.vcPartners,
    CORPORATE: config.userGroups.corporatePartners,
    COMMUNITY_BUILDER: config.userGroups.communityBuilders,
    ANGEL: config.userGroups.angelInvestors,
  };
  return groupMap[partnerType];
}

/**
 * Get private channels for a partner type
 */
function getPrivateChannelsForPartnerType(partnerType) {
  const channelMap = {
    VC: [config.channels.dealFlow],
    CORPORATE: [config.channels.sponsorship, config.channels.foundersRaised],
    COMMUNITY_BUILDER: [config.channels.partnershipOpp, config.channels.dropEvents],
  };
  return channelMap[partnerType] || [];
}

/**
 * Get sector channel ID from sector name
 */
function getSectorChannelId(sector) {
  const sectorLower = sector.toLowerCase();
  const channelMap = {
    fintech: config.channels.sectorFintech,
    healthtech: config.channels.sectorHealthtech,
    climate: config.channels.sectorClimate,
    'ai/ml': config.channels.sectorAiMl,
    ai: config.channels.sectorAiMl,
    ml: config.channels.sectorAiMl,
    'hardware/robotics': config.channels.sectorHardwareRobotics,
    hardware: config.channels.sectorHardwareRobotics,
    robotics: config.channels.sectorHardwareRobotics,
    consumer: config.channels.sectorConsumer,
  };
  
  // Try exact match first
  if (channelMap[sectorLower]) {
    return channelMap[sectorLower];
  }
  
  // Try partial match
  for (const [key, value] of Object.entries(channelMap)) {
    if (sectorLower.includes(key) || key.includes(sectorLower)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Add partner to appropriate channels based on their type and sectors
 */
async function setupPartnerChannels(client, userId, partnerType, sectors = []) {
  const results = {
    userGroup: false,
    privateChannels: [],
    sectorChannels: [],
  };

  // Add to user group
  const groupId = getUserGroupForPartnerType(partnerType);
  if (groupId) {
    results.userGroup = await addUserToGroup(client, groupId, userId);
  }

  // Add to private channels based on partner type
  const privateChannels = getPrivateChannelsForPartnerType(partnerType);
  for (const channelId of privateChannels) {
    if (channelId) {
      const added = await addUserToChannel(client, channelId, userId);
      if (added) results.privateChannels.push(channelId);
    }
  }

  // Add to sector channels
  for (const sector of sectors) {
    const channelId = getSectorChannelId(sector);
    if (channelId) {
      const added = await addUserToChannel(client, channelId, userId);
      if (added) results.sectorChannels.push(channelId);
    }
  }

  return results;
}

/**
 * Open a modal
 */
async function openModal(client, triggerId, view) {
  try {
    const result = await client.views.open({
      trigger_id: triggerId,
      view,
    });
    return result;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to open modal');
    throw error;
  }
}

/**
 * Update a modal
 */
async function updateModal(client, viewId, view) {
  try {
    const result = await client.views.update({
      view_id: viewId,
      view,
    });
    return result;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to update modal');
    throw error;
  }
}

module.exports = {
  getUserInfo,
  getUserDisplayName,
  getUserEmail,
  sendDM,
  postToChannel,
  updateMessage,
  addUserToChannel,
  addUserToGroup,
  getUserGroupForPartnerType,
  getPrivateChannelsForPartnerType,
  getSectorChannelId,
  setupPartnerChannels,
  openModal,
  updateModal,
};

