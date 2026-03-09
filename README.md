# 🎱 Bingo Milou — Documentation Complète

> **Le bonheur en 20 numéros** — Site de bingo en ligne avec jackpot progressif, paiement Stripe et diffusion YouTube Live.

---

## 📦 Architecture du projet

```
bingo-milou/
├── src/
│   ├── server.js       # Serveur Express principal
│   ├── database.js     # Couche base de données (lowdb JSON)
│   ├── auth.js         # Authentification JWT + routes
│   ├── stripe.js       # Paiement Stripe Checkout
│   ├── api.js          # API principale (grilles, jackpot, tirage)
│   └── email.js        # Emails transactionnels (SMTP)
├── public/
│   ├── index.html      # SPA frontend
│   ├── style.css       # Design chaleureux
│   └── app.js          # Logique frontend (auth, paiement, grilles)
├── database/
│   └── bingo_milou.json  # Base de données (créée automatiquement)
├── .env.example        # Template de configuration
├── .env                # Votre configuration (à créer)
└── package.json
```

---

## 🚀 Installation

### 1. Cloner et installer les dépendances

```bash
git clone <votre-repo>
cd bingo-milou
npm install
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
# Éditez .env avec vos clés
nano .env
```

### 3. Lancer le serveur

```bash
npm start
# → http://localhost:3000
```

---

## ⚙️ Configuration `.env`

### Variables obligatoires

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Clé secrète JWT — générez avec `openssl rand -hex 64` |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe (`sk_test_...` ou `sk_live_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Clé publique Stripe (`pk_test_...` ou `pk_live_...`) |

### Configuration Stripe

1. Créez un compte sur [dashboard.stripe.com](https://dashboard.stripe.com)
2. Récupérez vos clés API dans **Développeurs → Clés API**
3. Pour les webhooks (production) :
   - Allez dans **Développeurs → Webhooks**
   - Ajoutez `https://votre-site.com/api/stripe/webhook`
   - Copiez le `whsec_...` dans `STRIPE_WEBHOOK_SECRET`

### Configuration Email (Gmail)

1. Activez l'authentification à 2 facteurs sur votre compte Google
2. Allez dans **Sécurité → Mots de passe des applications**
3. Générez un mot de passe pour "Mail"
4. Utilisez-le dans `SMTP_PASS`

---

## 🎮 Fonctionnalités

### 👤 Comptes clients
- Inscription avec vérification email
- Connexion sécurisée (JWT httpOnly cookies)
- Modification du profil
- Changement de mot de passe
- Réinitialisation par email
- Historique des transactions

### 🛒 Boutique & Paiement
- 4 packs de grilles (1, 5, 10, 25 grilles)
- **Paiement Stripe Checkout** (CB, Apple Pay, Google Pay, SEPA...)
- Mode démo si Stripe non configuré
- Confirmation par email après achat
- Génération automatique des grilles (20 numéros aléatoires sur 99)

### 🏆 Jackpot Progressif
- 60% de chaque mise ajouté au jackpot
- 40% pour les frais opérationnels
- Accumulation de tirage en tirage jusqu'au gagnant
- Mise à jour en temps réel

### 🎬 Tirage
- Simulateur interactif (balle par balle ou automatique)
- Détection automatique du gagnant
- Notification email des résultats à tous les joueurs
- Versement automatique du jackpot au(x) gagnant(s)

### 💸 Retraits
- Demande de retrait via IBAN
- Email de confirmation
- Traitement sous 3-5 jours ouvrés

---

## 🔌 API Endpoints

### Auth
```
POST /api/auth/register     — Créer un compte
POST /api/auth/login        — Se connecter
POST /api/auth/logout       — Se déconnecter
GET  /api/auth/me           — Profil utilisateur
PUT  /api/auth/profile      — Modifier le profil
PUT  /api/auth/password     — Changer le mot de passe
POST /api/auth/forgot-password — Mot de passe oublié
GET  /api/auth/verify-email — Vérifier l'email (lien)
```

### Stripe
```
POST /api/stripe/checkout       — Créer session paiement
POST /api/stripe/webhook        — Événements Stripe (webhook)
GET  /api/stripe/success        — Confirmer paiement
POST /api/stripe/demo-success   — Mode démo
GET  /api/stripe/packs          — Liste des packs
```

### Données
```
GET  /api/jackpot           — Info jackpot (public)
GET  /api/stats             — Statistiques globales (public)
GET  /api/grilles           — Mes grilles (auth)
GET  /api/transactions      — Mon historique (auth)
POST /api/retrait           — Demander un retrait (auth)
POST /api/tirage/lancer     — Lancer un tirage (admin)
```

### Lancer un tirage (admin)

```bash
curl -X POST http://localhost:3000/api/tirage/lancer \
  -H "Content-Type: application/json" \
  -d '{"adminKey": "votre_ADMIN_KEY", "tirageNumero": 48}'
```

Ajoutez `ADMIN_KEY=votre_cle_admin_secrete` dans `.env`

---

## 🌐 Déploiement en Production

### Option 1 : VPS (Nginx + PM2)

```bash
# Installer PM2
npm install -g pm2

# Démarrer avec PM2
pm2 start src/server.js --name bingo-milou
pm2 save
pm2 startup

# Nginx reverse proxy
server {
    listen 80;
    server_name votre-domaine.fr;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option 2 : Railway / Render / Fly.io

```bash
# Railway
railway login
railway init
railway up

# Variables d'env à configurer dans le dashboard
```

### Migrer vers PostgreSQL (production)

Pour une vraie base de données, remplacez `src/database.js` en utilisant **pg** ou **Prisma** :

```bash
npm install pg prisma @prisma/client
```

---

## 🔒 Sécurité

- ✅ Mots de passe hashés (bcrypt, 12 rounds)
- ✅ Tokens JWT httpOnly cookies
- ✅ Rate limiting (200 req/15min général, 20 req/15min auth)
- ✅ Validation des entrées côté serveur
- ✅ Webhook Stripe signé et vérifié
- ✅ Double anti-traitement des paiements
- ⚠️ En production : activez HTTPS, configurez CORS avec votre domaine

---

## 📧 Emails envoyés automatiquement

| Événement | Email |
|-----------|-------|
| Inscription | Email de bienvenue + lien de vérification |
| Achat de grilles | Confirmation avec détail des numéros |
| Résultat tirage | Résultat pour chaque joueur |
| Jackpot gagné | Félicitations + montant |
| Mot de passe oublié | Lien de réinitialisation |
| Retrait | Confirmation de la demande |

---

## 🎯 Règles du jeu

- Chaque grille = **20 numéros** tirés au sort parmi **1 à 99**
- Chaque tirage = **25 boules** tirées aléatoirement
- Pour gagner : **vos 20 numéros doivent tous figurer** dans les 25 boules
- Jackpot : **60%** de chaque mise, cumulé de tirage en tirage
- Probabilité par grille : ~**1 sur 4,5 millions**
- Tirage **chaque samedi à 21h00** sur YouTube

---

*© 2026 Bingo Milou — Le bonheur en 20 numéros ✨*
