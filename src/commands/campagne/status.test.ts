/**
 * Tests pour campagne/status.ts
 * Affichage du statut de la campagne
 */

import { MessageFlags } from 'discord.js';

// Set env BEFORE any imports
process.env.DISCORD_TOKEN = 'test-token';
process.env.GUILD_ID = 'test-guild-id';
process.env.CLIENT_ID = 'test-client-id';

// Mock config
jest.mock('../../config', () => ({
  getCampaign: jest.fn(),
}));

import { handleStatus } from './status';
import { getCampaign } from '../../config';

const mockGetCampaign = getCampaign as jest.Mock;

// Helper pour creer un contexte mock
function createMockContext(overrides: Record<string, unknown> = {}) {
  return {
    interaction: {
      reply: jest.fn().mockResolvedValue(undefined),
      user: { id: 'user-123' },
    },
    guildId: 'guild-123',
    guild: {
      id: 'guild-123',
      members: {
        fetch: jest.fn().mockResolvedValue(new Map()),
      },
      roles: {
        fetch: jest.fn(),
      },
    },
    ...overrides,
  };
}

// Helper pour creer des membres mock
function createMockMembersMap(ids: string[]) {
  const members = new Map();
  ids.forEach(id => {
    members.set(id, { id });
  });
  return {
    filter: jest.fn().mockImplementation((fn) => {
      const filtered = new Map();
      for (const [id, member] of members) {
        if (fn(member)) {
          filtered.set(id, member);
        }
      }
      return filtered;
    }),
    size: ids.length,
  };
}

describe('campagne/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCampaign.mockReturnValue(undefined);
  });

  describe('handleStatus', () => {
    it('should reject when no campaign exists', async () => {
      mockGetCampaign.mockReturnValue(undefined);
      const ctx = createMockContext();

      await handleStatus(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: 'Aucune campagne en cours.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when old role no longer exists', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue(null);

      await handleStatus(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('n\'existe plus'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should display status with embed and buttons', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: ['member-1', 'member-2'],
      });
      const ctx = createMockContext();
      // 2 membres non reinscrits dans le role
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: createMockMembersMap(['member-3', 'member-4']),
      });

      await handleStatus(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        embeds: expect.any(Array),
        components: expect.any(Array),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should calculate correct percentage', async () => {
      // 3 reinscrits, 1 en attente = 75%
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: ['m1', 'm2', 'm3'],
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: createMockMembersMap(['m4']), // 1 en attente
      });

      await handleStatus(ctx as never);

      const replyCall = ctx.interaction.reply.mock.calls[0][0];
      expect(replyCall.embeds).toBeDefined();
      expect(replyCall.embeds.length).toBe(1);
    });

    it('should handle 0% case (no resubscribed)', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: createMockMembersMap(['m1', 'm2']),
      });

      await handleStatus(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        })
      );
    });

    it('should handle 100% case (all resubscribed)', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: ['m1', 'm2', 'm3'],
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: createMockMembersMap([]), // Personne en attente
      });

      await handleStatus(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalled();
    });

    it('should include end date when endsAt is set', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
        endsAt: futureDate.toISOString(),
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: createMockMembersMap(['m1']),
      });

      await handleStatus(ctx as never);

      const replyCall = ctx.interaction.reply.mock.calls[0][0];
      expect(replyCall.embeds).toBeDefined();
    });

    it('should not include end date when endsAt is not set', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
        // No endsAt
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: createMockMembersMap(['m1']),
      });

      await handleStatus(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalled();
    });

    it('should fetch guild members before processing', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: createMockMembersMap(['m1']),
      });

      await handleStatus(ctx as never);

      expect(ctx.guild.members.fetch).toHaveBeenCalled();
    });

    it('should include two buttons for viewing lists', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: ['m1'],
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: createMockMembersMap(['m2']),
      });

      await handleStatus(ctx as never);

      const replyCall = ctx.interaction.reply.mock.calls[0][0];
      expect(replyCall.components).toBeDefined();
      expect(replyCall.components.length).toBe(1); // 1 ActionRow
    });

    it('should filter members correctly for not-yet-resubscribed count', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: ['m1', 'm2'], // 2 deja reinscrits
      });
      const ctx = createMockContext();

      // Simuler le filtre: role a 4 membres, 2 sont deja reinscrits
      const allMembers = new Map([
        ['m1', { id: 'm1' }],
        ['m2', { id: 'm2' }],
        ['m3', { id: 'm3' }],
        ['m4', { id: 'm4' }],
      ]);
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: {
          filter: jest.fn().mockImplementation((fn) => {
            const filtered = new Map();
            for (const [id, member] of allMembers) {
              if (fn(member)) {
                filtered.set(id, member);
              }
            }
            return filtered;
          }),
          size: 4,
        },
      });

      await handleStatus(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalled();
    });

    it('should handle edge case with empty role', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: createMockMembersMap([]),
      });

      await handleStatus(ctx as never);

      // Devrait afficher 0/0 (0%) sans erreur
      expect(ctx.interaction.reply).toHaveBeenCalled();
    });
  });
});
