# LeMuRobot

Bot Discord de l'association d'escalade **Le Mur** pour gérer les campagnes de réinscription des membres.

## Quick Start

```bash
# Installation
npm install

# Configuration
cp .env.example .env
# Éditer .env avec vos tokens

# Déployer les commandes Discord
npm run deploy

# Lancer le bot
npm start
```

## Configuration Discord

### 1. Créer l'application

1. Aller sur https://discord.com/developers/applications
2. Créer une nouvelle application
3. Récupérer le **Client ID** (General Information)

### 2. Configurer le bot

1. Section **Bot** → Add Bot
2. Activer **Server Members Intent** (requis)
3. Récupérer le **Token**

### 3. Inviter le bot

Générer le lien OAuth2 avec :
- Scopes: `bot`, `applications.commands`
- Permissions: `Manage Roles`, `Send Messages`, `Embed Links`

### 4. Variables d'environnement

```env
DISCORD_TOKEN=votre_token
GUILD_ID=id_du_serveur
CLIENT_ID=id_de_lapplication
```

## Commandes Discord

| Commande | Description |
|----------|-------------|
| `/campagne start` | Démarrer une campagne de réinscription |
| `/campagne end` | Terminer la campagne |
| `/campagne status` | Voir le statut |
| `/campagne relance` | Mentionner les retardataires |
| `/config logs` | Configurer le salon de logs |

## Structure du projet

```
src/
├── index.ts              # Point d'entrée
├── config.ts             # Configuration et persistance
├── commands/             # Commandes slash
│   ├── config.ts         # /config
│   └── campagne/         # /campagne (start, end, status, relance)
├── events/               # Gestionnaires d'événements
├── services/             # Logique métier
│   ├── roleManager.ts    # Gestion des rôles
│   └── scheduler.ts      # Timer campagnes
└── utils/                # Utilitaires
```

## Scripts NPM

| Script | Description |
|--------|-------------|
| `npm start` | Lancer le bot |
| `npm run dev` | Mode développement |
| `npm run build` | Compiler TypeScript |
| `npm run deploy` | Déployer commandes Discord |
| `npm test` | Lancer les tests (91) |
| `npm run lint` | Vérifier le code |

## Docker

```bash
docker-compose up -d
```

**Image**: 148MB, node:20.18-alpine, non-root, read-only filesystem

## Tests

```bash
npm test              # 91 tests
npm run test:coverage # Avec couverture
```

## Licence

ISC
