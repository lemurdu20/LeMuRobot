import { MessageFlags } from 'discord.js';
import { getCampaign, setCampaign } from '../../config';
import { logToChannel } from '../../utils/logger';
import { canBotWriteToChannel } from '../../utils/roleUtils';
import { campaignLogger as log } from '../../utils/structuredLogger';
import type { GuildCommandContext } from './index';

export async function handleEnd(ctx: GuildCommandContext): Promise<void> {
  const { interaction, guildId, guild } = ctx;
  const campaign = getCampaign(guildId);

  if (!campaign) {
    await interaction.reply({
      content: 'Aucune campagne en cours.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const action = interaction.options.getString('action', true);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const oldRole = await guild.roles.fetch(campaign.oldRoleId);

  if (!oldRole) {
    await interaction.editReply('Erreur : ancien role introuvable.');
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

  for (const [, member] of membersToProcess) {
    try {
      if (action === 'kick') {
        await member.kick('Non reinscrit - fin de campagne');
      } else {
        await member.roles.remove(campaign.oldRoleId);
      }
      processed++;
    } catch (error) {
      log.error('Erreur traitement membre', error, { guildId });
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
      log.error('Erreur suppression message', error, { guildId });
    }
  }

  // Terminer la campagne
  await setCampaign(guildId, undefined);

  const actionText = action === 'kick' ? 'expulses' : 'ont perdu leur role';
  await interaction.editReply(
    `Campagne terminee !\n` +
    `- ${campaign.resubscribedMembers.length} membres reinscrits\n` +
    `- ${processed} membres ${actionText}\n` +
    (errors > 0 ? `- ${errors} erreurs` : '')
  );

  await logToChannel(interaction.client, guildId,
    `Campagne terminee par <@${interaction.user.id}> - ` +
    `${campaign.resubscribedMembers.length} reinscrits, ${processed} ${actionText}`
  );
}
