import {
  DISCORD_EMBED_DESCRIPTION_LIMIT,
  DISCORD_MESSAGE_LIMIT,
  DISCORD_MENTION_LENGTH,
  RATE_LIMIT_MAX_COMMANDS,
  RATE_LIMIT_WINDOW_MS,
  SCHEDULER_CHECK_INTERVAL_MS,
  RELANCE_COOLDOWN_MS,
  RELANCE_MAX_MENTIONS_PER_MESSAGE,
  RELANCE_DELAY_BETWEEN_MESSAGES_MS,
  CAMPAIGN_MAX_DURATION_DAYS,
  CAMPAIGN_CUSTOM_MESSAGE_MAX_LENGTH,
} from './constants';

describe('constants', () => {
  describe('Discord limits', () => {
    it('should have valid embed description limit', () => {
      expect(DISCORD_EMBED_DESCRIPTION_LIMIT).toBe(4000);
      expect(DISCORD_EMBED_DESCRIPTION_LIMIT).toBeLessThanOrEqual(4096); // Discord actual limit
    });

    it('should have valid message limit', () => {
      expect(DISCORD_MESSAGE_LIMIT).toBe(2000);
    });

    it('should have valid mention length', () => {
      // Format: <@123456789012345678> = 22 chars with space
      expect(DISCORD_MENTION_LENGTH).toBe(22);
    });
  });

  describe('Rate limiting', () => {
    it('should have reasonable rate limit values', () => {
      expect(RATE_LIMIT_MAX_COMMANDS).toBeGreaterThan(0);
      expect(RATE_LIMIT_MAX_COMMANDS).toBeLessThanOrEqual(20);
      expect(RATE_LIMIT_WINDOW_MS).toBeGreaterThan(0);
    });
  });

  describe('Scheduler', () => {
    it('should check at reasonable intervals', () => {
      expect(SCHEDULER_CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(30000); // Min 30s
      expect(SCHEDULER_CHECK_INTERVAL_MS).toBeLessThanOrEqual(300000); // Max 5min
    });
  });

  describe('Relance', () => {
    it('should have cooldown to prevent spam', () => {
      expect(RELANCE_COOLDOWN_MS).toBeGreaterThanOrEqual(60000); // Min 1min
    });

    it('should limit mentions per message', () => {
      expect(RELANCE_MAX_MENTIONS_PER_MESSAGE).toBeGreaterThan(0);
      expect(RELANCE_MAX_MENTIONS_PER_MESSAGE).toBeLessThanOrEqual(50);
    });

    it('should have delay between messages', () => {
      expect(RELANCE_DELAY_BETWEEN_MESSAGES_MS).toBeGreaterThanOrEqual(500);
    });
  });

  describe('Campaign', () => {
    it('should have reasonable max duration', () => {
      expect(CAMPAIGN_MAX_DURATION_DAYS).toBeGreaterThan(0);
      expect(CAMPAIGN_MAX_DURATION_DAYS).toBeLessThanOrEqual(365);
    });

    it('should limit custom message length', () => {
      expect(CAMPAIGN_CUSTOM_MESSAGE_MAX_LENGTH).toBeGreaterThan(0);
      expect(CAMPAIGN_CUSTOM_MESSAGE_MAX_LENGTH).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT);
    });
  });
});
