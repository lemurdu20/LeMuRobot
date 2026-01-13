/**
 * Tests pour ready.ts
 * Gestionnaire d'événement ready Discord
 */

// Set env BEFORE any imports
process.env.DISCORD_TOKEN = 'test-token';
process.env.GUILD_ID = 'test-guild-id';
process.env.CLIENT_ID = 'test-client-id';

// Mock dependencies
jest.mock('../services/scheduler', () => ({
  startScheduler: jest.fn(),
}));

jest.mock('../utils/healthcheck', () => ({
  startHeartbeat: jest.fn(),
}));

jest.mock('../utils/structuredLogger', () => ({
  botLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { handleReady } from './ready';
import { startScheduler } from '../services/scheduler';
import { startHeartbeat } from '../utils/healthcheck';
import { botLogger } from '../utils/structuredLogger';

const mockStartScheduler = startScheduler as jest.Mock;
const mockStartHeartbeat = startHeartbeat as jest.Mock;
const mockLog = botLogger as jest.Mocked<typeof botLogger>;

describe('ready event', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createMockClient() {
    return {
      user: {
        tag: 'TestBot#1234',
      },
      guilds: {
        cache: {
          size: 5,
        },
      },
    };
  }

  describe('handleReady', () => {
    it('should log connection info', () => {
      const mockClient = createMockClient();

      handleReady(mockClient as never);

      expect(mockLog.info).toHaveBeenCalledWith('Connecte', {
        tag: 'TestBot#1234',
        serveurs: 5,
      });
    });

    it('should start the scheduler', () => {
      const mockClient = createMockClient();

      handleReady(mockClient as never);

      expect(mockStartScheduler).toHaveBeenCalledWith(mockClient);
    });

    it('should start the heartbeat', () => {
      const mockClient = createMockClient();

      handleReady(mockClient as never);

      expect(mockStartHeartbeat).toHaveBeenCalled();
    });

    it('should call all startup functions in order', () => {
      const mockClient = createMockClient();
      const callOrder: string[] = [];

      mockLog.info.mockImplementation(() => {
        callOrder.push('log');
      });
      mockStartScheduler.mockImplementation(() => {
        callOrder.push('scheduler');
      });
      mockStartHeartbeat.mockImplementation(() => {
        callOrder.push('heartbeat');
      });

      handleReady(mockClient as never);

      expect(callOrder).toEqual(['log', 'scheduler', 'heartbeat']);
    });

    it('should handle client with zero guilds', () => {
      const mockClient = {
        user: { tag: 'TestBot#1234' },
        guilds: { cache: { size: 0 } },
      };

      handleReady(mockClient as never);

      expect(mockLog.info).toHaveBeenCalledWith('Connecte', {
        tag: 'TestBot#1234',
        serveurs: 0,
      });
    });

    it('should handle client with many guilds', () => {
      const mockClient = {
        user: { tag: 'TestBot#1234' },
        guilds: { cache: { size: 1000 } },
      };

      handleReady(mockClient as never);

      expect(mockLog.info).toHaveBeenCalledWith('Connecte', {
        tag: 'TestBot#1234',
        serveurs: 1000,
      });
    });
  });
});
