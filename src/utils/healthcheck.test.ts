import * as fs from 'fs';
import * as path from 'path';
import { startHeartbeat, stopHeartbeat, checkHealth } from './healthcheck';

// Mock fs module
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('healthcheck', () => {
  const HEARTBEAT_FILE = path.join(process.cwd(), 'data', '.heartbeat');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Stop any running heartbeat from previous tests
    stopHeartbeat();
  });

  afterEach(() => {
    stopHeartbeat();
    jest.useRealTimers();
  });

  describe('startHeartbeat', () => {
    it('should write heartbeat file immediately', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {});

      startHeartbeat();

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        HEARTBEAT_FILE,
        expect.any(String)
      );
    });

    it('should create data directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.writeFileSync.mockImplementation(() => {});

      startHeartbeat();

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        path.dirname(HEARTBEAT_FILE),
        { recursive: true }
      );
    });

    it('should write heartbeat periodically', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {});

      startHeartbeat();

      // Initial write
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);

      // Advance 30 seconds
      jest.advanceTimersByTime(30000);
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2);

      // Advance another 30 seconds
      jest.advanceTimersByTime(30000);
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(3);
    });

    it('should clear previous interval when called multiple times', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {});

      startHeartbeat();
      startHeartbeat();

      // Should only have 2 initial writes, not accumulating intervals
      jest.advanceTimersByTime(30000);
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(3); // 2 initial + 1 interval
    });

    it('should handle write errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Write error');
      });

      // Should not throw
      expect(() => startHeartbeat()).not.toThrow();
    });
  });

  describe('stopHeartbeat', () => {
    it('should clear the interval', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});

      startHeartbeat();
      stopHeartbeat();

      const writeCountAfterStop = mockFs.writeFileSync.mock.calls.length;

      // Advance time - should not write anymore
      jest.advanceTimersByTime(60000);
      expect(mockFs.writeFileSync.mock.calls.length).toBe(writeCountAfterStop);
    });

    it('should delete heartbeat file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockImplementation(() => {});

      stopHeartbeat();

      expect(mockFs.unlinkSync).toHaveBeenCalledWith(HEARTBEAT_FILE);
    });

    it('should not throw if heartbeat file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => stopHeartbeat()).not.toThrow();
    });

    it('should handle delete errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('Delete error');
      });

      expect(() => stopHeartbeat()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => {
        stopHeartbeat();
        stopHeartbeat();
        stopHeartbeat();
      }).not.toThrow();
    });
  });

  describe('checkHealth', () => {
    it('should return true for recent heartbeat', () => {
      const recentTimestamp = Date.now().toString();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(recentTimestamp);

      expect(checkHealth()).toBe(true);
    });

    it('should return false for old heartbeat', () => {
      const oldTimestamp = (Date.now() - 120000).toString(); // 2 minutes ago
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(oldTimestamp);

      expect(checkHealth()).toBe(false);
    });

    it('should return false if heartbeat file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(checkHealth()).toBe(false);
    });

    it('should return false on read error', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      expect(checkHealth()).toBe(false);
    });

    it('should return false for invalid timestamp', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid');

      // NaN timestamp should result in false
      expect(checkHealth()).toBe(false);
    });

    it('should return true for heartbeat exactly at threshold', () => {
      // 59 seconds ago (just under 60 second threshold)
      const timestamp = (Date.now() - 59000).toString();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(timestamp);

      expect(checkHealth()).toBe(true);
    });

    it('should return false for heartbeat just over threshold', () => {
      // 61 seconds ago (just over 60 second threshold)
      const timestamp = (Date.now() - 61000).toString();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(timestamp);

      expect(checkHealth()).toBe(false);
    });
  });
});
