/**
 * BINGO MILOU — Routes Stripe Paiement
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('./auth');
const { Users, Grilles, Transactions, Jackpot, Config, genererGrille } = require('./database');
const Emails = require('./email');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_demo');
const SITE = process.env.SITE_URL || 'http://localhost:3000';

// Packs disponibles
function getPacks() {
  const cfg = Config.get();
  return {
    pack1:  { id: 'pack1',  qty: 1,  prix: cfg.prixPack1,  label: 'Petite Chance',   emoji: '🍀' },
    pack5:  { id: 'pack5',  qty: 5,  prix: cfg.prixPack5,  label: 'Bonne Étoile',    emoji: '🌟' },
    pack10: { id: 'pack10', qty: 10, prix: cfg.prixPack10, label: 'Super Milou',      emoji: '🚀' },
    pack25: { id: 'pack25', qty: 25, prix: cfg.prixPack25, label: 'Pack Champion',    emoji: '👑' },
  };
}

// POST /api/stripe/checkout — Créer une session de paiement Stripe
router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const { packId } = req.body;
    const packs = getPacks();
    const pack = packs[packId];
    if (!pack) return res.status(400).json({ error: 'Pack invalide' });

    const user = req.user;
    const transactionId = uuidv4();
    const cfg = Config.get();

    // Créer ou retrouver le customer Stripe
    let customerId = user.stripeCustomerId;
    if (!customerId && process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.prenom} ${user.nom}`,
        metadata: { userId: user.id }
      });
      customerId = customer.id;
      Users.update(user.id, { stripeCustomerId: customerId });
    }

    // Créer la session Checkout Stripe
    const sessionParams = {
      mode: 'payment',
      customer_email: !customerId ? user.email : undefined,
      customer: customerId || undefined,
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: Math.round(pack.prix * 100), // en centimes
          product_data: {
            name: `${pack.emoji} Bingo Milou — ${pack.label}`,
            description: `${pack.qty} grille(s) pour le prochain tirage · Format 20/99 · Jackpot actuel : ${Jackpot.getMontant().toLocaleString('fr-FR')} €`,
            images: [`${SITE}/images/logo-bingo.png`],
          },
        },
        quantity: 1,
      }],
      success_url: `${SITE}/paiement-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/?cancelled=true`,
      metadata: {
        userId: user.id,
        packId: pack.id,
        transactionId,
        tirageNumero: String(cfg.tirageNumero),
      },
      payment_intent_data: {
        metadata: { userId: user.id, packId: pack.id, transactionId }
      },
      locale: 'fr',
    };

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (stripeErr) {
      // Mode démo si Stripe non configuré
      console.warn('Stripe non configuré, mode démo');
      return res.json({
        demo: true,
        sessionId: 'demo_' + transactionId,
        transactionId,
        packId,
        redirectUrl: `${SITE}/paiement-success?demo=true&transactionId=${transactionId}&packId=${packId}&userId=${user.id}`,
      });
    }

    // Enregistrer la transaction en attente
    Transactions.create({
      id: transactionId,
      userId: user.id,
      type: 'achat_grille',
      montant: pack.prix,
      statut: 'en_attente',
      stripeSessionId: session.id,
      packId: pack.id,
      qtyGrilles: pack.qty,
      metadata: { packLabel: pack.label }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du paiement' });
  }
});

// POST /api/stripe/webhook — Événements Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    await handlePaymentSuccess(session.metadata);
  }

  res.json({ received: true });
});

// GET /api/stripe/success — Traitement succès (aussi appelé depuis l'URL de retour)
router.get('/success', authMiddleware, async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'Session manquante' });

    // Vérifier si déjà traité
    const existing = Transactions.findByStripeSession(session_id);
    if (existing && existing.statut === 'complete') {
      return res.json({ success: true, alreadyProcessed: true, transactionId: existing.id });
    }

    // Vérifier avec Stripe
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.payment_status === 'paid') {
        const result = await handlePaymentSuccess(session.metadata);
        return res.json({ success: true, ...result });
      }
    } catch (e) {
      console.warn('Stripe retrieve error:', e.message);
    }

    res.status(400).json({ error: 'Paiement non confirmé' });
  } catch (err) {
    console.error('Success route error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/stripe/demo-success — Mode démo sans Stripe configuré
router.post('/demo-success', authMiddleware, async (req, res) => {
  try {
    const { transactionId, packId, userId } = req.body;
    if (req.user.id !== userId) return res.status(403).json({ error: 'Interdit' });

    const result = await handlePaymentSuccess({ userId, packId, transactionId, tirageNumero: String(Config.get().tirageNumero), demo: 'true' });
    res.json({ success: true, demo: true, ...result });
  } catch (err) {
    console.error('Demo success error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ================================================================
//  LOGIQUE PRINCIPALE : Créer les grilles après paiement
// ================================================================
async function handlePaymentSuccess(metadata) {
  const { userId, packId, transactionId, tirageNumero } = metadata;
  const packs = getPacks();
  const pack = packs[packId];
  const cfg = Config.get();

  if (!pack || !userId) throw new Error('Metadata invalide');

  const user = Users.findById(userId);
  if (!user) throw new Error('Utilisateur introuvable');

  // Éviter le double traitement
  const existingTx = Transactions.findById(transactionId);
  if (existingTx && existingTx.statut === 'complete') {
    return { alreadyProcessed: true, transactionId };
  }

  // Générer les grilles
  const grilles = [];
  const numTirage = parseInt(tirageNumero) || cfg.tirageNumero;

  for (let i = 0; i < pack.qty; i++) {
    const grille = Grilles.create({
      id: 'GR-' + uuidv4().slice(0,8).toUpperCase(),
      userId,
      tirageNumero: numTirage,
      numeros: genererGrille(),
      transactionId,
      packId,
    });
    grilles.push(grille);
  }

  // Mettre à jour la transaction
  Transactions.update(transactionId, { statut: 'complete' });

  // Ajouter au jackpot (60%)
  const apportJackpot = Math.round(pack.prix * 0.60 * 100) / 100;
  Jackpot.addMontant(apportJackpot);
  Jackpot.update({ totalGrillesVendues: (Jackpot.get().totalGrillesVendues || 0) + pack.qty });

  // Email de confirmation (non bloquant)
  try {
    await Emails.confirmationAchat(user, existingTx || { id: transactionId, montant: pack.prix }, grilles);
  } catch (e) {
    console.warn('Email confirmation non envoyé:', e.message);
  }

  return { transactionId, grilles: grilles.map(g => ({ id: g.id, numeros: g.numeros })), pack };
}

// GET /api/stripe/packs — Liste des packs et prix
router.get('/packs', (req, res) => {
  res.json({ packs: getPacks(), jackpot: Jackpot.get() });
});

module.exports = router;
