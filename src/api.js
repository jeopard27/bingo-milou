/**
 * BINGO MILOU — API Routes Principales
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('./auth');
const { db } = require('./database');
const { Users, Grilles, Transactions, Jackpot, Config, verifierGagnant } = require('./database');
const Emails = require('./email');

// ── Calcule dynamiquement le prochain samedi à 21h00 ─────────────────────
function getProchainTirage() {
  const now = new Date();
  const day = now.getDay();
  const next = new Date(now);
  if (day === 6 && now.getHours() < 21) {
    // ce soir
  } else {
    const daysUntilSat = day === 6 ? 7 : (6 - day + 7) % 7;
    next.setDate(now.getDate() + daysUntilSat);
  }
  next.setHours(21, 0, 0, 0);
  const dateStr = next.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  return dateStr.charAt(0).toUpperCase() + dateStr.slice(1) + ' — 21h00';
}

// ── Compte le vrai nombre de grilles vendues ──────────────────────────────
function getTotalGrillesVendues() {
  return db.get('grilles').size().value();
}

// ── Compte le vrai nombre de tirages sans gagnant ─────────────────────────
function getTiragesSansGagnant() {
  const depuisDB = db.get('tirages').filter({ aEuGagnant: false }).size().value();
  return depuisDB || Jackpot.get().tiragesSansGagnant || 0;
}

// ── Valide une sélection de 20 numéros parmi 1-99 ─────────────────────────
function validerNumeros(numeros) {
  if (!Array.isArray(numeros)) return 'Les numéros doivent être un tableau';
  if (numeros.length !== 20) return 'Vous devez choisir exactement 20 numéros';
  const uniques = new Set(numeros);
  if (uniques.size !== 20) return 'Les numéros doivent être tous différents';
  for (const n of numeros) {
    if (!Number.isInteger(n) || n < 1 || n > 99) return 'Chaque numéro doit être entre 1 et 99';
  }
  return null;
}

// ================================================================
//  ROUTES PUBLIQUES
// ================================================================

// GET /api/jackpot — Info jackpot en temps réel
router.get('/jackpot', (req, res) => {
  const j = Jackpot.get();
  const cfg = Config.get();
  res.json({
    montant: j.montant,
    tiragesSansGagnant: getTiragesSansGagnant(),
    totalGrillesVendues: getTotalGrillesVendues(),
    prochainTirage: getProchainTirage(),
    tirageNumero: cfg.tirageNumero,
  });
});

// GET /api/stats — Statistiques globales
router.get('/stats', (req, res) => {
  const j = Jackpot.get();
  const cfg = Config.get();
  res.json({
    jackpot: j.montant,
    tiragesSansGagnant: getTiragesSansGagnant(),
    totalGrillesVendues: getTotalGrillesVendues(),
    prochainTirage: getProchainTirage(),
    tirageNumero: cfg.tirageNumero,
    prixGrille: cfg.prixPack1,
    partJackpot: cfg.partJackpot,
  });
});

// GET /api/grilles/similaires?numeros=1,2,3,... — Combien de grilles identiques existent
router.get('/grilles/similaires', (req, res) => {
  const raw = req.query.numeros;
  if (!raw) return res.status(400).json({ error: 'Paramètre numeros requis' });

  const numeros = raw.split(',').map(n => parseInt(n, 10));
  const erreur = validerNumeros(numeros);
  if (erreur) return res.status(400).json({ error: erreur });

  const sorted = [...numeros].sort((a, b) => a - b);
  const cfg = Config.get();

  // Compter uniquement sur le tirage en cours
  const count = db.get('grilles')
    .filter(g => {
      if (g.tirageNumero !== cfg.tirageNumero) return false;
      const gSorted = [...(g.numeros || [])].sort((a, b) => a - b);
      return JSON.stringify(gSorted) === JSON.stringify(sorted);
    })
    .size()
    .value();

  res.json({ similaires: count, tirageNumero: cfg.tirageNumero });
});

// ================================================================
//  ROUTES PROTÉGÉES
// ================================================================

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

// POST /api/grilles/personnalisee — Créer une grille avec ses propres numéros
// (appelé après confirmation du paiement Stripe, avec les numéros choisis)
router.post('/grilles/personnalisee', authMiddleware, async (req, res) => {
  try {
    const { numeros, transactionId, packId } = req.body;
    const user = req.user;

    // Validation
    const erreur = validerNumeros(numeros);
    if (erreur) return res.status(400).json({ error: erreur });

    // Vérifier que la transaction existe et appartient à cet utilisateur
    if (transactionId) {
      const tx = db.get('transactions').find({ id: transactionId, userId: user.id }).value();
      if (!tx) return res.status(400).json({ error: 'Transaction invalide' });
    }

    const cfg = Config.get();
    const sorted = [...numeros].sort((a, b) => a - b);

    // Compter les grilles similaires pour info
    const similaires = db.get('grilles')
      .filter(g => {
        if (g.tirageNumero !== cfg.tirageNumero) return false;
        const gSorted = [...(g.numeros || [])].sort((a, b) => a - b);
        return JSON.stringify(gSorted) === JSON.stringify(sorted);
      })
      .size()
      .value();

    const grille = Grilles.create({
      id: uuidv4(),
      userId: user.id,
      tirageNumero: cfg.tirageNumero,
      numeros: sorted,
      transactionId: transactionId || null,
      packId: packId || 'personnalise',
    });

    // Incrémenter le compteur de grilles vendues
    const j = Jackpot.get();
    Jackpot.update({ totalGrillesVendues: (j.totalGrillesVendues || 0) + 1 });

    res.json({ success: true, grille, similaires });
  } catch (err) {
    console.error('Grille personnalisée error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
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
//  TIRAGE
// ================================================================

// POST /api/tirage/lancer — Lancer un tirage (admin seulement)
router.post('/tirage/lancer', authMiddleware, async (req, res) => {
  try {
    const { adminKey, tirageNumero } = req.body;
    if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Accès refusé' });

    const cfg = Config.get();
    const numTirage = tirageNumero || cfg.tirageNumero;
    const jackpotDepart = Jackpot.getMontant();

    const pool = Array.from({ length: 99 }, (_, i) => i + 1);
    const boules = [];
    while (boules.length < 25) {
      const idx = Math.floor(Math.random() * pool.length);
      boules.push(pool.splice(idx, 1)[0]);
    }
    boules.sort((a, b) => a - b);

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

    const aEuGagnant = gagnantes.length > 0;

    db.get('tirages').push({
      id: uuidv4(),
      numero: numTirage,
      boules,
      aEuGagnant,
      grillesEnJeu: grillesEnJeu.length,
      gagnantes: gagnantes.length,
      date: new Date().toISOString(),
    }).write();

    let montantParGagnant = 0;
    if (aEuGagnant) {
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
      Jackpot.update({ montant: 0, tiragesSansGagnant: 0 });
    } else {
      const j = Jackpot.get();
      Jackpot.update({ tiragesSansGagnant: (j.tiragesSansGagnant || 0) + 1 });
    }

    Config.update({ tirageNumero: numTirage + 1 });

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
      success: true, tirageNumero: numTirage, boules,
      grillesEnJeu: grillesEnJeu.length, gagnantes: gagnantes.length,
      jackpotDepart, montantParGagnant,
    });
  } catch (err) {
    console.error('Tirage error:', err);
    res.status(500).json({ error: 'Erreur lors du tirage' });
  }
});

// GET /api/tirage/dernier
router.get('/tirage/dernier', (req, res) => {
  const cfg = Config.get();
  res.json({ tirageNumero: cfg.tirageNumero, prochainTirage: getProchainTirage() });
});

// ================================================================
//  BACKOFFICE ADMIN
// ================================================================

// GET /api/admin/users — Liste des joueurs
router.get('/admin/users', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Interdit' });
  const users = db.get('users').value();
  res.json({
    count: users.length,
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      prenom: u.prenom,
      nom: u.nom,
      emailVerifie: u.emailVerifie,
      solde: u.solde,
      gainsTotaux: u.gainsTotaux,
      createdAt: u.createdAt,
    }))
  });
});

// GET /api/admin/grilles — Toutes les grilles avec nom du joueur
router.get('/admin/grilles', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Interdit' });
  const grilles = db.get('grilles').value();
  const grillesAvecNom = grilles.map(g => {
    const user = db.get('users').find({ id: g.userId }).value();
    return {
      ...g,
      userNom: user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : 'Inconnu',
      userEmail: user?.email || '',
    };
  });
  res.json({ count: grillesAvecNom.length, grilles: grillesAvecNom });
});

// GET /api/admin/tirages — Historique des tirages
router.get('/admin/tirages', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Interdit' });
  const tirages = db.get('tirages').value();
  res.json({ count: tirages.length, tirages });
});

// DELETE /api/admin/reset-users — Nettoyer la base (temporaire)
router.delete('/admin/reset-users', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Interdit' });
  db.set('users', []).set('grilles', []).set('transactions', []).set('tirages', []).write();
  res.json({ ok: true, message: 'Base nettoyée !' });
});

module.exports = router;
