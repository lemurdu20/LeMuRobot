import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  Guild,
  MessageFlags,
} from 'discord.js';
import {
  CAMPAIGN_MAX_DURATION_DAYS,
  CAMPAIGN_CUSTOM_MESSAGE_MAX_LENGTH,
} from '../../utils/constants';
import { handleStart } from './start';
import { handleEnd } from './end';
import { handleStatus } from './status';
import { handleRelance } from './relance';

// Type pour les interactions validees dans une guild
export interface GuildCommandContext {
  interaction: ChatInputCommandInteraction;
  guildId: string;
  guild: Guild;
}

export const campagneCommand = {
  data: new SlashCommandBuilder()
    .setName('campagne')
    .setDescription('Gerer les campagnes de reinscription')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Demarrer une nouvelle campagne de reinscription')
        .addRoleOption(option =>
          option
            .setName('ancien_role')
            .setDescription('Le role actuel des membres')
            .setRequired(true)
        )
        .addRoleOption(option =>
          option
            .setName('nouveau_role')
            .setDescription('Le nouveau role a attribuer')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option
            .setName('salon')
            .setDescription('Le salon ou poster le bouton')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('duree')
            .setDescription('Duree en jours (optionnel)')
            .setMinValue(1)
            .setMaxValue(CAMPAIGN_MAX_DURATION_DAYS)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('end')
        .setDescription('Terminer la campagne et traiter les non-reinscrits')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Action a effectuer sur les non-reinscrits')
            .setRequired(true)
            .addChoices(
              { name: 'Retirer le role uniquement', value: 'retirer_role' },
              { name: 'Expulser du serveur', value: 'kick' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Voir le statut de la campagne en cours')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('relance')
        .setDescription('Mentionner les membres qui n\'ont pas encore clique')
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription(`Message personnalise (optionnel, max ${CAMPAIGN_CUSTOM_MESSAGE_MAX_LENGTH} caracteres)`)
            .setMaxLength(CAMPAIGN_CUSTOM_MESSAGE_MAX_LENGTH)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Guard: verifier que l'interaction est dans une guild
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: 'Cette commande doit etre utilisee dans un serveur.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Context valide avec types garantis
    const ctx: GuildCommandContext = {
      interaction,
      guildId: interaction.guildId,
      guild: interaction.guild,
    };

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'start':
        await handleStart(ctx);
        break;
      case 'end':
        await handleEnd(ctx);
        break;
      case 'status':
        await handleStatus(ctx);
        break;
      case 'relance':
        await handleRelance(ctx);
        break;
    }
  },
};
