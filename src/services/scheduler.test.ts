/**
 * Tests pour scheduler.ts
 * Timer d'expiration automatique des campagnes
 */

// Set env BEFORE any imports
process.env.DISCORD_TOKEN = 'test-token';
process.env.GUILD_ID = 'test-guild-id';
process.env.CLIENT_ID = 'test-client-id';

// Mock config
jest.mock('../config', () => ({
  getCampaign: jest.fn(),
  setCampaign: jest.fn(),
  getAllGuildsWithCampaigns: jest.fn(),
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logToChannel: jest.fn(),
}));

// Mock roleUtils
jest.mock('../utils/roleUtils', () => ({
  canBotWriteToChannel: jest.fn(),
}));

// Mock constants
jest.mock('../utils/constants', () => ({
  SCHEDULER_CHECK_INTERVAL_MS: 60000,
}));

import { startScheduler, stopScheduler } from './scheduler';
import { getCampaign, setCampaign, getAllGuildsWithCampaigns } from '../config';
import { logToChannel } from '../utils/logger';
import { canBotWriteToChannel } from '../utils/roleUtils';

const mockGetCampaign = getCampaign as jest.Mock;
const mockSetCampaign = setCampaign as jest.Mock;
const mockGetAllGuildsWithCampaigns = getAllGuildsWithCampaigns as jest.Mock;
const mockLogToChannel = logToChannel as jest.Mock;
const mockCanBotWriteToChannel = canBotWriteToChannel as jest.Mock;

// Helper pour creer un client mock
function createMockClient() {
  return {
    guilds: {
      fetch: jest.fn(),
    },
  };
}

// Helper pour creer une guild mock
function createMockGuild() {
  return {
    id: 'test-guild-id',
    roles: {
      fetch: jest.fn(),
    },
    members: {
      fetch: jest.fn().mockResolvedValue(new Map()),
    },
  };
}

// Helper pour attendre que toutes les promesses en attente soient resolues
const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);

describe('scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetAllGuildsWithCampaigns.mockReturnValue([]);
    mockSetCampaign.mockResolvedValue(undefined);
    mockLogToChannel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    stopScheduler();
    jest.useRealTimers();
  });

  describe('startScheduler', () => {
    it('should start the scheduler and log startup', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockGetAllGuildsWithCampaigns.mockReturnValue([]);
      const mockClient = createMockClient();

      startScheduler(mockClient as never);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Demarre'));
      consoleSpy.mockRestore();
    });

    it('should check for expired campaigns immediately on start', () => {
      mockGetAllGuildsWithCampaigns.mockReturnValue([]);
      const mockClient = createMockClient();

      startScheduler(mockClient as never);

      expect(mockGetAllGuildsWithCampaigns).toHaveBeenCalled();
    });

    it('should check periodically after start', () => {
      mockGetAllGuildsWithCampaigns.mockReturnValue([]);
      const mockClient = createMockClient();

      startScheduler(mockClient as never);
      mockGetAllGuildsWithCampaigns.mockClear();

      // Advance time by 60 seconds
      jest.advanceTimersByTime(60000);

      expect(mockGetAllGuildsWithCampaigns).toHaveBeenCalled();
    });

    it('should restart scheduler if already running', () => {
      mockGetAllGuildsWithCampaigns.mockReturnValue([]);
      const mockClient = createMockClient();

      startScheduler(mockClient as never);
      const firstCheckCount = mockGetAllGuildsWithCampaigns.mock.calls.length;

      // Start again
      startScheduler(mockClient as never);

      // Should have made another immediate check
      expect(mockGetAllGuildsWithCampaigns.mock.calls.length).toBe(firstCheckCount + 1);
    });
  });

  describe('stopScheduler', () => {
    it('should stop the scheduler and log shutdown', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockGetAllGuildsWithCampaigns.mockReturnValue([]);
      const mockClient = createMockClient();

      startScheduler(mockClient as never);
      stopScheduler();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Arrete'));
      consoleSpy.mockRestore();
    });

    it('should do nothing if scheduler not running', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      stopScheduler();

      // Should not log shutdown if not running
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Arrete'));
      consoleSpy.mockRestore();
    });

    it('should prevent further checks after stopping', () => {
      mockGetAllGuildsWithCampaigns.mockReturnValue([]);
      const mockClient = createMockClient();

      startScheduler(mockClient as never);
      stopScheduler();
      mockGetAllGuildsWithCampaigns.mockClear();

      // Advance time
      jest.advanceTimersByTime(120000);

      expect(mockGetAllGuildsWithCampaigns).not.toHaveBeenCalled();
    });
  });

  describe('checkExpiredCampaigns', () => {
    it('should do nothing when no guilds have campaigns', () => {
      mockGetAllGuildsWithCampaigns.mockReturnValue([]);
      const mockClient = createMockClient();

      startScheduler(mockClient as never);

      expect(mockClient.guilds.fetch).not.toHaveBeenCalled();
    });

    it('should do nothing when campaign has no endsAt', () => {
      mockGetAllGuildsWithCampaigns.mockReturnValue(['test-guild-id']);
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        startedAt: '2024-01-01',
        resubscribedMembers: [],
        // No endsAt
      });
      const mockClient = createMockClient();

      startScheduler(mockClient as never);

      expect(mockClient.guilds.fetch).not.toHaveBeenCalled();
    });

    it('should do nothing when campaign is not yet expired', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

      mockGetAllGuildsWithCampaigns.mockReturnValue(['test-guild-id']);
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        startedAt: '2024-01-01',
        endsAt: futureDate.toISOString(),
        resubscribedMembers: [],
      });
      const mockClient = createMockClient();

      startScheduler(mockClient as never);

      expect(mockClient.guilds.fetch).not.toHaveBeenCalled();
    });

    it('should process expired campaign', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      mockGetAllGuildsWithCampaigns.mockReturnValue(['test-guild-id']);
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        startedAt: '2024-01-01',
        endsAt: pastDate.toISOString(),
        resubscribedMembers: ['member-1'],
      });

      const mockRole = {
        members: {
          filter: jest.fn().mockReturnValue(new Map()),
        },
      };
      const mockGuild = createMockGuild();
      mockGuild.roles.fetch.mockResolvedValue(mockRole);
      mockCanBotWriteToChannel.mockResolvedValue({ canUse: false });

      const mockClient = createMockClient();
      mockClient.guilds.fetch.mockResolvedValue(mockGuild);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      startScheduler(mockClient as never);

      // Attendre que les promesses async soient resolues
      await flushPromises();

      expect(mockClient.guilds.fetch).toHaveBeenCalledWith('test-guild-id');
      consoleSpy.mockRestore();
    });

    it('should handle missing old role gracefully', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      mockGetAllGuildsWithCampaigns.mockReturnValue(['test-guild-id']);
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        startedAt: '2024-01-01',
        endsAt: pastDate.toISOString(),
        resubscribedMembers: [],
      });

      const mockGuild = createMockGuild();
      mockGuild.roles.fetch.mockResolvedValue(null); // Role not found

      const mockClient = createMockClient();
      mockClient.guilds.fetch.mockResolvedValue(mockGuild);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      startScheduler(mockClient as never);

      // Attendre que les promesses async soient resolues
      await flushPromises();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Ancien role introuvable'));
      consoleSpy.mockRestore();
    });

    it('should handle general errors gracefully', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      mockGetAllGuildsWithCampaigns.mockReturnValue(['test-guild-id']);
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        startedAt: '2024-01-01',
        endsAt: pastDate.toISOString(),
        resubscribedMembers: [],
      });

      const mockClient = createMockClient();
      mockClient.guilds.fetch.mockRejectedValue(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      startScheduler(mockClient as never);

      // Attendre que les promesses async soient resolues
      await flushPromises();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Erreur traitement campagne')
      );
      consoleSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
});
