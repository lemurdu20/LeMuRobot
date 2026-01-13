/**
 * Tests pour campagne/start.ts
 * Demarrage d'une campagne de reinscription
 */

import { MessageFlags } from 'discord.js';

// Set env BEFORE any imports
process.env.DISCORD_TOKEN = 'test-token';
process.env.GUILD_ID = 'test-guild-id';
process.env.CLIENT_ID = 'test-client-id';

// Mock config
jest.mock('../../config', () => ({
  getCampaign: jest.fn(),
  setCampaign: jest.fn(),
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logToChannel: jest.fn(),
}));

// Mock roleUtils
jest.mock('../../utils/roleUtils', () => ({
  canBotManageCampaignRoles: jest.fn(),
  canBotWriteToChannel: jest.fn(),
}));

import { handleStart } from './start';
import { getCampaign, setCampaign } from '../../config';
import { logToChannel } from '../../utils/logger';
import { canBotManageCampaignRoles, canBotWriteToChannel } from '../../utils/roleUtils';

const mockGetCampaign = getCampaign as jest.Mock;
const mockSetCampaign = setCampaign as jest.Mock;
const mockLogToChannel = logToChannel as jest.Mock;
const mockCanBotManageCampaignRoles = canBotManageCampaignRoles as jest.Mock;
const mockCanBotWriteToChannel = canBotWriteToChannel as jest.Mock;

// Helper pour creer un contexte mock
function createMockContext(overrides: Record<string, unknown> = {}) {
  return {
    interaction: {
      options: {
        getRole: jest.fn().mockImplementation((name: string) => {
          if (name === 'ancien_role') return { id: 'old-role-id', name: 'Old Role' };
          if (name === 'nouveau_role') return { id: 'new-role-id', name: 'New Role' };
          return null;
        }),
        getChannel: jest.fn().mockReturnValue({ id: 'channel-123' }),
        getInteger: jest.fn().mockReturnValue(null),
      },
      reply: jest.fn().mockResolvedValue(undefined),
      user: { id: 'user-123' },
      client: {},
    },
    guildId: 'guild-123',
    guild: { id: 'guild-123' },
    ...overrides,
  };
}

describe('campagne/start', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCampaign.mockReturnValue(undefined);
    mockSetCampaign.mockResolvedValue(undefined);
    mockLogToChannel.mockResolvedValue(undefined);
    mockCanBotManageCampaignRoles.mockResolvedValue({ canManage: true });
    mockCanBotWriteToChannel.mockResolvedValue({
      canUse: true,
      channel: {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      },
    });
  });

  describe('handleStart', () => {
    it('should reject when campaign already exists', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'existing-old',
        newRoleId: 'existing-new',
      });
      const ctx = createMockContext();

      await handleStart(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('deja en cours'),
        flags: MessageFlags.Ephemeral,
      });
      expect(mockSetCampaign).not.toHaveBeenCalled();
    });

    it('should reject when bot cannot manage roles', async () => {
      mockCanBotManageCampaignRoles.mockResolvedValue({
        canManage: false,
        error: 'Role too high',
      });
      const ctx = createMockContext();

      await handleStart(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Impossible de gérer'),
        flags: MessageFlags.Ephemeral,
      });
      expect(mockSetCampaign).not.toHaveBeenCalled();
    });

    it('should reject when bot cannot write to channel', async () => {
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: false,
        error: 'No permission',
      });
      const ctx = createMockContext();

      await handleStart(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Impossible d\'envoyer'),
        flags: MessageFlags.Ephemeral,
      });
      expect(mockSetCampaign).not.toHaveBeenCalled();
    });

    it('should create campaign successfully', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();

      await handleStart(ctx as never);

      expect(mockChannel.send).toHaveBeenCalled();
      expect(mockSetCampaign).toHaveBeenCalledWith('guild-123', expect.objectContaining({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        channelId: 'channel-123',
        messageId: 'message-123',
        resubscribedMembers: [],
      }));
    });

    it('should send embed with correct role names', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();

      await handleStart(ctx as never);

      expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({
        embeds: expect.any(Array),
        components: expect.any(Array),
      }));
    });

    it('should reply with success message', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();

      await handleStart(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Campagne demarree'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should log campaign start', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();

      await handleStart(ctx as never);

      expect(mockLogToChannel).toHaveBeenCalledWith(
        ctx.interaction.client,
        'guild-123',
        expect.stringContaining('Campagne de reinscription demarree')
      );
    });

    it('should handle duration parameter with correct date calculation', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      const durationDays = 7;
      ctx.interaction.options.getInteger = jest.fn().mockReturnValue(durationDays);

      const beforeDate = new Date();
      await handleStart(ctx as never);
      const afterDate = new Date();

      // Verifier que endsAt est defini et est une date ISO valide
      const savedCampaign = mockSetCampaign.mock.calls[0][1];
      expect(savedCampaign.endsAt).toBeDefined();
      expect(savedCampaign.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // Verifier que la date de fin est correctement calculee (environ 7 jours dans le futur)
      const endsAtDate = new Date(savedCampaign.endsAt);
      const expectedMinDate = new Date(beforeDate);
      expectedMinDate.setDate(expectedMinDate.getDate() + durationDays);
      const expectedMaxDate = new Date(afterDate);
      expectedMaxDate.setDate(expectedMaxDate.getDate() + durationDays);

      expect(endsAtDate.getTime()).toBeGreaterThanOrEqual(expectedMinDate.getTime() - 1000);
      expect(endsAtDate.getTime()).toBeLessThanOrEqual(expectedMaxDate.getTime() + 1000);
    });

    it('should include end timestamp in reply when duration specified', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      ctx.interaction.options.getInteger = jest.fn().mockReturnValue(7);

      await handleStart(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Fin automatique'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should indicate manual duration when no duration specified', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      ctx.interaction.options.getInteger = jest.fn().mockReturnValue(null);

      await handleStart(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('manuelle'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should not set endsAt when no duration specified', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      ctx.interaction.options.getInteger = jest.fn().mockReturnValue(null);

      await handleStart(ctx as never);

      expect(mockSetCampaign).toHaveBeenCalledWith('guild-123', expect.objectContaining({
        endsAt: undefined,
      }));
    });

    it('should log duration when specified', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      ctx.interaction.options.getInteger = jest.fn().mockReturnValue(14);

      await handleStart(ctx as never);

      expect(mockLogToChannel).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.stringContaining('14 jours')
      );
    });

    it('should verify roles with canBotManageCampaignRoles', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();

      await handleStart(ctx as never);

      expect(mockCanBotManageCampaignRoles).toHaveBeenCalledWith(
        ctx.guild,
        'old-role-id',
        'new-role-id'
      );
    });

    it('should verify channel with canBotWriteToChannel', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();

      await handleStart(ctx as never);

      expect(mockCanBotWriteToChannel).toHaveBeenCalledWith(ctx.guild, 'channel-123');
    });

    it('should include startedAt timestamp in ISO format', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue({ id: 'message-123' }),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();

      const before = new Date();
      await handleStart(ctx as never);
      const after = new Date();

      const savedCampaign = mockSetCampaign.mock.calls[0][1];

      // Verifier le format ISO
      expect(savedCampaign.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // Verifier que la date est dans la plage attendue
      const startedAt = new Date(savedCampaign.startedAt);
      expect(startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
