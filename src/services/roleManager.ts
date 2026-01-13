import { ButtonInteraction, GuildMember, MessageFlags } from 'discord.js';
import { getCampaign, addResubscribedMember } from '../config';
import { logToChannel } from '../utils/logger';
import { canBotManageRole } from '../utils/roleUtils';
import { isGuildInteraction } from '../utils/helpers';
import { roleLogger as log } from '../utils/structuredLogger';

export async function handleResubscribeButton(interaction: ButtonInteraction): Promise<void> {
  // Guard: verifier que l'interaction est dans une guild
  if (!isGuildInteraction(interaction) || !interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: 'Cette action doit etre effectuee dans un serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  const guild = interaction.guild;
  const campaign = getCampaign(guildId);

  if (!campaign) {
    await interaction.reply({
      content: 'Aucune campagne de reinscription en cours.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verifier que member est bien un GuildMember (pas APIInteractionGuildMember)
  if (!interaction.member || !(interaction.member instanceof GuildMember)) {
    await interaction.reply({
      content: 'Impossible de te reconnaître. Clique à nouveau sur le bouton.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = interaction.member;

  // Verifier si deja reinscrit
  if (campaign.resubscribedMembers.includes(member.id)) {
    await interaction.reply({
      content: 'Tu es deja reinscrit(e) !',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verifier si le membre a l'ancien role
  if (!member.roles.cache.has(campaign.oldRoleId)) {
    if (member.roles.cache.has(campaign.newRoleId)) {
      await interaction.reply({
        content: 'Tu as deja le nouveau role !',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: 'Cette réinscription ne te concerne pas. Tu n\'as pas le rôle de la saison précédente.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Verifier que le bot peut gerer les roles
  const oldRoleCheck = await canBotManageRole(guild, campaign.oldRoleId);
  if (!oldRoleCheck.canManage) {
    await interaction.reply({
      content: 'Le bot n\'a pas les permissions nécessaires pour gérer les rôles. Un administrateur doit vérifier la configuration.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const newRoleCheck = await canBotManageRole(guild, campaign.newRoleId);
  if (!newRoleCheck.canManage) {
    await interaction.reply({
      content: 'Le bot n\'a pas les permissions nécessaires pour gérer les rôles. Un administrateur doit vérifier la configuration.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // IMPORTANT: Enregistrer la reinscription AVANT de modifier les roles
    // pour eviter les race conditions
    const added = await addResubscribedMember(guildId, member.id);

    if (!added) {
      // Deja reinscrit entre-temps (race condition evitee)
      await interaction.reply({
        content: 'Tu es deja reinscrit(e) !',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Ajouter le nouveau role EN PREMIER (ordre important)
    // Si ca echoue, le membre garde son ancien role
    await member.roles.add(campaign.newRoleId);

    // Puis retirer l'ancien role
    // Si ca echoue, le membre a les deux roles (pas grave, un admin peut corriger)
    try {
      await member.roles.remove(campaign.oldRoleId);
    } catch (removeError) {
      log.error('Erreur retrait ancien role (membre a les deux roles)', removeError, { guildId });
      // On continue quand meme, le nouveau role est attribue
    }

    await interaction.reply({
      content: 'Merci ! Ton role a ete mis a jour. Bienvenue dans la nouvelle saison !',
      flags: MessageFlags.Ephemeral,
    });

    await logToChannel(
      interaction.client,
      guildId,
      `<@${member.id}> s'est reinscrit(e)`
    );
  } catch (error) {
    log.error('Erreur switch role', error, { guildId });
    await interaction.reply({
      content: 'Le changement de rôle n\'a pas pu être effectué. Contacte un administrateur pour qu\'il vérifie les permissions du bot.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
