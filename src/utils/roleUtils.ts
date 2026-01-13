import { Guild, GuildChannel, PermissionFlagsBits, TextChannel } from 'discord.js';

export interface RoleCheckResult {
  canManage: boolean;
  error?: string;
}

export interface ChannelCheckResult {
  canUse: boolean;
  channel?: TextChannel;
  error?: string;
}

/**
 * Verifie si le bot peut gerer un role donne
 */
export async function canBotManageRole(guild: Guild, roleId: string): Promise<RoleCheckResult> {
  const botMember = guild.members.me;

  if (!botMember) {
    return { canManage: false, error: 'Impossible de trouver le bot sur le serveur.' };
  }

  const role = await guild.roles.fetch(roleId);

  if (!role) {
    return { canManage: false, error: 'Role introuvable.' };
  }

  // Verifier si le bot a la permission de gerer les roles
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { canManage: false, error: 'Le bot n\'a pas la permission "Gerer les roles".' };
  }

  // Verifier la hierarchie des roles
  const botHighestRole = botMember.roles.highest;

  if (role.position >= botHighestRole.position) {
    return {
      canManage: false,
      error: `Le role "${role.name}" est au-dessus ou au meme niveau que le role du bot. ` +
        `Deplacez le role du bot au-dessus de "${role.name}" dans les parametres du serveur.`,
    };
  }

  // Verifier si le role est gere par une integration
  if (role.managed) {
    return {
      canManage: false,
      error: `Le role "${role.name}" est gere par une integration et ne peut pas etre modifie.`,
    };
  }

  return { canManage: true };
}

/**
 * Verifie si le bot peut gerer les deux roles d'une campagne
 */
export async function canBotManageCampaignRoles(
  guild: Guild,
  oldRoleId: string,
  newRoleId: string
): Promise<RoleCheckResult> {
  const oldRoleCheck = await canBotManageRole(guild, oldRoleId);
  if (!oldRoleCheck.canManage) {
    return { canManage: false, error: `Ancien role: ${oldRoleCheck.error}` };
  }

  const newRoleCheck = await canBotManageRole(guild, newRoleId);
  if (!newRoleCheck.canManage) {
    return { canManage: false, error: `Nouveau role: ${newRoleCheck.error}` };
  }

  return { canManage: true };
}

/**
 * Verifie si le bot peut ecrire dans un canal et retourne le canal type
 */
export async function canBotWriteToChannel(
  guild: Guild,
  channelId: string
): Promise<ChannelCheckResult> {
  const botMember = guild.members.me;

  if (!botMember) {
    return { canUse: false, error: 'Impossible de trouver le bot sur le serveur.' };
  }

  let channel: GuildChannel | null;
  try {
    channel = await guild.channels.fetch(channelId) as GuildChannel | null;
  } catch {
    return { canUse: false, error: 'Impossible de recuperer le salon.' };
  }

  if (!channel) {
    return { canUse: false, error: 'Salon introuvable ou supprime.' };
  }

  // Verifier que c'est un TextChannel
  if (!channel.isTextBased() || channel.isDMBased()) {
    return { canUse: false, error: 'Ce salon n\'est pas un salon textuel.' };
  }

  // Verifier les permissions
  const permissions = channel.permissionsFor(botMember);

  if (!permissions) {
    return { canUse: false, error: 'Impossible de verifier les permissions du bot.' };
  }

  if (!permissions.has(PermissionFlagsBits.ViewChannel)) {
    return { canUse: false, error: `Le bot ne peut pas voir le salon #${channel.name}.` };
  }

  if (!permissions.has(PermissionFlagsBits.SendMessages)) {
    return { canUse: false, error: `Le bot ne peut pas envoyer de messages dans #${channel.name}.` };
  }

  return { canUse: true, channel: channel as TextChannel };
}
