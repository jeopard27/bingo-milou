/**
 * BINGO MILOU — Serveur Principal
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ================================================================
//  MIDDLEWARE
// ================================================================

app.use(cors({
  origin: process.env.SITE_URL || 'http://localhost:3000',
  credentials: true,
}));

// Webhook Stripe AVANT le json parser (besoin du raw body)
const stripeRoutes = require('./stripe');
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting
const limiter = rateLimit({ windowMs: 15*60*1000, max: 200, message: 'Trop de requêtes' });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: 'Trop de tentatives de connexion' });
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ================================================================
//  ROUTES API
// ================================================================

const { router: authRoutes } = require('./auth');
const apiRoutes = require('./api');

app.use('/api/auth', authRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api', apiRoutes);

// ================================================================
//  SPA — Toutes les autres routes servent index.html
// ================================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ================================================================
//  ERROR HANDLER
// ================================================================
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// ================================================================
//  DÉMARRAGE
// ================================================================
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  🎱  BINGO MILOU — Serveur démarré !     ║
  ║  🌐  http://localhost:${PORT}               ║
  ║  📦  Base de données : JSON (lowdb)       ║
  ║  💳  Stripe : ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_test') ? 'Mode TEST' : process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'Mode LIVE' : 'Non configuré (démo)'}             ║
  ╚══════════════════════════════════════════╝
  `);
});

module.exports = app;
