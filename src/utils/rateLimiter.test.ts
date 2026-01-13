import { checkRateLimit, resetRateLimit } from './rateLimiter';
import { RATE_LIMIT_MAX_COMMANDS, RATE_LIMIT_WINDOW_MS } from './constants';

describe('rateLimiter', () => {
  beforeEach(() => {
    // Reset rate limits entre chaque test
    resetRateLimit('test-user-1');
    resetRateLimit('test-user-2');
    resetRateLimit('test-user-3');
  });

  describe('checkRateLimit', () => {
    it('should allow first request', () => {
      const result = checkRateLimit('test-user-1');
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow multiple requests within limit', () => {
      // 5 requetes autorisees par defaut
      for (let i = 0; i < RATE_LIMIT_MAX_COMMANDS; i++) {
        const result = checkRateLimit('test-user-1');
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests exceeding limit', () => {
      // Epuiser le rate limit
      for (let i = 0; i < RATE_LIMIT_MAX_COMMANDS; i++) {
        checkRateLimit('test-user-1');
      }

      // Requete suivante bloquee
      const result = checkRateLimit('test-user-1');
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should track users independently', () => {
      // User 1: epuiser le rate limit
      for (let i = 0; i < RATE_LIMIT_MAX_COMMANDS; i++) {
        checkRateLimit('test-user-1');
      }

      // User 1 bloque
      expect(checkRateLimit('test-user-1').allowed).toBe(false);

      // User 2 toujours autorise
      expect(checkRateLimit('test-user-2').allowed).toBe(true);
    });

    it('should return correct retryAfter time', () => {
      // Epuiser le rate limit
      for (let i = 0; i < RATE_LIMIT_MAX_COMMANDS; i++) {
        checkRateLimit('test-user-1');
      }

      const result = checkRateLimit('test-user-1');
      expect(result.allowed).toBe(false);
      // retryAfter devrait etre proche de RATE_LIMIT_WINDOW_MS en secondes
      expect(result.retryAfter).toBeLessThanOrEqual(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should reset after window expires', () => {
      jest.useFakeTimers();

      // Epuiser le rate limit
      for (let i = 0; i < RATE_LIMIT_MAX_COMMANDS; i++) {
        checkRateLimit('test-user-1');
      }

      expect(checkRateLimit('test-user-1').allowed).toBe(false);

      // Avancer le temps au-dela de la fenetre
      jest.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1);

      // Devrait etre autorise a nouveau
      expect(checkRateLimit('test-user-1').allowed).toBe(true);

      jest.useRealTimers();
    });

    it('should handle empty user id', () => {
      const result = checkRateLimit('');
      expect(result.allowed).toBe(true);
    });

    it('should handle special characters in user id', () => {
      const result = checkRateLimit('user-with-special-chars-!@#$%');
      expect(result.allowed).toBe(true);
    });

    it('should handle very long user id', () => {
      const longId = 'x'.repeat(1000);
      const result = checkRateLimit(longId);
      expect(result.allowed).toBe(true);
    });

    it('should increment count correctly', () => {
      // Verifier que chaque appel incremente bien le compteur
      for (let i = 0; i < RATE_LIMIT_MAX_COMMANDS - 1; i++) {
        const result = checkRateLimit('test-user-1');
        expect(result.allowed).toBe(true);
      }

      // Dernier appel autorise
      const lastAllowed = checkRateLimit('test-user-1');
      expect(lastAllowed.allowed).toBe(true);

      // Premier appel bloque
      const firstBlocked = checkRateLimit('test-user-1');
      expect(firstBlocked.allowed).toBe(false);
    });

    it('should handle concurrent users', () => {
      const users = ['user-a', 'user-b', 'user-c', 'user-d', 'user-e'];

      // Chaque user fait des requetes
      for (let round = 0; round < RATE_LIMIT_MAX_COMMANDS; round++) {
        for (const user of users) {
          const result = checkRateLimit(user);
          expect(result.allowed).toBe(true);
        }
      }

      // Tous les users sont maintenant rate limited
      for (const user of users) {
        const result = checkRateLimit(user);
        expect(result.allowed).toBe(false);
      }
    });

    it('should cleanup expired entries probabilistically', () => {
      jest.useFakeTimers();

      // Creer plusieurs entrees
      for (let i = 0; i < 100; i++) {
        checkRateLimit(`cleanup-test-${i}`);
      }

      // Avancer le temps pour expirer les entrees
      jest.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1);

      // Les nouvelles requetes devraient declencher le cleanup (10% chance)
      // Faire plusieurs requetes pour augmenter les chances de cleanup
      for (let i = 0; i < 50; i++) {
        checkRateLimit('cleanup-trigger');
        resetRateLimit('cleanup-trigger');
      }

      jest.useRealTimers();
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for user', () => {
      // Epuiser le rate limit
      for (let i = 0; i < RATE_LIMIT_MAX_COMMANDS; i++) {
        checkRateLimit('test-user-1');
      }
      expect(checkRateLimit('test-user-1').allowed).toBe(false);

      // Reset
      resetRateLimit('test-user-1');

      // Devrait etre autorise a nouveau
      expect(checkRateLimit('test-user-1').allowed).toBe(true);
    });

    it('should not affect other users', () => {
      // Epuiser les deux users
      for (let i = 0; i < RATE_LIMIT_MAX_COMMANDS; i++) {
        checkRateLimit('test-user-1');
        checkRateLimit('test-user-2');
      }

      // Reset seulement user 1
      resetRateLimit('test-user-1');

      expect(checkRateLimit('test-user-1').allowed).toBe(true);
      expect(checkRateLimit('test-user-2').allowed).toBe(false);
    });

    it('should be safe to reset non-existent user', () => {
      expect(() => resetRateLimit('non-existent-user')).not.toThrow();
    });

    it('should be safe to reset multiple times', () => {
      resetRateLimit('test-user-1');
      resetRateLimit('test-user-1');
      resetRateLimit('test-user-1');

      const result = checkRateLimit('test-user-1');
      expect(result.allowed).toBe(true);
    });

    it('should fully reset counter', () => {
      // Faire quelques requetes
      checkRateLimit('test-user-1');
      checkRateLimit('test-user-1');

      // Reset
      resetRateLimit('test-user-1');

      // Devrait avoir le plein quota a nouveau
      for (let i = 0; i < RATE_LIMIT_MAX_COMMANDS; i++) {
        const result = checkRateLimit('test-user-1');
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive calls', () => {
      const results: boolean[] = [];
      for (let i = 0; i < 20; i++) {
        results.push(checkRateLimit('rapid-user').allowed);
      }

      // Les premiers RATE_LIMIT_MAX_COMMANDS devraient passer
      const allowedCount = results.filter(r => r).length;
      expect(allowedCount).toBe(RATE_LIMIT_MAX_COMMANDS);
    });

    it('should handle numeric user ids', () => {
      const result = checkRateLimit('123456789012345678');
      expect(result.allowed).toBe(true);
    });

    it('should handle unicode in user id', () => {
      const result = checkRateLimit('user-émoji-🎉');
      expect(result.allowed).toBe(true);
    });
  });
});
