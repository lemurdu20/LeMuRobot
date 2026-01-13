/**
 * Bot Discord Role - Point d'entrée principal
 *
 * Ce bot gère les campagnes de réinscription pour les associations sportives.
 * Il permet aux membres de confirmer leur réinscription via un bouton Discord.
 *
 * @module index
 * @see {@link ./commands} pour les commandes slash
 * @see {@link ./events} pour les gestionnaires d'événements
 * @see {@link ./config} pour la configuration
 */

import { Client, GatewayIntentBits, Collection, ChatInputCommandInteraction } from 'discord.js';
import { BOT_CONFIG } from './config';
import { registerEvents } from './events';
import { commands } from './commands';
import { stopHeartbeat } from './utils/healthcheck';
import { botLogger as log } from './utils/structuredLogger';

/**
 * Interface représentant une commande slash Discord
 */
interface Command {
  data: { name: string };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

/**
 * Extension du type Client Discord.js pour inclure les commandes
 */
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Charger les commandes
client.commands = new Collection();
for (const command of commands) {
  client.commands.set(command.data.name, command);
}

// Enregistrer les evenements
registerEvents(client);

// Gestion des erreurs et deconnexions Discord
client.on('error', (error) => {
  log.error('Erreur client Discord', error);
});

client.on('warn', (warning) => {
  log.warn('Avertissement Discord', { warning });
});

client.on('shardError', (error, shardId) => {
  log.error('Erreur shard', error, { shardId });
});

client.on('shardDisconnect', (event, shardId) => {
  log.warn('Shard deconnecte', { shardId, code: event.code });
});

client.on('shardReconnecting', (shardId) => {
  log.info('Shard reconnexion en cours', { shardId });
});

client.on('shardResume', (shardId, replayedEvents) => {
  log.info('Shard reconnecte', { shardId, replayedEvents });
});

/**
 * Arrête proprement le bot Discord
 * - Stoppe le heartbeat pour le healthcheck Docker
 * - Détruit la connexion Discord
 * - Force l'arrêt après 2 secondes si nécessaire
 *
 * @param signal - Signal reçu (SIGINT ou SIGTERM)
 */
async function shutdown(signal: string): Promise<void> {
  log.info('Arret', { signal });
  stopHeartbeat();

  try {
    client.destroy();
    log.info('Deconnecte');
    process.exit(0);
  } catch (error) {
    log.error('Erreur lors de la deconnexion', error);
    // Force exit après 2 secondes si erreur
    setTimeout(() => {
      log.info('Force exit');
      process.exit(1);
    }, 2000).unref();
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Connexion
client.login(BOT_CONFIG.token);
