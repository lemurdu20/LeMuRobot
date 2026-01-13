import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { getCampaign } from '../../config';
import { BUTTON_ID_STATUS_RESUBSCRIBED, BUTTON_ID_STATUS_MISSING } from '../../utils/constants';
import type { GuildCommandContext } from './index';

export async function handleStatus(ctx: GuildCommandContext): Promise<void> {
  const { interaction, guildId, guild } = ctx;
  const campaign = getCampaign(guildId);

  if (!campaign) {
    await interaction.reply({
      content: 'Aucune campagne en cours.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
  const total = notYetResubscribed.size + campaign.resubscribedMembers.length;
  const resubscribed = campaign.resubscribedMembers.length;
  const percentage = total > 0 ? Math.round((resubscribed / total) * 100) : 0;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Statut de la campagne')
    .addFields(
      { name: 'Ancien role', value: `<@&${campaign.oldRoleId}>`, inline: true },
      { name: 'Nouveau role', value: `<@&${campaign.newRoleId}>`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: 'Reinscrits', value: `${resubscribed}/${total} (${percentage}%)`, inline: true },
      { name: 'En attente', value: `${notYetResubscribed.size} membres`, inline: true },
    );

  if (campaign.endsAt) {
    const endDate = new Date(campaign.endsAt);
    embed.addFields({
      name: 'Fin automatique',
      value: `<t:${Math.floor(endDate.getTime() / 1000)}:R>`,
      inline: true,
    });
  }

  const showResubscribed = new ButtonBuilder()
    .setCustomId(BUTTON_ID_STATUS_RESUBSCRIBED)
    .setLabel('Voir les reinscrits')
    .setStyle(ButtonStyle.Secondary);

  const showMissing = new ButtonBuilder()
    .setCustomId(BUTTON_ID_STATUS_MISSING)
    .setLabel('Voir les manquants')
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(showResubscribed, showMissing);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}
