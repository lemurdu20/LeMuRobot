/**
 * Tests pour interactionCreate.ts
 * Gestionnaire d'interactions Discord
 */

import { MessageFlags } from 'discord.js';

// Set env BEFORE any imports
process.env.DISCORD_TOKEN = 'test-token';
process.env.GUILD_ID = 'test-guild-id';
process.env.CLIENT_ID = 'test-client-id';

// Mock roleManager
jest.mock('../services/roleManager', () => ({
  handleResubscribeButton: jest.fn(),
}));

// Mock config
jest.mock('../config', () => ({
  getCampaign: jest.fn(),
}));

// Mock rateLimiter
jest.mock('../utils/rateLimiter', () => ({
  checkRateLimit: jest.fn(),
}));

// Mock helpers
jest.mock('../utils/helpers', () => ({
  isGuildInteraction: jest.fn(),
  createListEmbed: jest.fn(),
}));

import { handleInteractionCreate } from './interactionCreate';
import { handleResubscribeButton } from '../services/roleManager';
import { getCampaign } from '../config';
import { checkRateLimit } from '../utils/rateLimiter';
import { isGuildInteraction, createListEmbed } from '../utils/helpers';

const mockHandleResubscribeButton = handleResubscribeButton as jest.Mock;
const mockGetCampaign = getCampaign as jest.Mock;
const mockCheckRateLimit = checkRateLimit as jest.Mock;
const mockIsGuildInteraction = isGuildInteraction as jest.Mock;
const mockCreateListEmbed = createListEmbed as jest.Mock;

// Helper pour creer une interaction command mock
function createMockCommandInteraction(overrides: Record<string, unknown> = {}) {
  const mockCommand = {
    execute: jest.fn().mockResolvedValue(undefined),
  };

  return {
    isChatInputCommand: () => true,
    isButton: () => false,
    commandName: 'test-command',
    user: { id: 'user-123' },
    client: {
      commands: new Map([['test-command', mockCommand]]),
    },
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
    ...overrides,
  };
}

// Helper pour creer une interaction bouton mock
function createMockButtonInteraction(overrides: Record<string, unknown> = {}) {
  return {
    isChatInputCommand: () => false,
    isButton: () => true,
    customId: 'resubscribe',
    user: { id: 'user-123' },
    guildId: 'guild-123',
    guild: {
      id: 'guild-123',
      roles: {
        fetch: jest.fn(),
      },
      members: {
        fetch: jest.fn().mockResolvedValue(new Map()),
      },
    },
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
    ...overrides,
  };
}

describe('interactionCreate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockIsGuildInteraction.mockReturnValue(true);
    mockHandleResubscribeButton.mockResolvedValue(undefined);
  });

  describe('handleInteractionCreate - Commands', () => {
    it('should handle slash commands', async () => {
      const mockCommand = { execute: jest.fn().mockResolvedValue(undefined) };
      const interaction = createMockCommandInteraction();
      interaction.client.commands = new Map([['test-command', mockCommand]]);

      await handleInteractionCreate(interaction as never);

      expect(mockCommand.execute).toHaveBeenCalledWith(interaction);
    });

    it('should reject rate-limited command interactions', async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfter: 5 });
      const interaction = createMockCommandInteraction();

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('5 seconde'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should handle unknown command', async () => {
      const interaction = createMockCommandInteraction();
      interaction.client.commands = new Map(); // No commands
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('n\'existe pas'),
        flags: MessageFlags.Ephemeral,
      });
      consoleSpy.mockRestore();
    });

    it('should handle command execution error', async () => {
      const mockCommand = {
        execute: jest.fn().mockRejectedValue(new Error('Command failed')),
      };
      const interaction = createMockCommandInteraction();
      interaction.client.commands = new Map([['test-command', mockCommand]]);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('pas pu être exécutée'),
        flags: MessageFlags.Ephemeral,
      });
      consoleSpy.mockRestore();
    });

    it('should use followUp if already replied', async () => {
      const mockCommand = {
        execute: jest.fn().mockRejectedValue(new Error('Command failed')),
      };
      const interaction = createMockCommandInteraction({ replied: true });
      interaction.client.commands = new Map([['test-command', mockCommand]]);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleInteractionCreate(interaction as never);

      expect(interaction.followUp).toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should use followUp if deferred', async () => {
      const mockCommand = {
        execute: jest.fn().mockRejectedValue(new Error('Command failed')),
      };
      const interaction = createMockCommandInteraction({ deferred: true });
      interaction.client.commands = new Map([['test-command', mockCommand]]);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleInteractionCreate(interaction as never);

      expect(interaction.followUp).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('handleInteractionCreate - Buttons', () => {
    it('should handle resubscribe button', async () => {
      const interaction = createMockButtonInteraction({ customId: 'resubscribe' });

      await handleInteractionCreate(interaction as never);

      expect(mockHandleResubscribeButton).toHaveBeenCalledWith(interaction);
    });

    it('should reject rate-limited button interactions', async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfter: 3 });
      const interaction = createMockButtonInteraction();

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('3 seconde'),
        flags: MessageFlags.Ephemeral,
      });
      expect(mockHandleResubscribeButton).not.toHaveBeenCalled();
    });

    it('should handle status_resubscribed button', async () => {
      mockGetCampaign.mockReturnValue({
        resubscribedMembers: ['member-1', 'member-2'],
      });
      mockCreateListEmbed.mockReturnValue({ toJSON: () => ({}) });
      const interaction = createMockButtonInteraction({ customId: 'status_resubscribed' });

      await handleInteractionCreate(interaction as never);

      expect(mockCreateListEmbed).toHaveBeenCalledWith(
        expect.stringContaining('reinscrits'),
        expect.any(Number),
        expect.arrayContaining(['<@member-1>', '<@member-2>']),
        expect.any(String)
      );
    });

    it('should handle status_resubscribed with no campaign', async () => {
      mockGetCampaign.mockReturnValue(undefined);
      const interaction = createMockButtonInteraction({ customId: 'status_resubscribed' });

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Aucune campagne'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should handle status_missing with no campaign', async () => {
      mockGetCampaign.mockReturnValue(undefined);
      const interaction = createMockButtonInteraction({ customId: 'status_missing' });

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Aucune campagne'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should handle status_missing when role no longer exists', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        resubscribedMembers: [],
      });
      const interaction = createMockButtonInteraction({ customId: 'status_missing' });
      interaction.guild.roles.fetch = jest.fn().mockResolvedValue(null);

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('n\'existe plus'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should handle unknown button', async () => {
      const interaction = createMockButtonInteraction({ customId: 'unknown_button' });

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('plus actif'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should handle button error', async () => {
      mockHandleResubscribeButton.mockRejectedValue(new Error('Button failed'));
      const interaction = createMockButtonInteraction({ customId: 'resubscribe' });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('non disponible'),
        flags: MessageFlags.Ephemeral,
      });
      consoleSpy.mockRestore();
    });

    it('should use followUp on button error if already replied', async () => {
      mockHandleResubscribeButton.mockRejectedValue(new Error('Button failed'));
      const interaction = createMockButtonInteraction({
        customId: 'resubscribe',
        replied: true,
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleInteractionCreate(interaction as never);

      expect(interaction.followUp).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should reject non-guild interaction for status buttons', async () => {
      mockIsGuildInteraction.mockReturnValue(false);
      const interaction = createMockButtonInteraction({
        customId: 'status_resubscribed',
        guildId: null,
      });

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('serveur'),
        flags: MessageFlags.Ephemeral,
      });
    });
  });

  describe('handleInteractionCreate - Other interactions', () => {
    it('should ignore non-command non-button interactions', async () => {
      const interaction = {
        isChatInputCommand: () => false,
        isButton: () => false,
        reply: jest.fn(),
      };

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).not.toHaveBeenCalled();
    });
  });

  describe('Rate limiting', () => {
    it('should check rate limit for commands', async () => {
      const mockCommand = { execute: jest.fn().mockResolvedValue(undefined) };
      const interaction = createMockCommandInteraction();
      interaction.client.commands = new Map([['test-command', mockCommand]]);

      await handleInteractionCreate(interaction as never);

      expect(mockCheckRateLimit).toHaveBeenCalledWith('user-123');
    });

    it('should check rate limit for buttons', async () => {
      const interaction = createMockButtonInteraction();

      await handleInteractionCreate(interaction as never);

      expect(mockCheckRateLimit).toHaveBeenCalledWith('user-123');
    });

    it('should show different message for button rate limit', async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfter: 2 });
      const interaction = createMockButtonInteraction();

      await handleInteractionCreate(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('déjà cliqué'),
        flags: MessageFlags.Ephemeral,
      });
    });
  });
});
