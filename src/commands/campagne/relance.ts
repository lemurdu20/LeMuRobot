import { MessageFlags } from 'discord.js';
import {
  getCampaign,
  getLastRelanceAt,
  setLastRelanceAt,
  RELANCE_COOLDOWN_MS,
} from '../../config';
import { logToChannel } from '../../utils/logger';
import { canBotWriteToChannel } from '../../utils/roleUtils';
import {
  DISCORD_MESSAGE_LIMIT,
  DISCORD_MENTION_LENGTH,
  RELANCE_MAX_MENTIONS_PER_MESSAGE,
  RELANCE_DELAY_BETWEEN_MESSAGES_MS,
} from '../../utils/constants';
import type { GuildCommandContext } from './index';

export async function handleRelance(ctx: GuildCommandContext): Promise<void> {
  const { interaction, guildId, guild } = ctx;
  const campaign = getCampaign(guildId);

  if (!campaign) {
    await interaction.reply({
      content: 'Aucune campagne en cours.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verifier le cooldown
  const lastRelance = getLastRelanceAt(guildId);
  if (lastRelance) {
    const elapsed = Date.now() - lastRelance.getTime();
    if (elapsed < RELANCE_COOLDOWN_MS) {
      const remaining = Math.ceil((RELANCE_COOLDOWN_MS - elapsed) / 60000);
      await interaction.reply({
        content: `Vous devez attendre encore ${remaining} minute(s) avant de relancer.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  // Verifier que le bot peut toujours ecrire dans le salon
  const channelCheck = await canBotWriteToChannel(guild, campaign.channelId);
  if (!channelCheck.canUse || !channelCheck.channel) {
    await interaction.reply({
      content: 'Impossible d\'envoyer dans ce salon. Vérifiez les permissions du bot.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = channelCheck.channel;
  const customMessage = interaction.options.getString('message');

  // Note: fetch necessaire car role.members ne retourne que les membres en cache
  await guild.members.fetch();

  const oldRole = await guild.roles.fetch(campaign.oldRoleId);
  if (!oldRole) {
    await interaction.reply({ content: 'Le rôle de la campagne n\'existe plus. Recréez la campagne.', flags: MessageFlags.Ephemeral });
    return;
  }

  const notYetResubscribed = oldRole.members.filter(
    m => !campaign.resubscribedMembers.includes(m.id)
  );

  if (notYetResubscribed.size === 0) {
    await interaction.reply({
      content: 'Tous les membres se sont deja reinscrits !',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const baseMessage = customMessage || 'N\'oubliez pas de confirmer votre reinscription !';

  // Calculer combien de mentions on peut mettre par message
  const overhead = 4 + baseMessage.length; // "\n\n" + message
  const maxMentionsPerMessage = Math.floor((DISCORD_MESSAGE_LIMIT - overhead) / DISCORD_MENTION_LENGTH);
  const chunkSize = Math.min(maxMentionsPerMessage, RELANCE_MAX_MENTIONS_PER_MESSAGE);

  const mentions = notYetResubscribed.map(m => `<@${m.id}>`);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let messagesSent = 0;
  for (let i = 0; i < mentions.length; i += chunkSize) {
    const chunk = mentions.slice(i, i + chunkSize);
    await channel.send(`${chunk.join(' ')}\n\n${baseMessage}`);
    messagesSent++;

    // Petit delai entre les messages pour eviter le rate limit
    if (i + chunkSize < mentions.length) {
      await new Promise(resolve => setTimeout(resolve, RELANCE_DELAY_BETWEEN_MESSAGES_MS));
    }
  }

  // Enregistrer le timestamp de la relance
  await setLastRelanceAt(guildId);

  await interaction.editReply(
    `Relance envoyee a ${notYetResubscribed.size} membres dans <#${campaign.channelId}> (${messagesSent} message(s))`
  );

  await logToChannel(interaction.client, guildId,
    `Relance envoyee par <@${interaction.user.id}> a ${notYetResubscribed.size} membres`
  );
}
