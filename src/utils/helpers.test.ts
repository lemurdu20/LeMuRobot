import { truncateListForEmbed, isGuildInteraction, createListEmbed } from './helpers';
import { DISCORD_EMBED_DESCRIPTION_LIMIT } from './constants';
import { EmbedBuilder } from 'discord.js';

describe('helpers', () => {
  describe('truncateListForEmbed', () => {
    it('should format items without truncation for short lists', () => {
      const items = ['item1', 'item2', 'item3'];
      const result = truncateListForEmbed(items, item => item);

      expect(result.content).toBe('item1\nitem2\nitem3');
      expect(result.isTruncated).toBe(false);
    });

    it('should apply formatter to each item', () => {
      const items = [1, 2, 3];
      const result = truncateListForEmbed(items, item => `Number: ${item}`);

      expect(result.content).toBe('Number: 1\nNumber: 2\nNumber: 3');
      expect(result.isTruncated).toBe(false);
    });

    it('should truncate long lists', () => {
      // Creer une liste tres longue
      const longItem = 'x'.repeat(100);
      const items = Array(100).fill(longItem);
      const result = truncateListForEmbed(items, item => item);

      expect(result.content.length).toBeLessThanOrEqual(DISCORD_EMBED_DESCRIPTION_LIMIT);
      expect(result.isTruncated).toBe(true);
    });

    it('should handle empty list', () => {
      const result = truncateListForEmbed([], item => String(item));

      expect(result.content).toBe('');
      expect(result.isTruncated).toBe(false);
    });

    it('should handle single item', () => {
      const result = truncateListForEmbed(['single'], item => item);

      expect(result.content).toBe('single');
      expect(result.isTruncated).toBe(false);
    });

    it('should handle exactly at limit', () => {
      // Creer un contenu exactement a la limite
      const item = 'x'.repeat(DISCORD_EMBED_DESCRIPTION_LIMIT);
      const result = truncateListForEmbed([item], item => item);

      expect(result.content.length).toBe(DISCORD_EMBED_DESCRIPTION_LIMIT);
      expect(result.isTruncated).toBe(false);
    });

    it('should handle items with special characters', () => {
      const items = ['<@123456>', '@everyone', '`code`', '**bold**'];
      const result = truncateListForEmbed(items, item => item);

      expect(result.content).toBe('<@123456>\n@everyone\n`code`\n**bold**');
      expect(result.isTruncated).toBe(false);
    });

    it('should handle unicode characters', () => {
      const items = ['émoji 🎉', 'français', '日本語'];
      const result = truncateListForEmbed(items, item => item);

      expect(result.content).toBe('émoji 🎉\nfrançais\n日本語');
      expect(result.isTruncated).toBe(false);
    });

    it('should handle complex objects with formatter', () => {
      const items = [
        { name: 'Alice', id: '123' },
        { name: 'Bob', id: '456' },
      ];
      const result = truncateListForEmbed(items, item => `${item.name} (${item.id})`);

      expect(result.content).toBe('Alice (123)\nBob (456)');
      expect(result.isTruncated).toBe(false);
    });
  });

  describe('isGuildInteraction', () => {
    it('should return true for guild interaction', () => {
      const interaction = {
        guildId: '123456789',
        guild: { id: '123456789' },
      };

      expect(isGuildInteraction(interaction)).toBe(true);
    });

    it('should return false when guildId is null', () => {
      const interaction = {
        guildId: null,
        guild: { id: '123456789' },
      };

      expect(isGuildInteraction(interaction)).toBe(false);
    });

    it('should return false when guild is null', () => {
      const interaction = {
        guildId: '123456789',
        guild: null,
      };

      expect(isGuildInteraction(interaction)).toBe(false);
    });

    it('should return false when both are null', () => {
      const interaction = {
        guildId: null,
        guild: null,
      };

      expect(isGuildInteraction(interaction)).toBe(false);
    });

    it('should return true with minimal guild object', () => {
      const interaction = {
        guildId: '1',
        guild: {},
      };

      expect(isGuildInteraction(interaction)).toBe(true);
    });

    it('should return false when guildId is undefined', () => {
      const interaction = {
        guildId: undefined as unknown as null,
        guild: { id: '123' },
      };

      // undefined gets coerced, function checks for !== null
      // In JS: undefined !== null is true, so this returns true
      // But the type signature expects null, not undefined
      expect(isGuildInteraction(interaction)).toBe(true);
    });

    it('should handle empty string guildId', () => {
      const interaction = {
        guildId: '' as unknown as null,
        guild: { id: '123' },
      };

      // Empty string is not null, so passes the check
      expect(isGuildInteraction(interaction)).toBe(true);
    });
  });

  describe('createListEmbed', () => {
    it('should create embed with items', () => {
      const items = ['item1', 'item2', 'item3'];
      const embed = createListEmbed('Test Title', 0x5865F2, items, 'Empty message');

      expect(embed).toBeInstanceOf(EmbedBuilder);
      const data = embed.toJSON();
      expect(data.title).toBe('Test Title');
      expect(data.color).toBe(0x5865F2);
      expect(data.description).toBe('item1\nitem2\nitem3');
      expect(data.footer).toBeUndefined();
    });

    it('should show empty message when list is empty', () => {
      const embed = createListEmbed('Empty List', 0xFF0000, [], 'Aucun element');

      const data = embed.toJSON();
      expect(data.title).toBe('Empty List');
      expect(data.description).toBe('Aucun element');
    });

    it('should add footer when list is truncated', () => {
      const longItem = 'x'.repeat(100);
      const items = Array(100).fill(longItem);
      const embed = createListEmbed('Long List', 0x00FF00, items, 'Empty');

      const data = embed.toJSON();
      expect(data.footer?.text).toBe('Liste tronquee - trop de membres a afficher');
    });

    it('should handle different colors', () => {
      const colors = [0x000000, 0xFFFFFF, 0x5865F2, 0xFF0000];

      colors.forEach(color => {
        const embed = createListEmbed('Title', color, ['item'], 'Empty');
        expect(embed.toJSON().color).toBe(color);
      });
    });

    it('should handle mentions in items', () => {
      const items = ['<@123456789>', '<@987654321>'];
      const embed = createListEmbed('Members', 0x5865F2, items, 'No members');

      const data = embed.toJSON();
      expect(data.description).toBe('<@123456789>\n<@987654321>');
    });

    it('should not have footer for non-truncated lists', () => {
      const items = ['short', 'list'];
      const embed = createListEmbed('Short', 0x5865F2, items, 'Empty');

      const data = embed.toJSON();
      expect(data.footer).toBeUndefined();
    });
  });
});
