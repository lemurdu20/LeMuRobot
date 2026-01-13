/**
 * Systeme de healthcheck pour Docker
 * Ecrit un fichier heartbeat quand le bot est connecte
 */

import * as fs from 'fs';
import * as path from 'path';
import { healthLogger as log } from './structuredLogger';

const HEARTBEAT_FILE = path.join(process.cwd(), 'data', '.heartbeat');
const HEARTBEAT_INTERVAL_MS = 30000; // 30 secondes
const HEARTBEAT_MAX_AGE_MS = 60000; // 60 secondes max

let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Demarre le heartbeat (appele quand le bot est ready)
 */
export function startHeartbeat(): void {
  // Ecrire immediatement
  writeHeartbeat();

  // Puis periodiquement
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  heartbeatInterval = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);

  log.info('Heartbeat demarre');
}

/**
 * Arrete le heartbeat
 */
export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Supprimer le fichier heartbeat
  try {
    if (fs.existsSync(HEARTBEAT_FILE)) {
      fs.unlinkSync(HEARTBEAT_FILE);
    }
  } catch {
    // Ignorer les erreurs de suppression
  }

  log.info('Heartbeat arrete');
}

/**
 * Ecrit le timestamp actuel dans le fichier heartbeat
 */
function writeHeartbeat(): void {
  try {
    const dir = path.dirname(HEARTBEAT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(HEARTBEAT_FILE, Date.now().toString());
  } catch (error) {
    log.error('Erreur ecriture heartbeat', error);
  }
}

/**
 * Verifie si le bot est en bonne sante (pour le script healthcheck)
 */
export function checkHealth(): boolean {
  try {
    if (!fs.existsSync(HEARTBEAT_FILE)) {
      return false;
    }

    const content = fs.readFileSync(HEARTBEAT_FILE, 'utf-8');
    const lastHeartbeat = parseInt(content, 10);
    const age = Date.now() - lastHeartbeat;

    return age < HEARTBEAT_MAX_AGE_MS;
  } catch {
    return false;
  }
}
