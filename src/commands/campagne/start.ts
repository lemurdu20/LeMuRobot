import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { getCampaign, setCampaign } from '../../config';
import { logToChannel } from '../../utils/logger';
import { canBotManageCampaignRoles, canBotWriteToChannel } from '../../utils/roleUtils';
import { BUTTON_ID_RESUBSCRIBE } from '../../utils/constants';
import type { GuildCommandContext } from './index';

export async function handleStart(ctx: GuildCommandContext): Promise<void> {
  const { interaction, guildId, guild } = ctx;
  const existingCampaign = getCampaign(guildId);

  if (existingCampaign) {
    await interaction.reply({
      content: 'Une campagne est deja en cours. Utilisez `/campagne end` pour la terminer d\'abord.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const oldRole = interaction.options.getRole('ancien_role', true);
  const newRole = interaction.options.getRole('nouveau_role', true);
  const channelOption = interaction.options.getChannel('salon', true);
  const duration = interaction.options.getInteger('duree');

  // Verifier que le bot peut gerer les roles
  const roleCheck = await canBotManageCampaignRoles(guild, oldRole.id, newRole.id);
  if (!roleCheck.canManage) {
    await interaction.reply({
      content: 'Impossible de gérer ce rôle. Vérifiez que le bot a un rôle supérieur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verifier que le bot peut ecrire dans le salon
  const channelCheck = await canBotWriteToChannel(guild, channelOption.id);
  if (!channelCheck.canUse || !channelCheck.channel) {
    await interaction.reply({
      content: 'Impossible d\'envoyer dans ce salon. Vérifiez les permissions du bot.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = channelCheck.channel;

  // Creer l'embed et le bouton
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Reinscription - Nouvelle Saison')
    .setDescription(
      `Clique sur le bouton ci-dessous pour confirmer ta reinscription et obtenir le role **${newRole.name}** !\n\n` +
      `Tu passeras de **${oldRole.name}** a **${newRole.name}**.`
    )
    .setFooter({ text: 'Association sportive' });

  const button = new ButtonBuilder()
    .setCustomId(BUTTON_ID_RESUBSCRIBE)
    .setLabel('Je me reinscris')
    .setStyle(ButtonStyle.Success)
    .setEmoji('✅');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  // Envoyer le message
  const message = await channel.send({
    embeds: [embed],
    components: [row],
  });

  // Calculer la date de fin si duree specifiee
  let endsAt: string | undefined;
  let endTimestamp: number | undefined;
  if (duration) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + duration);
    endsAt = endDate.toISOString();
    endTimestamp = Math.floor(endDate.getTime() / 1000);
  }

  // Sauvegarder la campagne
  await setCampaign(guildId, {
    oldRoleId: oldRole.id,
    newRoleId: newRole.id,
    channelId: channel.id,
    messageId: message.id,
    startedAt: new Date().toISOString(),
    endsAt,
    resubscribedMembers: [],
  });

  let replyContent = `Campagne demarree dans <#${channel.id}> !\n` +
    `- Ancien role : <@&${oldRole.id}>\n` +
    `- Nouveau role : <@&${newRole.id}>\n`;

  if (endTimestamp) {
    replyContent += `- Fin automatique : <t:${endTimestamp}:R>`;
  } else {
    replyContent += '- Duree : manuelle (utilisez `/campagne end`)';
  }

  await interaction.reply({
    content: replyContent,
    flags: MessageFlags.Ephemeral,
  });

  await logToChannel(interaction.client, guildId,
    `Campagne de reinscription demarree par <@${interaction.user.id}>` +
    (duration ? ` (duree: ${duration} jours)` : ' (duree manuelle)')
  );
}
