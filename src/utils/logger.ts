import { Client, EmbedBuilder } from 'discord.js';
import { getGuildConfig } from '../config';
import { canBotWriteToChannel } from './roleUtils';

export async function logToChannel(
  client: Client,
  guildId: string,
  message: string
): Promise<void> {
  const config = getGuildConfig(guildId);

  if (!config.logChannelId) {
    console.log(`[LOG] ${message}`);
    return;
  }

  try {
    const guild = await client.guilds.fetch(guildId);

    // Utiliser la fonction securisee pour verifier et obtenir le canal
    const channelCheck = await canBotWriteToChannel(guild, config.logChannelId);
    if (!channelCheck.canUse || !channelCheck.channel) {
      console.log(`[LOG] ${message}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setDescription(message)
      .setTimestamp();

    await channelCheck.channel.send({ embeds: [embed] });
  } catch (error) {
    // Log sans stack trace sensible
    console.error('[LOGGER] Erreur envoi log:', error instanceof Error ? error.message : 'Erreur inconnue');
    console.log(`[LOG] ${message}`);
  }
}
