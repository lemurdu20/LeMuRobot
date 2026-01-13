import { Client } from 'discord.js';
import { getCampaign, setCampaign, getAllGuildsWithCampaigns } from '../config';
import { logToChannel } from '../utils/logger';
import { canBotWriteToChannel } from '../utils/roleUtils';
import { SCHEDULER_CHECK_INTERVAL_MS } from '../utils/constants';
import { schedulerLogger as log } from '../utils/structuredLogger';

let intervalId: NodeJS.Timeout | null = null;

export function startScheduler(client: Client): void {
  if (intervalId) {
    clearInterval(intervalId);
  }

  log.info('Demarre');

  // Verifier immediatement au demarrage
  checkExpiredCampaigns(client);

  // Puis verifier periodiquement
  intervalId = setInterval(() => {
    checkExpiredCampaigns(client);
  }, SCHEDULER_CHECK_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    log.info('Arrete');
  }
}

async function checkExpiredCampaigns(client: Client): Promise<void> {
  // Recuperer tous les guilds avec une campagne active
  const guildIds = getAllGuildsWithCampaigns();

  for (const guildId of guildIds) {
    const campaign = getCampaign(guildId);

    if (!campaign || !campaign.endsAt) {
      continue;
    }

    const endDate = new Date(campaign.endsAt);
    const now = new Date();

    if (now >= endDate) {
      log.info('Campagne expiree, traitement en cours...', { guildId });
      await handleExpiredCampaign(client, guildId);
    }
  }
}

async function handleExpiredCampaign(client: Client, guildId: string): Promise<void> {
  const campaign = getCampaign(guildId);
  if (!campaign) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    const oldRole = await guild.roles.fetch(campaign.oldRoleId);

    if (!oldRole) {
      log.error('Ancien role introuvable pour la campagne expiree', undefined, { guildId });
      await setCampaign(guildId, undefined);
      return;
    }

    // Recuperer les membres avec l'ancien role qui n'ont pas clique
    // Note: fetch necessaire car role.members ne retourne que les membres en cache
    await guild.members.fetch();
    const membersToProcess = oldRole.members.filter(
      member => !campaign.resubscribedMembers.includes(member.id)
    );

    let processed = 0;
    let errors = 0;

    // Par defaut, on retire juste le role (pas de kick automatique)
    for (const [, member] of membersToProcess) {
      try {
        await member.roles.remove(campaign.oldRoleId);
        processed++;
      } catch (error) {
        log.error('Erreur retrait role', error);
        errors++;
      }
    }

    // Supprimer le message de campagne
    const channelCheck = await canBotWriteToChannel(guild, campaign.channelId);
    if (channelCheck.canUse && channelCheck.channel) {
      try {
        const message = await channelCheck.channel.messages.fetch(campaign.messageId).catch(() => null);
        if (message) {
          await message.delete();
        }
      } catch (error) {
        log.error('Erreur suppression message', error);
      }
    }

    // Log
    await logToChannel(
      client,
      guildId,
      `Campagne terminee automatiquement (delai expire)\n` +
      `- ${campaign.resubscribedMembers.length} membres reinscrits\n` +
      `- ${processed} membres ont perdu leur role\n` +
      (errors > 0 ? `- ${errors} erreurs` : '')
    );

    // Terminer la campagne
    await setCampaign(guildId, undefined);

    log.info('Campagne terminee', {
      guildId,
      reinscrits: campaign.resubscribedMembers.length,
      retires: processed,
      erreurs: errors,
    });
  } catch (error) {
    log.error('Erreur traitement campagne', error, { guildId });
  }
}
