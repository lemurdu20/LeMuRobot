/**
 * Tests pour roleManager.ts
 * Gestion du bouton de reinscription
 */

import { MessageFlags } from 'discord.js';

// Set env BEFORE any imports
process.env.DISCORD_TOKEN = 'test-token';
process.env.GUILD_ID = 'test-guild-id';
process.env.CLIENT_ID = 'test-client-id';

// Mock config
jest.mock('../config', () => ({
  getCampaign: jest.fn(),
  addResubscribedMember: jest.fn(),
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logToChannel: jest.fn(),
}));

// Mock roleUtils
jest.mock('../utils/roleUtils', () => ({
  canBotManageRole: jest.fn(),
}));

// Mock helpers
jest.mock('../utils/helpers', () => ({
  isGuildInteraction: jest.fn(),
}));

// Mock discord.js GuildMember pour instanceof
jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  return {
    ...actual,
    GuildMember: class MockGuildMember {
      static [Symbol.hasInstance](obj: unknown): boolean {
        return obj !== null && typeof obj === 'object' && '_isGuildMember' in obj;
      }
    },
  };
});

import { handleResubscribeButton } from './roleManager';
import { getCampaign, addResubscribedMember } from '../config';
import { logToChannel } from '../utils/logger';
import { canBotManageRole } from '../utils/roleUtils';
import { isGuildInteraction } from '../utils/helpers';

const mockGetCampaign = getCampaign as jest.Mock;
const mockAddResubscribedMember = addResubscribedMember as jest.Mock;
const mockLogToChannel = logToChannel as jest.Mock;
const mockCanBotManageRole = canBotManageRole as jest.Mock;
const mockIsGuildInteraction = isGuildInteraction as jest.Mock;

// Helper pour creer un membre qui passe instanceof GuildMember
function createMockGuildMember(overrides: Record<string, unknown> = {}) {
  return {
    _isGuildMember: true, // Flag pour notre mock instanceof
    id: 'member-123',
    roles: {
      cache: new Map([['old-role-id', { id: 'old-role-id' }]]),
      add: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

// Helper pour creer une interaction mock
function createMockInteraction(overrides: Record<string, unknown> = {}) {
  return {
    guildId: 'guild-123',
    guild: { id: 'guild-123' },
    member: createMockGuildMember(),
    user: { id: 'user-123' },
    client: { guilds: { cache: new Map() } },
    reply: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('roleManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGuildInteraction.mockReturnValue(true);
    mockCanBotManageRole.mockResolvedValue({ canManage: true });
    mockAddResubscribedMember.mockResolvedValue(true);
    mockLogToChannel.mockResolvedValue(undefined);
  });

  describe('handleResubscribeButton', () => {
    it('should reject non-guild interactions', async () => {
      mockIsGuildInteraction.mockReturnValue(false);
      const interaction = createMockInteraction({ guildId: null, guild: null });

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Cette action doit etre effectuee dans un serveur.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when no campaign exists', async () => {
      mockGetCampaign.mockReturnValue(undefined);
      const interaction = createMockInteraction();

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Aucune campagne de reinscription en cours.',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when member is not a GuildMember', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });
      // Member without _isGuildMember flag won't pass instanceof
      const interaction = createMockInteraction({ member: { id: 'member-123' } });

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Impossible de te'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when member is already resubscribed (in campaign list)', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: ['member-123'],
      });
      const interaction = createMockInteraction();

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Tu es deja reinscrit(e) !',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when member does not have old role but has new role', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });
      const mockMember = createMockGuildMember({
        roles: { cache: new Map([['new-role-id', {}]]) },
      });
      const interaction = createMockInteraction({ member: mockMember });

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Tu as deja le nouveau role !',
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when member does not have old role at all', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });
      const mockMember = createMockGuildMember({
        roles: { cache: new Map() },
      });
      const interaction = createMockInteraction({ member: mockMember });

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('ne te concerne pas'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when bot cannot manage old role', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });
      mockCanBotManageRole.mockResolvedValueOnce({ canManage: false, error: 'Role too high' });
      const interaction = createMockInteraction();

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('permissions'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when bot cannot manage new role', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });
      mockCanBotManageRole
        .mockResolvedValueOnce({ canManage: true })
        .mockResolvedValueOnce({ canManage: false, error: 'Role managed' });
      const interaction = createMockInteraction();

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('permissions'),
        flags: MessageFlags.Ephemeral,
      });
    });

    it('should reject when race condition detected (addResubscribedMember returns false)', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });
      mockAddResubscribedMember.mockResolvedValue(false);
      const mockMember = createMockGuildMember();
      const interaction = createMockInteraction({ member: mockMember });

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'Tu es deja reinscrit(e) !',
        flags: MessageFlags.Ephemeral,
      });
      expect(mockMember.roles.add).not.toHaveBeenCalled();
    });

    it('should successfully add new role and remove old role', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });
      const mockMember = createMockGuildMember();
      const interaction = createMockInteraction({ member: mockMember });

      await handleResubscribeButton(interaction as never);

      expect(mockMember.roles.add).toHaveBeenCalledWith('new-role-id');
      expect(mockMember.roles.remove).toHaveBeenCalledWith('old-role-id');
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Merci'),
        flags: MessageFlags.Ephemeral,
      });
      expect(mockLogToChannel).toHaveBeenCalled();
    });

    it('should register member BEFORE role changes (race condition protection)', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });

      const callOrder: string[] = [];
      mockAddResubscribedMember.mockImplementation(() => {
        callOrder.push('addResubscribedMember');
        return Promise.resolve(true);
      });

      const mockMember = createMockGuildMember({
        roles: {
          cache: new Map([['old-role-id', {}]]),
          add: jest.fn().mockImplementation(() => {
            callOrder.push('roles.add');
            return Promise.resolve();
          }),
          remove: jest.fn().mockImplementation(() => {
            callOrder.push('roles.remove');
            return Promise.resolve();
          }),
        },
      });
      const interaction = createMockInteraction({ member: mockMember });

      await handleResubscribeButton(interaction as never);

      expect(callOrder[0]).toBe('addResubscribedMember');
      expect(callOrder[1]).toBe('roles.add');
      expect(callOrder[2]).toBe('roles.remove');
    });

    it('should add new role BEFORE removing old role (safe order)', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });

      const callOrder: string[] = [];
      const mockMember = createMockGuildMember({
        roles: {
          cache: new Map([['old-role-id', {}]]),
          add: jest.fn().mockImplementation(() => {
            callOrder.push('add');
            return Promise.resolve();
          }),
          remove: jest.fn().mockImplementation(() => {
            callOrder.push('remove');
            return Promise.resolve();
          }),
        },
      });
      const interaction = createMockInteraction({ member: mockMember });

      await handleResubscribeButton(interaction as never);

      expect(callOrder.indexOf('add')).toBeLessThan(callOrder.indexOf('remove'));
    });

    it('should continue if old role removal fails (graceful degradation)', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });
      const mockMember = createMockGuildMember({
        roles: {
          cache: new Map([['old-role-id', {}]]),
          add: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockRejectedValue(new Error('Cannot remove role')),
        },
      });
      const interaction = createMockInteraction({ member: mockMember });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Merci'),
        flags: MessageFlags.Ephemeral,
      });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should fail if new role addition fails', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });
      const mockMember = createMockGuildMember({
        roles: {
          cache: new Map([['old-role-id', {}]]),
          add: jest.fn().mockRejectedValue(new Error('Cannot add role')),
          remove: jest.fn(),
        },
      });
      const interaction = createMockInteraction({ member: mockMember });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleResubscribeButton(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('administrateur'),
        flags: MessageFlags.Ephemeral,
      });
      expect(mockMember.roles.remove).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log successful resubscription', async () => {
      mockGetCampaign.mockReturnValue({
        oldRoleId: 'old-role-id',
        newRoleId: 'new-role-id',
        resubscribedMembers: [],
      });
      const mockMember = createMockGuildMember();
      const interaction = createMockInteraction({ member: mockMember });

      await handleResubscribeButton(interaction as never);

      expect(mockLogToChannel).toHaveBeenCalledWith(
        interaction.client,
        'guild-123',
        expect.stringContaining('member-123')
      );
    });
  });
});
