import { Client } from 'discord.js';
import { startScheduler } from '../services/scheduler';
import { startHeartbeat } from '../utils/healthcheck';
import { botLogger as log } from '../utils/structuredLogger';

export function handleReady(client: Client<true>): void {
  log.info('Connecte', { tag: client.user.tag, serveurs: client.guilds.cache.size });

  // Demarrer le scheduler pour les campagnes avec timer
  startScheduler(client);

  // Demarrer le heartbeat pour le healthcheck Docker
  startHeartbeat();
}
