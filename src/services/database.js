const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Partner operations
const partners = {
  async create(data) {
    return prisma.partner.create({ data });
  },

  async findBySlackId(slackUserId) {
    return prisma.partner.findUnique({
      where: { slackUserId },
    });
  },

  async findById(id) {
    return prisma.partner.findUnique({
      where: { id },
    });
  },

  async update(slackUserId, data) {
    return prisma.partner.update({
      where: { slackUserId },
      data,
    });
  },

  async updateById(id, data) {
    return prisma.partner.update({
      where: { id },
      data,
    });
  },

  async findByType(partnerType) {
    return prisma.partner.findMany({
      where: { partnerType },
    });
  },

  async findBySectors(sectors) {
    return prisma.partner.findMany({
      where: {
        sectors: {
          hasSome: sectors,
        },
      },
    });
  },

  async findAll() {
    return prisma.partner.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  async findRecentlyJoined(days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return prisma.partner.findMany({
      where: {
        createdAt: { gte: since },
        onboardingComplete: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async countByType() {
    const counts = await prisma.partner.groupBy({
      by: ['partnerType'],
      _count: true,
    });
    return counts.reduce((acc, item) => {
      acc[item.partnerType] = item._count;
      return acc;
    }, {});
  },

  async markOnboardingComplete(slackUserId) {
    return prisma.partner.update({
      where: { slackUserId },
      data: { onboardingComplete: true },
    });
  },
};

// Onboarding conversation operations
const conversations = {
  async create(slackUserId) {
    return prisma.onboardingConversation.create({
      data: {
        slackUserId,
        messages: [],
        status: 'IN_PROGRESS',
      },
    });
  },

  async findActive(slackUserId) {
    return prisma.onboardingConversation.findFirst({
      where: {
        slackUserId,
        status: 'IN_PROGRESS',
      },
      orderBy: { startedAt: 'desc' },
    });
  },

  async findById(id) {
    return prisma.onboardingConversation.findUnique({
      where: { id },
    });
  },

  async update(id, data) {
    return prisma.onboardingConversation.update({
      where: { id },
      data,
    });
  },

  async addMessage(id, role, content) {
    const conversation = await prisma.onboardingConversation.findUnique({
      where: { id },
    });
    
    const messages = conversation.messages || [];
    messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    return prisma.onboardingConversation.update({
      where: { id },
      data: { messages },
    });
  },

  async complete(id, partnerId, extractedData) {
    return prisma.onboardingConversation.update({
      where: { id },
      data: {
        partnerId,
        extractedData,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
  },

  async abandon(id) {
    return prisma.onboardingConversation.update({
      where: { id },
      data: {
        status: 'ABANDONED',
        completedAt: new Date(),
      },
    });
  },
};

// Event operations
const events = {
  async create(data) {
    return prisma.event.create({ data });
  },

  async findById(id) {
    return prisma.event.findUnique({
      where: { id },
      include: { outreachMessages: true },
    });
  },

  async findUpcoming(days = 30) {
    const now = new Date();
    const until = new Date();
    until.setDate(until.getDate() + days);
    
    return prisma.event.findMany({
      where: {
        dateTime: {
          gte: now,
          lte: until,
        },
      },
      orderBy: { dateTime: 'asc' },
    });
  },

  async findRecent(days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    return prisma.event.findMany({
      where: {
        dateTime: {
          gte: since,
          lte: new Date(),
        },
      },
      orderBy: { dateTime: 'desc' },
    });
  },
};

// Outreach message operations
const outreach = {
  async create(data) {
    return prisma.outreachMessage.create({
      data,
      include: { partner: true, event: true },
    });
  },

  async findById(id) {
    return prisma.outreachMessage.findUnique({
      where: { id },
      include: { partner: true, event: true },
    });
  },

  async findPending() {
    return prisma.outreachMessage.findMany({
      where: { status: 'PENDING' },
      include: { partner: true, event: true },
      orderBy: { createdAt: 'asc' },
    });
  },

  async findByEvent(eventId) {
    return prisma.outreachMessage.findMany({
      where: { eventId },
      include: { partner: true },
    });
  },

  async updateStatus(id, status, approvedBy = null) {
    const data = { status };
    if (approvedBy) {
      data.approvedBy = approvedBy;
      data.approvedAt = new Date();
    }
    if (status === 'SENT') {
      data.sentAt = new Date();
    }
    
    return prisma.outreachMessage.update({
      where: { id },
      data,
      include: { partner: true, event: true },
    });
  },

  async updateMessage(id, messageDraft) {
    return prisma.outreachMessage.update({
      where: { id },
      data: { messageDraft },
    });
  },

  async setSlackMessageTs(id, slackMessageTs) {
    return prisma.outreachMessage.update({
      where: { id },
      data: { slackMessageTs },
    });
  },
};

// Digest operations
const digests = {
  async create(periodStart, periodEnd) {
    return prisma.digest.create({
      data: {
        periodStart,
        periodEnd,
        content: {},
      },
    });
  },

  async findById(id) {
    return prisma.digest.findUnique({
      where: { id },
      include: { items: true },
    });
  },

  async findLatest() {
    return prisma.digest.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  },

  async findDraft() {
    return prisma.digest.findFirst({
      where: { status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  },

  async update(id, data) {
    return prisma.digest.update({
      where: { id },
      data,
    });
  },

  async addItem(digestId, itemType, content, createdBy) {
    return prisma.digestItem.create({
      data: {
        digestId,
        itemType,
        content,
        createdBy,
      },
    });
  },

  async markSent(id, sentToChannel, sentToDms) {
    return prisma.digest.update({
      where: { id },
      data: {
        status: 'SENT',
        sentToChannel,
        sentToDms,
        sentAt: new Date(),
      },
    });
  },
};

// Activity log operations
const activityLog = {
  async create(data) {
    return prisma.activityLog.create({ data });
  },

  async findRecent(limit = 100) {
    return prisma.activityLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  },
};

// Health check
async function healthCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ error: error.message }, 'Database health check failed');
    return false;
  }
}

// Graceful shutdown
async function disconnect() {
  await prisma.$disconnect();
}

module.exports = {
  prisma,
  partners,
  conversations,
  events,
  outreach,
  digests,
  activityLog,
  healthCheck,
  disconnect,
};

