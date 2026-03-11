/**
 * BINGO MILOU — Routes Authentification
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Users } = require('./database');
const Emails = require('./email');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_changez_moi';
const JWT_EXPIRES = '7d';

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = Users.findById(decoded.userId);
    if (!user || !user.active) return res.status(401).json({ error: 'Session invalide' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, prenom, nom, telephone } = req.body;

    if (!email || !password || !prenom || !nom)
      return res.status(400).json({ error: 'Champs obligatoires manquants' });

    if (password.length < 8)
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ error: 'Email invalide' });

    if (Users.findByEmail(email))
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });

    const passwordHash = await bcrypt.hash(password, 12);
    const emailToken = uuidv4();

    const user = Users.create({
      id: uuidv4(),
      email, passwordHash, prenom, nom, telephone,
      emailToken,
    });

    // Email de vérification (non bloquant)
    try { 
  Emails.bienvenue(user, user.emailToken).catch(err => console.error('ERREUR EMAIL:', err.message)); 
  console.log('Email de bienvenue envoyé à:', user.email);
} catch (e) { 
  console.error('ERREUR EMAIL:', e.message, e.code);
}

    const token = signToken(user.id);
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 7*24*60*60*1000 });

    res.status(201).json({
      success: true,
      message: 'Compte créé ! Vérifiez votre email.',
      user: { id: user.id, email: user.email, prenom: user.prenom, nom: user.nom, emailVerifie: user.emailVerifie },
      token,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const user = Users.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    if (!user.active) return res.status(403).json({ error: 'Compte désactivé' });

    const token = signToken(user.id);
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 7*24*60*60*1000 });

    res.json({
      success: true,
      user: { id: user.id, email: user.email, prenom: user.prenom, nom: user.nom,
              emailVerifie: user.emailVerifie, solde: user.solde },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id, email: u.email, prenom: u.prenom, nom: u.nom,
    telephone: u.telephone, emailVerifie: u.emailVerifie,
    solde: u.solde, gainsTotaux: u.gainsTotaux,
    createdAt: u.createdAt,
  });
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { prenom, nom, telephone } = req.body;
    const updates = {};
    if (prenom) updates.prenom = prenom;
    if (nom) updates.nom = nom;
    if (telephone !== undefined) updates.telephone = telephone;

    const user = Users.update(req.user.id, updates);
    res.json({ success: true, user: { prenom: user.prenom, nom: user.nom, telephone: user.telephone } });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/auth/password
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Champs manquants' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Nouveau mot de passe trop court' });

    const valid = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    Users.update(req.user.id, { passwordHash });
    res.json({ success: true, message: 'Mot de passe mis à jour' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = Users.findByEmail(email);
    // Ne pas révéler si l'email existe
    if (user) {
      const token = uuidv4();
      const expiry = new Date(Date.now() + 3600000).toISOString(); // 1h
      Users.update(user.id, { resetToken: token, resetExpiry: expiry });
      try { await Emails.resetPassword(user, token); } catch (e) { console.warn('Email reset non envoyé:', e.message); }
    }
    res.json({ success: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/verify-email
router.get('/verify-email', (req, res) => {
  const { token } = req.query;
  const users = Users.all();
  const user = users.find(u => u.emailToken === token);
  if (!user) return res.redirect('/?error=token_invalide');
  Users.update(user.id, { emailVerifie: true, emailToken: null });
  res.redirect('/?success=email_verifie');
});

module.exports = { router, authMiddleware };
