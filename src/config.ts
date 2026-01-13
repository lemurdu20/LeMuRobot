/**
 * Configuration et persistance des données
 *
 * Ce module gère :
 * - La validation des variables d'environnement
 * - La persistance des données (campagnes, config guild)
 * - Le système de backup avec rotation
 * - La protection contre les race conditions (lock)
 *
 * @module config
 */

import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { configLogger as log } from './utils/structuredLogger';

config();

/**
 * Valide que toutes les variables d'environnement requises sont présentes
 * Arrête le processus si des variables manquent
 */
function validateEnv(): void {
  const required = ['DISCORD_TOKEN', 'GUILD_ID', 'CLIENT_ID'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    log.error('Variables d\'environnement manquantes', undefined, { missing });
    log.error('Copiez .env.example vers .env et remplissez les valeurs');
    process.exit(1);
  }
}

validateEnv();

export const BOT_CONFIG = {
  token: process.env.DISCORD_TOKEN!,
  guildId: process.env.GUILD_ID!,
  clientId: process.env.CLIENT_ID!,
};

// Chemin configurable pour Docker (défaut: ./data/config.json depuis la racine)
const BASE_DIR = process.cwd();
const DATA_DIR = (() => {
  const envDir = process.env.DATA_DIR;
  if (!envDir) {
    return path.join(BASE_DIR, 'data');
  }

  // Securite: valider que DATA_DIR ne permet pas de path traversal
  // Rejeter les chemins absolus (sauf /app pour Docker)
  if (path.isAbsolute(envDir) && !envDir.startsWith('/app/') && envDir !== '/app') {
    log.error('SECURITE: DATA_DIR refuse (chemin absolu)', undefined, { envDir });
    return path.join(BASE_DIR, 'data');
  }

  const resolvedDir = path.resolve(BASE_DIR, envDir);

  // Verifier que le chemin resolu est bien sous BASE_DIR ou /app
  const relativeToBase = path.relative(BASE_DIR, resolvedDir);
  const relativeToApp = path.relative('/app', resolvedDir);

  // Rejeter si le chemin sort du repertoire autorise (commence par ..)
  const isUnderBase = !relativeToBase.startsWith('..') && !path.isAbsolute(relativeToBase);
  const isUnderApp = !relativeToApp.startsWith('..') && !path.isAbsolute(relativeToApp);

  if (!isUnderBase && !isUnderApp) {
    log.error('SECURITE: DATA_DIR refuse (path traversal)', undefined, { envDir, resolvedDir });
    return path.join(BASE_DIR, 'data');
  }

  return resolvedDir;
})();
const DATA_PATH = path.join(DATA_DIR, 'config.json');
const BACKUP_COUNT = 3; // Nombre de backups a conserver

interface GuildConfig {
  logChannelId?: string;
  lastRelanceAt?: string;
  currentCampaign?: {
    oldRoleId: string;
    newRoleId: string;
    channelId: string;
    messageId: string;
    startedAt: string;
    endsAt?: string;
    resubscribedMembers: string[];
  };
}

interface DataStore {
  guilds: Record<string, GuildConfig>;
}

// Système de lock simple pour éviter les race conditions
let isWriting = false;
const writeQueue: Array<() => void> = [];

// Cache en mémoire pour éviter les JSON.parse répétés
let dataCache: DataStore | null = null;
let cacheValid = false;

async function acquireLock(): Promise<void> {
  if (!isWriting) {
    isWriting = true;
    return;
  }

  return new Promise(resolve => {
    writeQueue.push(resolve);
  });
}

function releaseLock(): void {
  const next = writeQueue.shift();
  if (next) {
    next();
  } else {
    isWriting = false;
  }
}

function loadData(): DataStore {
  // Retourner le cache si valide
  if (cacheValid && dataCache) {
    return dataCache;
  }

  try {
    if (fs.existsSync(DATA_PATH)) {
      const data: DataStore = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
      dataCache = data;
      cacheValid = true;
      return data;
    }
  } catch (error) {
    log.error('Erreur lecture config', error);
    // Tenter de restaurer depuis le backup le plus recent
    const restored = tryRestoreFromBackup();
    if (restored) {
      dataCache = restored;
      cacheValid = true;
      return restored;
    }
  }
  const emptyData: DataStore = { guilds: {} };
  dataCache = emptyData;
  cacheValid = true;
  return emptyData;
}

/**
 * Cree un backup du fichier de configuration avec rotation
 */
function createBackup(): void {
  if (!fs.existsSync(DATA_PATH)) {
    return;
  }

  try {
    // Rotation: supprimer le plus ancien si on a atteint la limite
    for (let i = BACKUP_COUNT - 1; i >= 1; i--) {
      const oldBackup = `${DATA_PATH}.backup.${i}`;
      const newBackup = `${DATA_PATH}.backup.${i + 1}`;
      if (fs.existsSync(oldBackup)) {
        if (i === BACKUP_COUNT - 1) {
          fs.unlinkSync(oldBackup); // Supprimer le plus ancien
        } else {
          fs.renameSync(oldBackup, newBackup);
        }
      }
    }

    // Creer le nouveau backup
    fs.copyFileSync(DATA_PATH, `${DATA_PATH}.backup.1`);
  } catch (error) {
    log.error('Erreur creation backup', error);
  }
}

/**
 * Tente de restaurer depuis le backup le plus recent
 */
function tryRestoreFromBackup(): DataStore | null {
  for (let i = 1; i <= BACKUP_COUNT; i++) {
    const backupPath = `${DATA_PATH}.backup.${i}`;
    if (fs.existsSync(backupPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
        log.info('Restauration depuis backup', { backupIndex: i });
        // Restaurer le fichier principal
        fs.copyFileSync(backupPath, DATA_PATH);
        return data;
      } catch {
        log.warn('Backup corrompu, essai suivant', { backupIndex: i });
      }
    }
  }
  return null;
}

function saveData(data: DataStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Creer un backup avant d'ecrire
  createBackup();

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

  // Mettre à jour le cache
  dataCache = data;
  cacheValid = true;
}

export function getGuildConfig(guildId: string): GuildConfig {
  const data = loadData();
  return data.guilds[guildId] || {};
}

export async function setGuildConfig(guildId: string, config: Partial<GuildConfig>): Promise<void> {
  await acquireLock();
  try {
    const data = loadData();
    data.guilds[guildId] = { ...data.guilds[guildId], ...config };
    saveData(data);
  } finally {
    releaseLock();
  }
}

export function getCampaign(guildId: string) {
  return getGuildConfig(guildId).currentCampaign;
}

export async function setCampaign(guildId: string, campaign: GuildConfig['currentCampaign'] | undefined): Promise<void> {
  await setGuildConfig(guildId, { currentCampaign: campaign });
}

export async function addResubscribedMember(guildId: string, memberId: string): Promise<boolean> {
  await acquireLock();
  try {
    const data = loadData();
    const guildData = data.guilds[guildId];

    if (guildData?.currentCampaign) {
      if (!guildData.currentCampaign.resubscribedMembers.includes(memberId)) {
        guildData.currentCampaign.resubscribedMembers.push(memberId);
        saveData(data);
        return true;
      }
    }
    return false;
  } finally {
    releaseLock();
  }
}

// Pour le cooldown de relance
export function getLastRelanceAt(guildId: string): Date | null {
  const config = getGuildConfig(guildId);
  return config.lastRelanceAt ? new Date(config.lastRelanceAt) : null;
}

export async function setLastRelanceAt(guildId: string): Promise<void> {
  await setGuildConfig(guildId, { lastRelanceAt: new Date().toISOString() });
}

// Recuperer tous les guildIds avec une campagne active (pour le scheduler multi-serveur)
export function getAllGuildsWithCampaigns(): string[] {
  const data = loadData();
  return Object.entries(data.guilds)
    .filter(([, config]) => config.currentCampaign !== undefined)
    .map(([guildId]) => guildId);
}

// Re-export depuis constants pour retrocompatibilite
export { RELANCE_COOLDOWN_MS } from './utils/constants';

// Invalider le cache (pour les tests)
export function invalidateCache(): void {
  dataCache = null;
  cacheValid = false;
}
