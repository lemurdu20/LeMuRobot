import { REST, Routes } from 'discord.js';
import { BOT_CONFIG } from './config';
import { commands } from './commands';

const rest = new REST().setToken(BOT_CONFIG.token);

async function deployCommands(): Promise<void> {
  try {
    console.log('[DEPLOY] Deploiement des commandes slash...');

    const commandsData = commands.map(c => c.data.toJSON());

    await rest.put(
      Routes.applicationGuildCommands(BOT_CONFIG.clientId, BOT_CONFIG.guildId),
      { body: commandsData }
    );

    console.log('[DEPLOY] Commandes deployees avec succes !');
  } catch (error) {
    // Log sans stack trace sensible
    console.error('[DEPLOY] Erreur deploiement:', error instanceof Error ? error.message : 'Erreur inconnue');
    process.exit(1);
  }
}

deployCommands();
