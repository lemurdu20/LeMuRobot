/**
 * Tests pour campagne/end.ts
 * Fin d'une campagne de reinscription
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
  canBotWriteToChannel: jest.fn(),
}));

import { handleEnd } from './end';
import { getCampaign, setCampaign } from '../../config';
import { logToChannel } from '../../utils/logger';
import { canBotWriteToChannel } from '../../utils/roleUtils';

const mockGetCampaign = getCampaign as jest.Mock;
const mockSetCampaign = setCampaign as jest.Mock;
const mockLogToChannel = logToChannel as jest.Mock;
const mockCanBotWriteToChannel = canBotWriteToChannel as jest.Mock;

// Helper pour creer un contexte mock
function createMockContext(overrides: Record<string, unknown> = {}) {
  return {
    interaction: {
      options: {
        getString: jest.fn().mockReturnValue('retirer_role'),
      },
      reply: jest.fn().mockResolvedValue(undefined),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      user: { id: 'user-123' },
      client: {},
    },
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
    ...overrides,
  };
}

describe('campagne/end', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetCampaign.mockResolvedValue(undefined);
    mockLogToChannel.mockResolvedValue(undefined);
    mockCanBotWriteToChannel.mockResolvedValue({ canUse: false });
  });

  describe('handleEnd', () => {
    it('should reject when no campaign exists', async () => {
      mockGetCampaign.mockReturnValue(undefined);
      const ctx = createMockContext();

      await handleEnd(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: 'Aucune campagne en cours.',
        flags: MessageFlags.Ephemeral,
      });
      expect(ctx.interaction.deferReply).not.toHaveBeenCalled();
    });

    it('should defer reply for long operations', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: [],
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(new Map()),
        },
      });

      await handleEnd(ctx as never);

      expect(ctx.interaction.deferReply).toHaveBeenCalledWith({
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should handle missing old role', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: [],
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue(null);

      await handleEnd(ctx as never);

      expect(ctx.interaction.editReply).toHaveBeenCalledWith('Erreur : ancien role introuvable.');
      expect(mockSetCampaign).toHaveBeenCalledWith('guild-123', undefined);
    });

    it('should remove role from non-resubscribed members when action is retirer_role', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: ['member-1'], // member-1 is resubscribed
      });

      const mockMember2 = {
        id: 'member-2',
        roles: {
          remove: jest.fn().mockResolvedValue(undefined),
        },
        kick: jest.fn(),
      };

      const membersMap = new Map([['member-2', mockMember2]]);

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(membersMap),
        },
      });
      ctx.interaction.options.getString = jest.fn().mockReturnValue('retirer_role');

      await handleEnd(ctx as never);

      expect(mockMember2.roles.remove).toHaveBeenCalledWith('old-role');
      expect(mockMember2.kick).not.toHaveBeenCalled();
    });

    it('should kick non-resubscribed members when action is kick', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: [],
      });

      const mockMember = {
        id: 'member-2',
        roles: {
          remove: jest.fn(),
        },
        kick: jest.fn().mockResolvedValue(undefined),
      };

      const membersMap = new Map([['member-2', mockMember]]);

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(membersMap),
        },
      });
      ctx.interaction.options.getString = jest.fn().mockReturnValue('kick');

      await handleEnd(ctx as never);

      expect(mockMember.kick).toHaveBeenCalledWith('Non reinscrit - fin de campagne');
      expect(mockMember.roles.remove).not.toHaveBeenCalled();
    });

    it('should count and report errors during member processing', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: [],
      });

      const mockMemberSuccess = {
        id: 'member-1',
        roles: {
          remove: jest.fn().mockResolvedValue(undefined),
        },
      };
      const mockMemberError = {
        id: 'member-2',
        roles: {
          remove: jest.fn().mockRejectedValue(new Error('Permission denied')),
        },
      };

      const membersMap = new Map([
        ['member-1', mockMemberSuccess],
        ['member-2', mockMemberError],
      ]);

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(membersMap),
        },
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleEnd(ctx as never);

      expect(ctx.interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('1 erreurs')
      );
      consoleSpy.mockRestore();
    });

    it('should delete campaign message when channel accessible', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message-123',
        resubscribedMembers: [],
      });

      const mockMessage = {
        delete: jest.fn().mockResolvedValue(undefined),
      };
      const mockChannel = {
        messages: {
          fetch: jest.fn().mockResolvedValue(mockMessage),
        },
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(new Map()),
        },
      });

      await handleEnd(ctx as never);

      expect(mockChannel.messages.fetch).toHaveBeenCalledWith('message-123');
      expect(mockMessage.delete).toHaveBeenCalled();
    });

    it('should handle message not found gracefully', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message-123',
        resubscribedMembers: [],
      });

      const mockChannel = {
        messages: {
          fetch: jest.fn().mockResolvedValue(null),
        },
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(new Map()),
        },
      });

      // Should not throw
      await expect(handleEnd(ctx as never)).resolves.not.toThrow();
    });

    it('should handle message deletion failure gracefully', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message-123',
        resubscribedMembers: [],
      });

      const mockMessage = {
        delete: jest.fn().mockRejectedValue(new Error('Cannot delete')),
      };
      const mockChannel = {
        messages: {
          fetch: jest.fn().mockResolvedValue(mockMessage),
        },
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(new Map()),
        },
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Should not throw
      await expect(handleEnd(ctx as never)).resolves.not.toThrow();
      consoleSpy.mockRestore();
    });

    it('should clear campaign after processing', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: [],
      });

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(new Map()),
        },
      });

      await handleEnd(ctx as never);

      expect(mockSetCampaign).toHaveBeenCalledWith('guild-123', undefined);
    });

    it('should report correct stats in reply', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: ['member-1', 'member-2', 'member-3'], // 3 resubscribed
      });

      const mockMember = {
        id: 'member-4',
        roles: {
          remove: jest.fn().mockResolvedValue(undefined),
        },
      };

      const membersMap = new Map([['member-4', mockMember]]);

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(membersMap),
        },
      });

      await handleEnd(ctx as never);

      expect(ctx.interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('3 membres reinscrits')
      );
      expect(ctx.interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('1 membres ont perdu leur role')
      );
    });

    it('should show "expulses" when action is kick', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: [],
      });

      const mockMember = {
        id: 'member-1',
        kick: jest.fn().mockResolvedValue(undefined),
      };

      const membersMap = new Map([['member-1', mockMember]]);

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(membersMap),
        },
      });
      ctx.interaction.options.getString = jest.fn().mockReturnValue('kick');

      await handleEnd(ctx as never);

      expect(ctx.interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('expulses')
      );
    });

    it('should log campaign end', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: ['member-1'],
      });

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(new Map()),
        },
      });

      await handleEnd(ctx as never);

      expect(mockLogToChannel).toHaveBeenCalledWith(
        ctx.interaction.client,
        'guild-123',
        expect.stringContaining('Campagne terminee par')
      );
    });

    it('should fetch all guild members before processing', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: [],
      });

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockReturnValue(new Map()),
        },
      });

      await handleEnd(ctx as never);

      expect(ctx.guild.members.fetch).toHaveBeenCalled();
    });

    it('should filter members correctly (exclude resubscribed)', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: ['member-1'],
      });

      const mockFilter = jest.fn().mockReturnValue(new Map());
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: mockFilter,
        },
      });

      await handleEnd(ctx as never);

      expect(mockFilter).toHaveBeenCalled();
      // The filter function should exclude member-1
      const filterFn = mockFilter.mock.calls[0][0];
      expect(filterFn({ id: 'member-1' })).toBe(false);
      expect(filterFn({ id: 'member-2' })).toBe(true);
    });

    it('should NOT process resubscribed members - explicit verification', async () => {
      // Ce test verifie explicitement que les membres reinscrits ne sont PAS traites
      const resubscribedMemberId = 'member-resubscribed';
      const nonResubscribedMemberId = 'member-not-resubscribed';

      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel',
        messageId: 'message',
        resubscribedMembers: [resubscribedMemberId],
      });

      // Creer deux membres: un reinscrit et un non-reinscrit
      const mockResubscribedMember = {
        id: resubscribedMemberId,
        roles: {
          remove: jest.fn().mockResolvedValue(undefined),
        },
        kick: jest.fn().mockResolvedValue(undefined),
      };

      const mockNonResubscribedMember = {
        id: nonResubscribedMemberId,
        roles: {
          remove: jest.fn().mockResolvedValue(undefined),
        },
        kick: jest.fn().mockResolvedValue(undefined),
      };

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockImplementation((filterFn) => {
            // Simuler le comportement du filtre reel
            const allMembers = new Map([
              [resubscribedMemberId, mockResubscribedMember],
              [nonResubscribedMemberId, mockNonResubscribedMember],
            ]);
            const result = new Map();
            for (const [id, member] of allMembers) {
              if (filterFn(member)) {
                result.set(id, member);
              }
            }
            return result;
          }),
        },
      });

      await handleEnd(ctx as never);

      // Le membre reinscrit ne doit PAS avoir eu son role retire
      expect(mockResubscribedMember.roles.remove).not.toHaveBeenCalled();
      expect(mockResubscribedMember.kick).not.toHaveBeenCalled();

      // Le membre non-reinscrit DOIT avoir eu son role retire
      expect(mockNonResubscribedMember.roles.remove).toHaveBeenCalledWith('old-role');
    });
  });
});
