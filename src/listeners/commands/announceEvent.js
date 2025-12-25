const config = require('../../config');
const db = require('../../services/database');
const openaiService = require('../../services/openai');
const slackService = require('../../services/slack');
const { getEventTypeOptions } = require('../../prompts/eventOutreach');
const { buildOutreachApprovalBlocks, buildBatchSummaryBlocks } = require('../../templates/adminApproval');
const { logger, logToSlack, logActivity } = require('../../utils/logger');
const { isAdmin } = require('../../utils/validators');

/**
 * Register /partnerbot announce-event command
 */
function registerAnnounceEventCommand(app) {
  // Handle the command
  app.command('/partnerbot', async ({ command, ack, client }) => {
    const args = command.text.trim().toLowerCase();
    
    if (args !== 'announce-event') {
      return; // Let other handlers process
    }

    await ack();

    const userId = command.user_id;

    if (!isAdmin(userId)) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: userId,
        text: '⚠️ This command is only available to admins.',
      });
      return;
    }

    // Open the event modal
    try {
      await slackService.openModal(client, command.trigger_id, buildEventModal());
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to open event modal');
    }
  });

  // Handle modal submission
  app.view('event_announcement_modal', async ({ ack, body, view, client }) => {
    await ack();

    const userId = body.user.id;
    const values = view.state.values;

    try {
      // Extract form values
      const eventData = {
        name: values.event_name.event_name_input.value,
        eventType: values.event_type.event_type_select.selected_option.value,
        dateTime: new Date(values.event_date.event_date_input.selected_date_time * 1000),
        location: values.event_location.event_location_input.value,
        description: values.event_description.event_description_input.value,
        rsvpLink: values.rsvp_link.rsvp_link_input.value || null,
        targetPartnerTypes: values.target_partners.target_partners_select.selected_options?.map(o => o.value) || [],
        targetSectors: [], // Could add sector selection
        createdBy: userId,
      };

      // Create event in database
      const event = await db.events.create(eventData);

      // Get target partners
      let partners = [];
      if (eventData.targetPartnerTypes.includes('all') || eventData.targetPartnerTypes.length === 0) {
        partners = await db.partners.findAll();
      } else {
        for (const type of eventData.targetPartnerTypes) {
          const typePartners = await db.partners.findByType(type);
          partners.push(...typePartners);
        }
      }

      // Filter to only onboarded partners
      partners = partners.filter(p => p.onboardingComplete);

      if (partners.length === 0) {
        await client.chat.postMessage({
          channel: userId,
          text: '⚠️ No partners found matching your criteria. Make sure partners have completed onboarding.',
        });
        return;
      }

      // Notify admin that generation is starting
      await client.chat.postMessage({
        channel: userId,
        text: `🔄 Generating personalized messages for ${partners.length} partners. This may take a few minutes...`,
      });

      // Generate personalized messages for each partner
      const outreachMessages = [];
      for (const partner of partners) {
        try {
          const personalizedMessage = await openaiService.generateEventOutreach(partner, eventData);
          
          const outreach = await db.outreach.create({
            eventId: event.id,
            partnerId: partner.id,
            messageDraft: personalizedMessage,
            personalizationContext: {
              sectors: partner.sectors,
              partnerType: partner.partnerType,
            },
          });
          
          outreachMessages.push(outreach);

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          logger.error({ error: error.message, partnerId: partner.id }, 'Failed to generate outreach');
        }
      }

      // Count by partner type
      const counts = partners.reduce((acc, p) => {
        acc[p.partnerType] = (acc[p.partnerType] || 0) + 1;
        return acc;
      }, {});

      // Post batch summary to #bot-admin
      if (config.channels.botAdmin) {
        await slackService.postToChannel(
          client,
          config.channels.botAdmin,
          buildBatchSummaryBlocks(event, counts, event.id),
          `Event outreach batch: ${event.name}`
        );

        // Post individual approval cards
        for (const outreach of outreachMessages) {
          const fullOutreach = await db.outreach.findById(outreach.id);
          await slackService.postToChannel(
            client,
            config.channels.botAdmin,
            buildOutreachApprovalBlocks(fullOutreach),
            `Outreach draft for ${fullOutreach.partner.name}`
          );
          
          // Small delay between posts
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      await client.chat.postMessage({
        channel: userId,
        text: `✅ Generated ${outreachMessages.length} personalized messages! Review and approve them in <#${config.channels.botAdmin}>.`,
      });

      await logActivity(db.prisma, 'event_outreach_created', userId, 'event', event.id, {
        partnerCount: partners.length,
        messageCount: outreachMessages.length,
      });

      await logToSlack('success', `Event outreach batch created`, {
        event: event.name,
        partners: partners.length,
        messages: outreachMessages.length,
        createdBy: `<@${userId}>`,
      });

      logger.info({ eventId: event.id, messageCount: outreachMessages.length }, 'Event outreach created');
    } catch (error) {
      logger.error({ error: error.message }, 'Error processing event announcement');
      await client.chat.postMessage({
        channel: userId,
        text: `❌ Error creating event outreach: ${error.message}`,
      });
    }
  });
}

/**
 * Build event announcement modal
 */
function buildEventModal() {
  return {
    type: 'modal',
    callback_id: 'event_announcement_modal',
    title: {
      type: 'plain_text',
      text: '📅 New Event Announcement',
    },
    submit: {
      type: 'plain_text',
      text: 'Generate Outreach',
    },
    close: {
      type: 'plain_text',
      text: 'Cancel',
    },
    blocks: [
      {
        type: 'input',
        block_id: 'event_name',
        label: {
          type: 'plain_text',
          text: 'Event Name',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'event_name_input',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., Fintech Pitch Night',
          },
        },
      },
      {
        type: 'input',
        block_id: 'event_type',
        label: {
          type: 'plain_text',
          text: 'Event Type',
        },
        element: {
          type: 'static_select',
          action_id: 'event_type_select',
          options: getEventTypeOptions(),
        },
      },
      {
        type: 'input',
        block_id: 'event_date',
        label: {
          type: 'plain_text',
          text: 'Date & Time',
        },
        element: {
          type: 'datetimepicker',
          action_id: 'event_date_input',
        },
      },
      {
        type: 'input',
        block_id: 'event_location',
        label: {
          type: 'plain_text',
          text: 'Location / Meeting Link',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'event_location_input',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., Zoom link or venue address',
          },
        },
      },
      {
        type: 'input',
        block_id: 'event_description',
        label: {
          type: 'plain_text',
          text: 'Description',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'event_description_input',
          multiline: true,
          placeholder: {
            type: 'plain_text',
            text: 'Brief description of the event...',
          },
        },
      },
      {
        type: 'input',
        block_id: 'target_partners',
        label: {
          type: 'plain_text',
          text: 'Target Partners',
        },
        element: {
          type: 'multi_static_select',
          action_id: 'target_partners_select',
          options: [
            { text: { type: 'plain_text', text: 'All Partners' }, value: 'all' },
            { text: { type: 'plain_text', text: 'VCs Only' }, value: 'VC' },
            { text: { type: 'plain_text', text: 'Corporates Only' }, value: 'CORPORATE' },
            { text: { type: 'plain_text', text: 'Community Builders Only' }, value: 'COMMUNITY_BUILDER' },
            { text: { type: 'plain_text', text: 'Angels Only' }, value: 'ANGEL' },
          ],
        },
      },
      {
        type: 'input',
        block_id: 'rsvp_link',
        optional: true,
        label: {
          type: 'plain_text',
          text: 'RSVP Link (optional)',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'rsvp_link_input',
          placeholder: {
            type: 'plain_text',
            text: 'https://...',
          },
        },
      },
    ],
  };
}

module.exports = {
  registerAnnounceEventCommand,
};

