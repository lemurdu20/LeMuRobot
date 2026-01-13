import { Interaction, ChatInputCommandInteraction, ButtonInteraction, MessageFlags } from 'discord.js';
import { handleResubscribeButton } from '../services/roleManager';
import { getCampaign } from '../config';
import { checkRateLimit } from '../utils/rateLimiter';
import { createListEmbed, isGuildInteraction } from '../utils/helpers';
import {
  BUTTON_ID_RESUBSCRIBE,
  BUTTON_ID_STATUS_RESUBSCRIBED,
  BUTTON_ID_STATUS_MISSING,
} from '../utils/constants';
import { interactionLogger as log } from '../utils/structuredLogger';

export async function handleInteractionCreate(interaction: Interaction): Promise<void> {
  // Gerer les commandes slash
  if (interaction.isChatInputCommand()) {
    // Verifier le rate limit
    const rateCheck = checkRateLimit(interaction.user.id);
    if (!rateCheck.allowed) {
      await interaction.reply({
        content: `Doucement ! Tu pourras réessayer dans ${rateCheck.retryAfter} seconde(s).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await handleCommand(interaction);
    return;
  }

  // Gerer les boutons
  if (interaction.isButton()) {
    // Rate limit aussi sur les boutons
    const rateCheck = checkRateLimit(interaction.user.id);
    if (!rateCheck.allowed) {
      await interaction.reply({
        content: `Tu as déjà cliqué ! Patiente ${rateCheck.retryAfter} seconde(s) avant de réessayer.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await handleButton(interaction);
    return;
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const client = interaction.client;
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    log.warn('Commande non trouvee', { commandName: interaction.commandName });
    await interaction.reply({
      content: 'Cette commande n\'existe pas ou n\'est plus disponible.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    log.error('Erreur commande', error, { commandName: interaction.commandName });
    const replyOptions = {
      content: 'Cette commande n\'a pas pu être exécutée. Réessaie ou contacte un administrateur.',
      flags: MessageFlags.Ephemeral,
    } as const;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyOptions);
    } else {
      await interaction.reply(replyOptions);
    }
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  try {
    if (interaction.customId === BUTTON_ID_RESUBSCRIBE) {
      await handleResubscribeButton(interaction);
      return;
    }

    if (interaction.customId === BUTTON_ID_STATUS_RESUBSCRIBED) {
      await showResubscribedList(interaction);
      return;
    }

    if (interaction.customId === BUTTON_ID_STATUS_MISSING) {
      await showMissingList(interaction);
      return;
    }

    // Bouton non reconnu
    await interaction.reply({
      content: 'Ce bouton n\'est plus actif.',
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    log.error('Erreur bouton', error, { buttonId: interaction.customId });
    const replyOptions = {
      content: 'Action non disponible pour le moment. Réessaie plus tard.',
      flags: MessageFlags.Ephemeral,
    } as const;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyOptions);
    } else {
      await interaction.reply(replyOptions);
    }
  }
}

async function showResubscribedList(interaction: ButtonInteraction): Promise<void> {
  if (!isGuildInteraction(interaction) || !interaction.guildId) {
    await interaction.reply({ content: 'Cette commande doit etre utilisee dans un serveur.', flags: MessageFlags.Ephemeral });
    return;
  }

  const guildId = interaction.guildId;
  const campaign = getCampaign(guildId);
  if (!campaign) {
    await interaction.reply({ content: 'Aucune campagne en cours.', flags: MessageFlags.Ephemeral });
    return;
  }

  const members = campaign.resubscribedMembers;
  const mentions = members.map(id => `<@${id}>`);

  const embed = createListEmbed(
    `Membres reinscrits (${members.length})`,
    0x57F287,
    mentions,
    'Aucun membre reinscrit pour le moment.'
  );

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function showMissingList(interaction: ButtonInteraction): Promise<void> {
  if (!isGuildInteraction(interaction) || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: 'Cette commande doit etre utilisee dans un serveur.', flags: MessageFlags.Ephemeral });
    return;
  }

  const guildId = interaction.guildId;
  const guild = interaction.guild;
  const campaign = getCampaign(guildId);
  if (!campaign) {
    await interaction.reply({ content: 'Aucune campagne en cours.', flags: MessageFlags.Ephemeral });
    return;
  }
  // Note: fetch necessaire car role.members ne retourne que les membres en cache
  await guild.members.fetch();

  const oldRole = await guild.roles.fetch(campaign.oldRoleId);
  if (!oldRole) {
    await interaction.reply({ content: 'Le rôle n\'existe plus. Un administrateur doit recréer la campagne.', flags: MessageFlags.Ephemeral });
    return;
  }

  const missing = oldRole.members.filter(m => !campaign.resubscribedMembers.includes(m.id));
  const mentions = missing.map(m => `<@${m.id}>`);

  const embed = createListEmbed(
    `Membres en attente (${missing.size})`,
    0xED4245,
    Array.from(mentions),
    'Tous les membres se sont reinscrits !'
  );

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
