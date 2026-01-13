/**
 * Logger structuré pour le bot Discord
 * Produit des logs en JSON en production, lisibles en développement
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  [key: string]: unknown;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function formatLog(entry: LogEntry): string {
  if (IS_PRODUCTION) {
    return JSON.stringify(entry);
  }

  // Format lisible en développement
  const { timestamp, level, module, message, ...extra } = entry;
  const extraStr = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
  return `${timestamp} [${level.toUpperCase()}] [${module}] ${message}${extraStr}`;
}

function createLogEntry(
  level: LogLevel,
  module: string,
  message: string,
  extra?: Record<string, unknown>
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...extra,
  };
}

export function createLogger(module: string) {
  return {
    debug(message: string, extra?: Record<string, unknown>): void {
      if (IS_PRODUCTION) return; // Pas de debug en prod
      console.log(formatLog(createLogEntry('debug', module, message, extra)));
    },

    info(message: string, extra?: Record<string, unknown>): void {
      console.log(formatLog(createLogEntry('info', module, message, extra)));
    },

    warn(message: string, extra?: Record<string, unknown>): void {
      console.warn(formatLog(createLogEntry('warn', module, message, extra)));
    },

    error(message: string, error?: Error | unknown, extra?: Record<string, unknown>): void {
      const errorInfo: Record<string, unknown> = { ...extra };
      if (error instanceof Error) {
        errorInfo.errorMessage = error.message;
        if (!IS_PRODUCTION) {
          errorInfo.stack = error.stack;
        }
      } else if (error !== undefined) {
        errorInfo.errorMessage = String(error);
      }
      console.error(formatLog(createLogEntry('error', module, message, errorInfo)));
    },
  };
}

// Loggers pré-créés pour les modules principaux
export const configLogger = createLogger('CONFIG');
export const schedulerLogger = createLogger('SCHEDULER');
export const healthLogger = createLogger('HEALTH');
export const interactionLogger = createLogger('INTERACTION');
export const roleLogger = createLogger('ROLE');
export const botLogger = createLogger('BOT');
export const campaignLogger = createLogger('CAMPAGNE');
