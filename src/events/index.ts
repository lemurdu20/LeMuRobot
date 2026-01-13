import { Client, Events } from 'discord.js';
import { handleReady } from './ready';
import { handleInteractionCreate } from './interactionCreate';

export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, handleReady);
  client.on(Events.InteractionCreate, handleInteractionCreate);
}
