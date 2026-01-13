/**
 * Tests pour config.ts
 * Note: Ces tests testent les fonctions de gestion de donnees
 */

import * as fs from 'fs';
import * as path from 'path';

// Set env BEFORE any imports
process.env.DISCORD_TOKEN = 'test-token';
process.env.GUILD_ID = 'test-guild-id';
process.env.CLIENT_ID = 'test-client-id';

// Mock fs
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

// Import after env setup
import {
  getGuildConfig,
  setGuildConfig,
  getCampaign,
  setCampaign,
  addResubscribedMember,
  getLastRelanceAt,
  setLastRelanceAt,
  getAllGuildsWithCampaigns,
  invalidateCache,
} from './config';

describe('config', () => {
  const DATA_DIR = path.join(process.cwd(), 'data');

  beforeEach(() => {
    jest.clearAllMocks();
    // Invalider le cache avant chaque test
    invalidateCache();
    // Default: fichier existe mais vide
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('{"guilds":{}}');
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.copyFileSync.mockImplementation(() => {});
    mockFs.unlinkSync.mockImplementation(() => {});
    mockFs.renameSync.mockImplementation(() => {});
  });

  describe('getGuildConfig', () => {
    it('should return empty config for new guild', () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{}}');

      const config = getGuildConfig('new-guild');

      expect(config).toEqual({});
    });

    it('should return existing config for guild', () => {
      const existingData = {
        guilds: {
          'test-guild': {
            logChannelId: 'log-channel-123',
          },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingData));

      const config = getGuildConfig('test-guild');

      expect(config.logChannelId).toBe('log-channel-123');
    });

    it('should handle missing data file', () => {
      mockFs.existsSync.mockReturnValue(false);

      const config = getGuildConfig('test-guild');

      expect(config).toEqual({});
    });

    it('should handle corrupted JSON and return empty', () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('JSON parse error');
      });
      mockFs.existsSync.mockImplementation((p) => {
        // No backups
        if (String(p).includes('.backup')) return false;
        return true;
      });

      const config = getGuildConfig('test-guild');

      expect(config).toEqual({});
    });

    it('should restore from backup on error', () => {
      const backupData = {
        guilds: {
          'test-guild': { logChannelId: 'backup-channel' },
        },
      };

      let callCount = 0;
      mockFs.readFileSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Read error');
        }
        return JSON.stringify(backupData);
      });

      mockFs.existsSync.mockReturnValue(true);

      const config = getGuildConfig('test-guild');

      expect(config.logChannelId).toBe('backup-channel');
    });
  });

  describe('setGuildConfig', () => {
    it('should save config for guild', async () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{}}');

      await setGuildConfig('test-guild', { logChannelId: 'new-channel' });

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const writtenData = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(writtenData.guilds['test-guild'].logChannelId).toBe('new-channel');
    });

    it('should merge with existing config', async () => {
      const existingData = {
        guilds: {
          'test-guild': {
            logChannelId: 'old-channel',
            lastRelanceAt: '2024-01-01',
          },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingData));

      await setGuildConfig('test-guild', { logChannelId: 'new-channel' });

      const writtenData = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(writtenData.guilds['test-guild'].logChannelId).toBe('new-channel');
      expect(writtenData.guilds['test-guild'].lastRelanceAt).toBe('2024-01-01');
    });

    it('should create data directory if not exists', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        if (String(p) === DATA_DIR) return false;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('{"guilds":{}}');

      await setGuildConfig('test-guild', { logChannelId: 'channel' });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(DATA_DIR, { recursive: true });
    });

    it('should create backup before writing', async () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{}}');

      await setGuildConfig('test-guild', { logChannelId: 'channel' });

      // copyFileSync is called for backup
      expect(mockFs.copyFileSync).toHaveBeenCalled();
    });
  });

  describe('getCampaign', () => {
    it('should return undefined if no campaign', () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{"test-guild":{}}}');

      const campaign = getCampaign('test-guild');

      expect(campaign).toBeUndefined();
    });

    it('should return campaign if exists', () => {
      const data = {
        guilds: {
          'test-guild': {
            currentCampaign: {
              oldRoleId: 'old-role',
              newRoleId: 'new-role',
              channelId: 'channel',
              messageId: 'message',
              startedAt: '2024-01-01',
              resubscribedMembers: [],
            },
          },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

      const campaign = getCampaign('test-guild');

      expect(campaign?.oldRoleId).toBe('old-role');
      expect(campaign?.newRoleId).toBe('new-role');
    });
  });

  describe('setCampaign', () => {
    it('should save campaign', async () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{}}');

      await setCampaign('test-guild', {
        oldRoleId: 'old',
        newRoleId: 'new',
        channelId: 'channel',
        messageId: 'msg',
        startedAt: '2024-01-01',
        resubscribedMembers: [],
      });

      expect(mockFs.writeFileSync).toHaveBeenCalled();
      const writtenData = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(writtenData.guilds['test-guild'].currentCampaign).toBeDefined();
    });

    it('should clear campaign when undefined', async () => {
      const existingData = {
        guilds: {
          'test-guild': {
            currentCampaign: {
              oldRoleId: 'old',
              newRoleId: 'new',
              channelId: 'ch',
              messageId: 'msg',
              startedAt: '2024-01-01',
              resubscribedMembers: [],
            },
          },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingData));

      await setCampaign('test-guild', undefined);

      const writtenData = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(writtenData.guilds['test-guild'].currentCampaign).toBeUndefined();
    });
  });

  describe('addResubscribedMember', () => {
    it('should add member to campaign', async () => {
      const data = {
        guilds: {
          'test-guild': {
            currentCampaign: {
              oldRoleId: 'old',
              newRoleId: 'new',
              channelId: 'channel',
              messageId: 'msg',
              startedAt: '2024-01-01',
              resubscribedMembers: [],
            },
          },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

      const result = await addResubscribedMember('test-guild', 'member-123');

      expect(result).toBe(true);
      const writtenData = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      expect(writtenData.guilds['test-guild'].currentCampaign.resubscribedMembers).toContain('member-123');
    });

    it('should return false if member already added', async () => {
      const data = {
        guilds: {
          'test-guild': {
            currentCampaign: {
              oldRoleId: 'old',
              newRoleId: 'new',
              channelId: 'channel',
              messageId: 'msg',
              startedAt: '2024-01-01',
              resubscribedMembers: ['member-123'],
            },
          },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

      const result = await addResubscribedMember('test-guild', 'member-123');

      expect(result).toBe(false);
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should return false if no campaign', async () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{"test-guild":{}}}');

      const result = await addResubscribedMember('test-guild', 'member-123');

      expect(result).toBe(false);
    });

    it('should return false if guild not found', async () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{}}');

      const result = await addResubscribedMember('unknown-guild', 'member-123');

      expect(result).toBe(false);
    });
  });

  describe('getLastRelanceAt', () => {
    it('should return null if no lastRelanceAt', () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{"test-guild":{}}}');

      const result = getLastRelanceAt('test-guild');

      expect(result).toBeNull();
    });

    it('should return Date if lastRelanceAt exists', () => {
      const data = {
        guilds: {
          'test-guild': {
            lastRelanceAt: '2024-01-15T10:30:00.000Z',
          },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

      const result = getLastRelanceAt('test-guild');

      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('setLastRelanceAt', () => {
    it('should save current timestamp', async () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{}}');

      const before = new Date();
      await setLastRelanceAt('test-guild');
      const after = new Date();

      const writtenData = JSON.parse(mockFs.writeFileSync.mock.calls[0][1] as string);
      const savedDate = new Date(writtenData.guilds['test-guild'].lastRelanceAt);

      expect(savedDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(savedDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent writes safely', async () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{}}');

      // Simuler des ecritures concurrentes
      const promises = [
        setGuildConfig('guild-1', { logChannelId: 'channel-1' }),
        setGuildConfig('guild-2', { logChannelId: 'channel-2' }),
        setGuildConfig('guild-3', { logChannelId: 'channel-3' }),
      ];

      await Promise.all(promises);

      // Toutes les ecritures devraient avoir ete effectuees
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(3);
    });

    it('should handle addResubscribedMember concurrent calls', async () => {
      const data = {
        guilds: {
          'test-guild': {
            currentCampaign: {
              oldRoleId: 'old',
              newRoleId: 'new',
              channelId: 'channel',
              messageId: 'msg',
              startedAt: '2024-01-01',
              resubscribedMembers: [],
            },
          },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

      const promises = [
        addResubscribedMember('test-guild', 'member-1'),
        addResubscribedMember('test-guild', 'member-2'),
        addResubscribedMember('test-guild', 'member-3'),
      ];

      const results = await Promise.all(promises);

      // Au moins une devrait reussir
      expect(results.filter(r => r).length).toBeGreaterThan(0);
    });
  });

  describe('getAllGuildsWithCampaigns', () => {
    it('should return empty array when no campaigns exist', () => {
      mockFs.readFileSync.mockReturnValue('{"guilds":{}}');

      const result = getAllGuildsWithCampaigns();

      expect(result).toEqual([]);
    });

    it('should return empty array when guilds exist but no campaigns', () => {
      const data = {
        guilds: {
          'guild-1': { logChannelId: 'channel-1' },
          'guild-2': { logChannelId: 'channel-2' },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

      const result = getAllGuildsWithCampaigns();

      expect(result).toEqual([]);
    });

    it('should return guild IDs with active campaigns', () => {
      const data = {
        guilds: {
          'guild-1': {
            currentCampaign: {
              oldRoleId: 'old',
              newRoleId: 'new',
              channelId: 'channel',
              messageId: 'msg',
              startedAt: '2024-01-01',
              resubscribedMembers: [],
            },
          },
          'guild-2': { logChannelId: 'channel-2' }, // No campaign
          'guild-3': {
            currentCampaign: {
              oldRoleId: 'old2',
              newRoleId: 'new2',
              channelId: 'channel2',
              messageId: 'msg2',
              startedAt: '2024-01-02',
              resubscribedMembers: [],
            },
          },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

      const result = getAllGuildsWithCampaigns();

      expect(result).toHaveLength(2);
      expect(result).toContain('guild-1');
      expect(result).toContain('guild-3');
      expect(result).not.toContain('guild-2');
    });

    it('should return single guild when only one has campaign', () => {
      const data = {
        guilds: {
          'guild-only': {
            currentCampaign: {
              oldRoleId: 'old',
              newRoleId: 'new',
              channelId: 'channel',
              messageId: 'msg',
              startedAt: '2024-01-01',
              resubscribedMembers: [],
            },
          },
        },
      };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(data));

      const result = getAllGuildsWithCampaigns();

      expect(result).toEqual(['guild-only']);
    });
  });
});
