/**
 * Tests pour campagne/relance.ts
 * Relance des membres non reinscrits
 */

import { MessageFlags } from 'discord.js';

// Set env BEFORE any imports
process.env.DISCORD_TOKEN = 'test-token';
process.env.GUILD_ID = 'test-guild-id';
process.env.CLIENT_ID = 'test-client-id';

// Mock config
jest.mock('../../config', () => ({
  getCampaign: jest.fn(),
  getLastRelanceAt: jest.fn(),
  setLastRelanceAt: jest.fn(),
  RELANCE_COOLDOWN_MS: 3600000, // 1 hour
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logToChannel: jest.fn(),
}));

// Mock roleUtils
jest.mock('../../utils/roleUtils', () => ({
  canBotWriteToChannel: jest.fn(),
}));

// Mock constants
jest.mock('../../utils/constants', () => ({
  DISCORD_MESSAGE_LIMIT: 2000,
  DISCORD_MENTION_LENGTH: 25,
  RELANCE_MAX_MENTIONS_PER_MESSAGE: 50,
  RELANCE_DELAY_BETWEEN_MESSAGES_MS: 100,
}));

import { handleRelance } from './relance';
import { getCampaign, getLastRelanceAt, setLastRelanceAt } from '../../config';
import { logToChannel } from '../../utils/logger';
import { canBotWriteToChannel } from '../../utils/roleUtils';

const mockGetCampaign = getCampaign as jest.Mock;
const mockGetLastRelanceAt = getLastRelanceAt as jest.Mock;
const mockSetLastRelanceAt = setLastRelanceAt as jest.Mock;
const mockLogToChannel = logToChannel as jest.Mock;
const mockCanBotWriteToChannel = canBotWriteToChannel as jest.Mock;

// Helper pour creer un contexte mock
function createMockContext(overrides: Record<string, unknown> = {}) {
  return {
    interaction: {
      options: {
        getString: jest.fn().mockReturnValue(null),
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

// Helper pour creer une Collection mock (comme Discord.js)
function createMockCollection(ids: string[]) {
  const members = new Map<string, { id: string }>();
  ids.forEach(id => {
    members.set(id, { id });
  });

  // Retourne un objet qui simule une Discord.js Collection
  const createCollectionLike = (map: Map<string, { id: string }>) => ({
    filter: jest.fn().mockImplementation((fn: (m: { id: string }) => boolean) => {
      const filtered = new Map<string, { id: string }>();
      for (const [id, member] of map) {
        if (fn(member)) {
          filtered.set(id, member);
        }
      }
      return createCollectionLike(filtered);
    }),
    map: jest.fn().mockImplementation((fn: (m: { id: string }) => string) => {
      const result: string[] = [];
      for (const member of map.values()) {
        result.push(fn(member));
      }
      return result;
    }),
    size: map.size,
  });

  return createCollectionLike(members);
}

describe('campagne/relance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCampaign.mockReturnValue(undefined);
    mockGetLastRelanceAt.mockReturnValue(null);
    mockSetLastRelanceAt.mockResolvedValue(undefined);
    mockLogToChannel.mockResolvedValue(undefined);
    mockCanBotWriteToChannel.mockResolvedValue({
      canUse: true,
      channel: {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('handleRelance', () => {
    it('should reject when no campaign exists', async () => {
      mockGetCampaign.mockReturnValue(undefined);
      const ctx = createMockContext();

      await handleRelance(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: 'Aucune campagne en cours.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when cooldown not elapsed', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      // Derniere relance il y a 30 minutes (cooldown = 1h)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      mockGetLastRelanceAt.mockReturnValue(thirtyMinutesAgo);
      const ctx = createMockContext();

      await handleRelance(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('attendre encore'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should allow relance when cooldown elapsed', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      // Derniere relance il y a 2 heures (cooldown = 1h)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      mockGetLastRelanceAt.mockReturnValue(twoHoursAgo);

      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: createMockCollection(['member-1']),
      });

      await handleRelance(ctx as never);

      expect(ctx.interaction.deferReply).toHaveBeenCalled();
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should reject when bot cannot write to channel', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: false,
        error: 'No permission',
      });
      const ctx = createMockContext();

      await handleRelance(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Impossible d\'envoyer'),
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
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: { id: 'channel-123', send: jest.fn() },
      });
      const ctx = createMockContext();
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue(null);

      await handleRelance(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('n\'existe plus'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when all members already resubscribed', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: ['member-1', 'member-2'],
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: { id: 'channel-123', send: jest.fn() },
      });
      const ctx = createMockContext();
      // Le filtre retourne 0 membres car tous sont reinscrits
      const emptyCollection = createMockCollection([]);
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: emptyCollection,
      });

      await handleRelance(ctx as never);

      expect(ctx.interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('deja reinscrits'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should send relance message successfully', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      const mockMembers = createMockCollection(['member-1', 'member-2']);
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: mockMembers,
      });

      await handleRelance(ctx as never);

      expect(ctx.interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
      expect(mockChannel.send).toHaveBeenCalled();
      expect(mockSetLastRelanceAt).toHaveBeenCalledWith('guild-123');
      expect(ctx.interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('2 membres')
      );
    });

    it('should use custom message when provided', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      ctx.interaction.options.getString = jest.fn().mockReturnValue('Message personnalise!');
      const mockMembers = createMockCollection(['member-1']);
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: mockMembers,
      });

      await handleRelance(ctx as never);

      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.stringContaining('Message personnalise!')
      );
    });

    it('should chunk messages for many members', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      // Creer 100 membres pour forcer le chunking
      const memberIds = Array.from({ length: 100 }, (_, i) => `member-${i}`);
      const mockMembers = createMockCollection(memberIds);
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: mockMembers,
      });

      await handleRelance(ctx as never);

      // Devrait envoyer plusieurs messages
      expect(mockChannel.send.mock.calls.length).toBeGreaterThan(1);
      expect(ctx.interaction.editReply).toHaveBeenCalledWith(
        expect.stringMatching(/100 membres.*\d+ message\(s\)/)
      );
    });

    it('should log relance to channel', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      const mockMembers = createMockCollection(['member-1']);
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: mockMembers,
      });

      await handleRelance(ctx as never);

      expect(mockLogToChannel).toHaveBeenCalledWith(
        ctx.interaction.client,
        'guild-123',
        expect.stringContaining('Relance envoyee')
      );
    });

    it('should fetch guild members before processing', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: [],
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      const mockMembers = createMockCollection(['member-1']);
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: mockMembers,
      });

      await handleRelance(ctx as never);

      expect(ctx.guild.members.fetch).toHaveBeenCalled();
    });

    it('should filter out already resubscribed members', async () => {
      const mockChannel = {
        id: 'channel-123',
        send: jest.fn().mockResolvedValue(undefined),
      };
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role',
        newRoleId: 'new-role',
        channelId: 'channel-123',
        resubscribedMembers: ['member-1'], // member-1 deja reinscrit
      });
      mockCanBotWriteToChannel.mockResolvedValue({
        canUse: true,
        channel: mockChannel,
      });
      const ctx = createMockContext();
      // Le role a 2 membres mais 1 est deja reinscrit - le filtre dans le code
      // exclura member-1, donc on simule avec une collection de 2 membres
      const mockMembers = createMockCollection(['member-1', 'member-2']);
      ctx.guild.roles.fetch = jest.fn().mockResolvedValue({
        members: mockMembers,
      });

      await handleRelance(ctx as never);

      // member-1 est dans resubscribedMembers donc sera filtre
      // Seul member-2 recevra la relance
      expect(ctx.interaction.editReply).toHaveBeenCalledWith(
        expect.stringContaining('1 membres')
      );
    });
  });
});
