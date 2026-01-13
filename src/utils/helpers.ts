import { EmbedBuilder } from 'discord.js';
import { DISCORD_EMBED_DESCRIPTION_LIMIT } from './constants';

/**
 * Tronque une liste pour un embed Discord
 * @param items Liste d'elements a afficher
 * @param formatter Fonction pour formater chaque element
 * @returns Object avec la liste formatee et un flag indiquant si tronquee
 */
export function truncateListForEmbed<T>(
  items: T[],
  formatter: (item: T) => string
): { content: string; isTruncated: boolean } {
  const list = items.map(formatter).join('\n');
  const isTruncated = list.length > DISCORD_EMBED_DESCRIPTION_LIMIT;
  const content = list.substring(0, DISCORD_EMBED_DESCRIPTION_LIMIT);

  return { content, isTruncated };
}

/**
 * Cree un embed avec une liste potentiellement tronquee
 */
export function createListEmbed(
  title: string,
  color: number,
  items: string[],
  emptyMessage: string
): EmbedBuilder {
  if (items.length === 0) {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(emptyMessage);
  }

  const { content, isTruncated } = truncateListForEmbed(items, item => item);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(content);

  if (isTruncated) {
    embed.setFooter({ text: 'Liste tronquee - trop de membres a afficher' });
  }

  return embed;
}

/**
 * Verifie qu'une interaction provient d'une guild
 * @returns true si l'interaction est dans une guild, false sinon
 */
export function isGuildInteraction(interaction: { guildId: string | null; guild: unknown | null }): boolean {
  return interaction.guildId !== null && interaction.guild !== null;
}
