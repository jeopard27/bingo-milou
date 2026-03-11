/**
 * BINGO MILOU — API Routes Principales
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('./auth');
const { Users, Grilles, Transactions, Jackpot, Config, verifierGagnant } = require('./database');
const Emails = require('./email');

// ---- PUBLIC ----

// GET /api/jackpot — Info jackpot en temps réel
router.get('/jackpot', (req, res) => {
  const j = Jackpot.get();
  const cfg = Config.get();
  res.json({
    montant: j.montant,
    tiragesSansGagnant: j.tiragesSansGagnant,
    totalGrillesVendues: j.totalGrillesVendues,
    prochainTirage: cfg.prochainTirage,
    tirageNumero: cfg.tirageNumero,
  });
});

// ---- PROTÉGÉES ----

// GET /api/grilles — Mes grilles
router.get('/grilles', authMiddleware, (req, res) => {
  const grilles = Grilles.findByUser(req.user.id);
  const cfg = Config.get();
  res.json({ grilles, tirageActuel: cfg.tirageNumero });
});

// GET /api/grilles/:id — Détail d'une grille
router.get('/grilles/:id', authMiddleware, (req, res) => {
  const grille = Grilles.findById(req.params.id);
  if (!grille || grille.userId !== req.user.id)
    return res.status(404).json({ error: 'Grille introuvable' });
  res.json(grille);
});

// GET /api/transactions — Historique des achats
router.get('/transactions', authMiddleware, (req, res) => {
  const transactions = Transactions.findByUser(req.user.id);
  res.json({ transactions });
});

// POST /api/retrait — Demander un retrait
router.post('/retrait', authMiddleware, async (req, res) => {
  try {
    const { montant, iban, titulaire } = req.body;
    const user = req.user;

    if (!montant || montant <= 0) return res.status(400).json({ error: 'Montant invalide' });
    if (montant > user.solde) return res.status(400).json({ error: 'Solde insuffisant' });
    if (!iban || !titulaire) return res.status(400).json({ error: 'IBAN et titulaire requis' });

    // Déduire du solde
    Users.update(user.id, { solde: user.solde - montant });

    const tx = Transactions.create({
      id: uuidv4(),
      userId: user.id,
      type: 'retrait',
      montant,
      statut: 'en_cours',
      metadata: { iban: iban.replace(/\s/g,'').slice(-4).padStart(iban.length, '*'), titulaire }
    });

    try { await Emails.notificationRetrait(user, montant); } catch {}

    res.json({ success: true, transactionId: tx.id, message: 'Retrait en cours de traitement (3-5 jours ouvrés)' });
  } catch (err) {
    console.error('Retrait error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ================================================================
//  TIRAGE (Admin ou automatisé)
// ================================================================

// POST /api/tirage/lancer — Lancer un tirage (admin seulement)
router.post('/tirage/lancer', authMiddleware, async (req, res) => {
  try {
    const { adminKey, tirageNumero } = req.body;

    // Vérification admin simple (en prod, utilisez un vrai système RBAC)
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const cfg = Config.get();
    const numTirage = tirageNumero || cfg.tirageNumero;
    const jackpotDepart = Jackpot.getMontant();

    // Générer 25 boules aléatoires parmi 1-99
    const pool = Array.from({ length: 99 }, (_, i) => i + 1);
    const boules = [];
    while (boules.length < 25) {
      const idx = Math.floor(Math.random() * pool.length);
      boules.push(pool.splice(idx, 1)[0]);
    }
    boules.sort((a, b) => a - b);

    // Trouver les grilles gagnantes
    const grillesEnJeu = Grilles.findPendingByTirage(numTirage);
    const gagnantes = [];

    for (const grille of grillesEnJeu) {
      const numerosCoches = grille.numeros.filter(n => boules.includes(n));
      const estGagnant = verifierGagnant(grille.numeros, boules);

      Grilles.update(grille.id, {
        statut: estGagnant ? 'gagnant' : 'perdu',
        numerosCoches,
        boulestireees: boules,
      });

      if (estGagnant) gagnantes.push(grille);
    }

    // Répartition jackpot si gagnants
    let montantParGagnant = 0;
    if (gagnantes.length > 0) {
      montantParGagnant = Math.floor(jackpotDepart / gagnantes.length * 100) / 100;
      for (const g of gagnantes) {
        const user = Users.findById(g.userId);
        if (user) {
          Users.update(user.id, {
            solde: user.solde + montantParGagnant,
            gainsTotaux: user.gainsTotaux + montantParGagnant,
          });
          Transactions.create({
            id: uuidv4(), userId: user.id, type: 'gain_jackpot',
            montant: montantParGagnant, statut: 'complete',
            metadata: { tirageNumero: numTirage, grilleId: g.id }
          });
          gagnantes.find(gg => gg.id === g.id).montantGagne = montantParGagnant;
        }
      }
      // Réinitialiser jackpot
      Jackpot.update({ montant: 0, tiragesSansGagnant: 0 });
    } else {
      // Pas de gagnant — incrémenter le compteur
      const j = Jackpot.get();
      Jackpot.update({ tiragesSansGagnant: (j.tiragesSansGagnant || 0) + 1 });
    }

    // Incrémenter le numéro de tirage
    Config.update({ tirageNumero: numTirage + 1 });

    // Notifier les joueurs par email (async)
    const usersNotifies = new Set();
    for (const grille of grillesEnJeu) {
      if (usersNotifies.has(grille.userId)) continue;
      usersNotifies.add(grille.userId);
      const user = Users.findById(grille.userId);
      if (!user) continue;
      const mesGrilles = grillesEnJeu.filter(g => g.userId === grille.userId);
      const mesGagnantes = gagnantes.filter(g => g.userId === grille.userId);
      try {
        await Emails.resultatTirage(user, mesGrilles, boules, mesGagnantes);
      } catch (e) {
        console.warn('Email résultat non envoyé:', e.message);
      }
    }

    res.json({
      success: true,
      tirageNumero: numTirage,
      boules,
      grillesEnJeu: grillesEnJeu.length,
      gagnantes: gagnantes.length,
      jackpotDepart,
      montantParGagnant,
    });
  } catch (err) {
    console.error('Tirage error:', err);
    res.status(500).json({ error: 'Erreur lors du tirage' });
  }
});

// GET /api/tirage/dernier — Résultat du dernier tirage
router.get('/tirage/dernier', (req, res) => {
  const cfg = Config.get();
  res.json({ tirageNumero: cfg.tirageNumero, prochainTirage: cfg.prochainTirage });
});

// GET /api/stats — Statistiques globales (public)
router.get('/stats', (req, res) => {
  const j = Jackpot.get();
  const cfg = Config.get();
  res.json({
    jackpot: j.montant,
    tiragesSansGagnant: j.tiragesSansGagnant,
    totalGrillesVendues: j.totalGrillesVendues,
    prochainTirage: cfg.prochainTirage,
    tirageNumero: cfg.tirageNumero,
    prixGrille: cfg.prixPack1,
    partJackpot: cfg.partJackpot,
  });
});
router.delete('/admin/reset-users', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Interdit' });
  const db = require('./database').getDB();
  db.data.users = [];
  db.data.grilles = [];
  db.data.transactions = [];
  db.write();
  res.json({ ok: true, message: 'Base nettoyée !' });
});

module.exports = router;
