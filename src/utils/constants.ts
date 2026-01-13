/**
 * Constantes partagees dans l'application
 */

// Discord limits
export const DISCORD_EMBED_DESCRIPTION_LIMIT = 4000;
export const DISCORD_MESSAGE_LIMIT = 2000;
export const DISCORD_MENTION_LENGTH = 22; // "<@123456789012345678> "

// Rate limiting
export const RATE_LIMIT_MAX_COMMANDS = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// Scheduler
export const SCHEDULER_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

// Relance
export const RELANCE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
export const RELANCE_MAX_MENTIONS_PER_MESSAGE = 20;
export const RELANCE_DELAY_BETWEEN_MESSAGES_MS = 1000;

// Campaign
export const CAMPAIGN_MAX_DURATION_DAYS = 90;
export const CAMPAIGN_CUSTOM_MESSAGE_MAX_LENGTH = 500;

// Button IDs
export const BUTTON_ID_RESUBSCRIBE = 'resubscribe';
export const BUTTON_ID_STATUS_RESUBSCRIBED = 'status_resubscribed';
export const BUTTON_ID_STATUS_MISSING = 'status_missing';
