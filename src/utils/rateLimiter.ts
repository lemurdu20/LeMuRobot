/**
 * Rate limiter simple pour les commandes Discord
 * Limite le nombre de commandes par utilisateur
 */

import { RATE_LIMIT_MAX_COMMANDS, RATE_LIMIT_WINDOW_MS } from './constants';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const userLimits = new Map<string, RateLimitEntry>();
const MAX_ENTRIES = 10000; // Limite pour éviter memory leak
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60000; // Cleanup toutes les 60 secondes

/**
 * Verifie si un utilisateur est rate limited
 * @returns true si l'utilisateur peut executer la commande, false sinon
 */
export function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = userLimits.get(userId);

  // Nettoyer les entrees expirees si interval dépassé ou trop d'entrées
  if (now - lastCleanup > CLEANUP_INTERVAL_MS || userLimits.size > MAX_ENTRIES) {
    cleanupExpiredEntries();
    lastCleanup = now;
  }

  if (!entry || now >= entry.resetAt) {
    // Nouvelle fenetre
    userLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX_COMMANDS) {
    // Rate limited
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Incrementer le compteur
  entry.count++;
  return { allowed: true };
}

/**
 * Nettoie les entrees expirees pour eviter les fuites memoire
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [userId, entry] of userLimits.entries()) {
    if (now >= entry.resetAt) {
      userLimits.delete(userId);
    }
  }
}

/**
 * Reset le rate limit pour un utilisateur (utile pour les tests)
 */
export function resetRateLimit(userId: string): void {
  userLimits.delete(userId);
}

/**
 * Reset complet du rate limiter (utile pour les tests)
 */
export function resetAllRateLimits(): void {
  userLimits.clear();
  lastCleanup = Date.now();
}
