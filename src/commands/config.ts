import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { setGuildConfig } from '../config';
import { isGuildInteraction } from '../utils/helpers';

export const configCommand = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurer le bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('logs')
        .setDescription('Definir le salon de logs')
        .addChannelOption(option =>
          option
            .setName('salon')
            .setDescription('Le salon ou envoyer les logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Guard: verifier que l'interaction est dans une guild
    if (!isGuildInteraction(interaction) || !interaction.guildId) {
      await interaction.reply({
        content: 'Cette commande doit etre utilisee dans un serveur.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'logs') {
      const channel = interaction.options.getChannel('salon', true);

      await setGuildConfig(guildId, { logChannelId: channel.id });

      await interaction.reply({
        content: `Salon de logs configure : <#${channel.id}>`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
