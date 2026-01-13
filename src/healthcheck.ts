/**
 * Script de healthcheck pour Docker
 * Verifie que le bot est connecte et repond
 */

import { checkHealth } from './utils/healthcheck';

const isHealthy = checkHealth();

if (isHealthy) {
  console.log('OK');
  process.exit(0);
} else {
  console.log('UNHEALTHY');
  process.exit(1);
}
