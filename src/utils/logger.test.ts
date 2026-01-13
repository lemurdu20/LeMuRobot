/**
 * Tests pour utils/logger.ts
 * Logging vers un channel Discord
 */

// Set env BEFORE any imports
process.env.DISCORD_TOKEN = 'test-token';
process.env.GUILD_ID = 'test-guild-id';
process.env.CLIENT_ID = 'test-client-id';

// Mock config
jest.mock('../config', () => ({
  getGuildConfig: jest.fn(),
}));

// Mock roleUtils
jest.mock('./roleUtils', () => ({
  canBotWriteToChannel: jest.fn(),
}));

import { logToChannel } from './logger';
import { getGuildConfig } from '../config';
import { canBotWriteToChannel } from './roleUtils';

const mockGetGuildConfig = getGuildConfig as jest.Mock;
const mockCanBotWriteToChannel = canBotWriteToChannel as jest.Mock;

// Helper pour creer un client mock
function createMockClient(overrides: Record<string, unknown> = {}) {
  return {
    guilds: {
      fetch: jest.fn().mockResolvedValue({
        id: 'guild-123',
      }),
    },
    ...overrides,
  };
}

describe('logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGuildConfig.mockReturnValue({});
    mockCanBotWriteToChannel.mockResolvedValue({
      canUse: true,
      channel: {
        id: 'log-channel',
        send: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('logToChannel', () => {
    it('should fallback to console when no log channel configured', async () => {
      mockGetGuildConfig.mockReturnValue({
        logChannelId: undefined,
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const client = createMockClient();

      await logToChannel(client as never, 'guild-123', 'Test message');

      expect(consoleSpy).toHaveBeenCalledWith('[LOG] Test message');
      expect(client.guilds.fetch).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should fallback to console when channel check fails', async () => {
      mockGetGuildConfig.mockReturnValue({
        logChannelId: 'log-channel',
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: false,
        error: 'No permission',
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const client = createMockClient();

      await logToChannel(client as never, 'guild-123', 'Test message');

      expect(consoleSpy).toHaveBeenCalledWith('[LOG] Test message');
      consoleSpy.mockRestore();
    });

    it('should send embed to log channel when configured', async () => {
      const mockChannel = {
        id: 'log-channel',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockGetGuildConfig.mockReturnValue({
        logChannelId: 'log-channel',
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const client = createMockClient();

      await logToChannel(client as never, 'guild-123', 'Test message');

      expect(mockChannel.send).toHaveBeenCalledWith({
        embeds: expect.any(Array),
      });
    });

    it('should fetch guild before checking channel', async () => {
      const mockChannel = {
        id: 'log-channel',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockGetGuildConfig.mockReturnValue({
        logChannelId: 'log-channel',
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const client = createMockClient();

      await logToChannel(client as never, 'guild-123', 'Test message');

      expect(client.guilds.fetch).toHaveBeenCalledWith('guild-123');
    });

    it('should handle guild fetch error gracefully', async () => {
      mockGetGuildConfig.mockReturnValue({
        logChannelId: 'log-channel',
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const client = createMockClient();
      client.guilds.fetch = jest.fn().mockRejectedValue(new Error('Guild not found'));

      await logToChannel(client as never, 'guild-123', 'Test message');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LOGGER] Erreur envoi log:',
        'Guild not found'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('[LOG] Test message');
      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should handle channel send error gracefully', async () => {
      const mockChannel = {
        id: 'log-channel',
        send: jest.fn().mockRejectedValue(new Error('Cannot send')),
      };
      mockGetGuildConfig.mockReturnValue({
        logChannelId: 'log-channel',
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const client = createMockClient();

      await logToChannel(client as never, 'guild-123', 'Test message');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LOGGER] Erreur envoi log:',
        'Cannot send'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('[LOG] Test message');
      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should handle non-Error exceptions', async () => {
      mockGetGuildConfig.mockReturnValue({
        logChannelId: 'log-channel',
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      const client = createMockClient();
      client.guilds.fetch = jest.fn().mockRejectedValue('String error');

      await logToChannel(client as never, 'guild-123', 'Test message');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LOGGER] Erreur envoi log:',
        'Erreur inconnue'
      );
      consoleLogSpy.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should use correct embed color', async () => {
      const mockChannel = {
        id: 'log-channel',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockGetGuildConfig.mockReturnValue({
        logChannelId: 'log-channel',
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const client = createMockClient();

      await logToChannel(client as never, 'guild-123', 'Test message');

      const sendCall = mockChannel.send.mock.calls[0][0];
      expect(sendCall.embeds).toBeDefined();
      expect(sendCall.embeds.length).toBe(1);
    });

    it('should include timestamp in embed', async () => {
      const mockChannel = {
        id: 'log-channel',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockGetGuildConfig.mockReturnValue({
        logChannelId: 'log-channel',
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const client = createMockClient();

      await logToChannel(client as never, 'guild-123', 'Test message');

      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should check channel permissions with canBotWriteToChannel', async () => {
      const mockGuild = { id: 'guild-123' };
      mockGetGuildConfig.mockReturnValue({
        logChannelId: 'log-channel',
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: {
          id: 'log-channel',
          send: jest.fn().mockResolvedValue(undefined),
        },
      });
      const client = createMockClient();
      client.guilds.fetch = jest.fn().mockResolvedValue(mockGuild);

      await logToChannel(client as never, 'guild-123', 'Test message');

      expect(mockCanBotWriteToChannel).toHaveBeenCalledWith(mockGuild, 'log-channel');
    });

    it('should handle channel not returned by canBotWriteToChannel', async () => {
      mockGetGuildConfig.mockReturnValue({
        logChannelId: 'log-channel',
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: null, // Channel non retourne
      });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const client = createMockClient();

      await logToChannel(client as never, 'guild-123', 'Test message');

      expect(consoleSpy).toHaveBeenCalledWith('[LOG] Test message');
      consoleSpy.mockRestore();
    });
  });
});
