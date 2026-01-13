/**
 * Tests pour roleUtils.ts
 * Validation des permissions de roles et canaux
 */

import { PermissionFlagsBits } from 'discord.js';
import { canBotManageRole, canBotManageCampaignRoles, canBotWriteToChannel } from './roleUtils';

// Helpers pour creer des mocks
function createMockGuild(overrides: Record<string, unknown> = {}) {
  return {
    members: {
      me: {
        permissions: {
          has: jest.fn().mockReturnValue(true),
        },
        roles: {
          highest: { position: 10 },
        },
      },
    },
    roles: {
      fetch: jest.fn(),
    },
    channels: {
      fetch: jest.fn(),
    },
    ...overrides,
  };
}

function createMockRole(overrides: Record<string, unknown> = {}) {
  return {
    id: 'role-123',
    name: 'Test Role',
    position: 5,
    managed: false,
    ...overrides,
  };
}

function createMockChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'channel-123',
    name: 'test-channel',
    isTextBased: () => true,
    isDMBased: () => false,
    permissionsFor: jest.fn().mockReturnValue({
      has: jest.fn().mockReturnValue(true),
    }),
    ...overrides,
  };
}

describe('roleUtils', () => {
  describe('canBotManageRole', () => {
    it('should return true when bot can manage role', async () => {
      const mockRole = createMockRole();
      const mockGuild = createMockGuild();
      (mockGuild.roles.fetch as jest.Mock).mockResolvedValue(mockRole);

      const result = await canBotManageRole(mockGuild as never, 'role-123');

      expect(result.canManage).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return false when bot member not found', async () => {
      const mockGuild = createMockGuild({ members: { me: null } });

      const result = await canBotManageRole(mockGuild as never, 'role-123');

      expect(result.canManage).toBe(false);
      expect(result.error).toBe('Impossible de trouver le bot sur le serveur.');
    });

    it('should return false when role not found', async () => {
      const mockGuild = createMockGuild();
      (mockGuild.roles.fetch as jest.Mock).mockResolvedValue(null);

      const result = await canBotManageRole(mockGuild as never, 'role-123');

      expect(result.canManage).toBe(false);
      expect(result.error).toBe('Role introuvable.');
    });

    it('should return false when bot lacks ManageRoles permission', async () => {
      const mockRole = createMockRole();
      const mockGuild = createMockGuild();
      (mockGuild.roles.fetch as jest.Mock).mockResolvedValue(mockRole);
      (mockGuild.members.me!.permissions.has as jest.Mock).mockReturnValue(false);

      const result = await canBotManageRole(mockGuild as never, 'role-123');

      expect(result.canManage).toBe(false);
      expect(result.error).toBe('Le bot n\'a pas la permission "Gerer les roles".');
    });

    it('should return false when role is above bot role', async () => {
      const mockRole = createMockRole({ position: 15 }); // Above bot's position of 10
      const mockGuild = createMockGuild();
      (mockGuild.roles.fetch as jest.Mock).mockResolvedValue(mockRole);

      const result = await canBotManageRole(mockGuild as never, 'role-123');

      expect(result.canManage).toBe(false);
      expect(result.error).toContain('au-dessus ou au meme niveau');
    });

    it('should return false when role is at same level as bot role', async () => {
      const mockRole = createMockRole({ position: 10 }); // Same as bot's position
      const mockGuild = createMockGuild();
      (mockGuild.roles.fetch as jest.Mock).mockResolvedValue(mockRole);

      const result = await canBotManageRole(mockGuild as never, 'role-123');

      expect(result.canManage).toBe(false);
      expect(result.error).toContain('au-dessus ou au meme niveau');
    });

    it('should return false when role is managed by integration', async () => {
      const mockRole = createMockRole({ managed: true });
      const mockGuild = createMockGuild();
      (mockGuild.roles.fetch as jest.Mock).mockResolvedValue(mockRole);

      const result = await canBotManageRole(mockGuild as never, 'role-123');

      expect(result.canManage).toBe(false);
      expect(result.error).toContain('gere par une integration');
    });

    it('should check permission with ManageRoles flag', async () => {
      const mockRole = createMockRole();
      const mockGuild = createMockGuild();
      (mockGuild.roles.fetch as jest.Mock).mockResolvedValue(mockRole);

      await canBotManageRole(mockGuild as never, 'role-123');

      expect(mockGuild.members.me!.permissions.has).toHaveBeenCalledWith(PermissionFlagsBits.ManageRoles);
    });
  });

  describe('canBotManageCampaignRoles', () => {
    it('should return true when bot can manage both roles', async () => {
      const mockOldRole = createMockRole({ id: 'old-role', position: 3 });
      const mockNewRole = createMockRole({ id: 'new-role', position: 5 });
      const mockGuild = createMockGuild();
      (mockGuild.roles.fetch as jest.Mock)
        .mockResolvedValueOnce(mockOldRole)
        .mockResolvedValueOnce(mockNewRole);

      const result = await canBotManageCampaignRoles(mockGuild as never, 'old-role', 'new-role');

      expect(result.canManage).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return false with old role error when old role check fails', async () => {
      const mockGuild = createMockGuild();
      (mockGuild.roles.fetch as jest.Mock).mockResolvedValue(null);

      const result = await canBotManageCampaignRoles(mockGuild as never, 'old-role', 'new-role');

      expect(result.canManage).toBe(false);
      expect(result.error).toContain('Ancien role:');
    });

    it('should return false with new role error when new role check fails', async () => {
      const mockOldRole = createMockRole({ id: 'old-role', position: 3 });
      const mockGuild = createMockGuild();
      (mockGuild.roles.fetch as jest.Mock)
        .mockResolvedValueOnce(mockOldRole)
        .mockResolvedValueOnce(null);

      const result = await canBotManageCampaignRoles(mockGuild as never, 'old-role', 'new-role');

      expect(result.canManage).toBe(false);
      expect(result.error).toContain('Nouveau role:');
    });
  });

  describe('canBotWriteToChannel', () => {
    it('should return true with channel when bot can write', async () => {
      const mockChannel = createMockChannel();
      const mockGuild = createMockGuild();
      (mockGuild.channels.fetch as jest.Mock).mockResolvedValue(mockChannel);

      const result = await canBotWriteToChannel(mockGuild as never, 'channel-123');

      expect(result.canUse).toBe(true);
      expect(result.channel).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return false when bot member not found', async () => {
      const mockGuild = createMockGuild({ members: { me: null } });

      const result = await canBotWriteToChannel(mockGuild as never, 'channel-123');

      expect(result.canUse).toBe(false);
      expect(result.error).toBe('Impossible de trouver le bot sur le serveur.');
    });

    it('should return false when channel fetch throws', async () => {
      const mockGuild = createMockGuild();
      (mockGuild.channels.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await canBotWriteToChannel(mockGuild as never, 'channel-123');

      expect(result.canUse).toBe(false);
      expect(result.error).toBe('Impossible de recuperer le salon.');
    });

    it('should return false when channel not found', async () => {
      const mockGuild = createMockGuild();
      (mockGuild.channels.fetch as jest.Mock).mockResolvedValue(null);

      const result = await canBotWriteToChannel(mockGuild as never, 'channel-123');

      expect(result.canUse).toBe(false);
      expect(result.error).toBe('Salon introuvable ou supprime.');
    });

    it('should return false when channel is not text-based', async () => {
      const mockChannel = createMockChannel({ isTextBased: () => false });
      const mockGuild = createMockGuild();
      (mockGuild.channels.fetch as jest.Mock).mockResolvedValue(mockChannel);

      const result = await canBotWriteToChannel(mockGuild as never, 'channel-123');

      expect(result.canUse).toBe(false);
      expect(result.error).toBe('Ce salon n\'est pas un salon textuel.');
    });

    it('should return false when channel is DM-based', async () => {
      const mockChannel = createMockChannel({ isDMBased: () => true });
      const mockGuild = createMockGuild();
      (mockGuild.channels.fetch as jest.Mock).mockResolvedValue(mockChannel);

      const result = await canBotWriteToChannel(mockGuild as never, 'channel-123');

      expect(result.canUse).toBe(false);
      expect(result.error).toBe('Ce salon n\'est pas un salon textuel.');
    });

    it('should return false when permissions cannot be determined', async () => {
      const mockChannel = createMockChannel({ permissionsFor: () => null });
      const mockGuild = createMockGuild();
      (mockGuild.channels.fetch as jest.Mock).mockResolvedValue(mockChannel);

      const result = await canBotWriteToChannel(mockGuild as never, 'channel-123');

      expect(result.canUse).toBe(false);
      expect(result.error).toBe('Impossible de verifier les permissions du bot.');
    });

    it('should return false when bot cannot view channel', async () => {
      const mockChannel = createMockChannel();
      (mockChannel.permissionsFor as jest.Mock).mockReturnValue({
        has: jest.fn().mockImplementation((perm) => {
          if (perm === PermissionFlagsBits.ViewChannel) return false;
          return true;
        }),
      });
      const mockGuild = createMockGuild();
      (mockGuild.channels.fetch as jest.Mock).mockResolvedValue(mockChannel);

      const result = await canBotWriteToChannel(mockGuild as never, 'channel-123');

      expect(result.canUse).toBe(false);
      expect(result.error).toContain('ne peut pas voir');
    });

    it('should return false when bot cannot send messages', async () => {
      const mockChannel = createMockChannel();
      (mockChannel.permissionsFor as jest.Mock).mockReturnValue({
        has: jest.fn().mockImplementation((perm) => {
          if (perm === PermissionFlagsBits.SendMessages) return false;
          return true;
        }),
      });
      const mockGuild = createMockGuild();
      (mockGuild.channels.fetch as jest.Mock).mockResolvedValue(mockChannel);

      const result = await canBotWriteToChannel(mockGuild as never, 'channel-123');

      expect(result.canUse).toBe(false);
      expect(result.error).toContain('ne peut pas envoyer');
    });

    it('should check permissions in correct order (ViewChannel before SendMessages)', async () => {
      const mockChannel = createMockChannel();
      const hasPermission = jest.fn().mockReturnValue(true);
      (mockChannel.permissionsFor as jest.Mock).mockReturnValue({ has: hasPermission });
      const mockGuild = createMockGuild();
      (mockGuild.channels.fetch as jest.Mock).mockResolvedValue(mockChannel);

      await canBotWriteToChannel(mockGuild as never, 'channel-123');

      expect(hasPermission).toHaveBeenCalledWith(PermissionFlagsBits.ViewChannel);
      expect(hasPermission).toHaveBeenCalledWith(PermissionFlagsBits.SendMessages);
    });
  });
});
