/**
 * BINGO MILOU — Couche Base de Données (lowdb JSON)
 */
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './database/bingo_milou.json';
const dbDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const adapter = new FileSync(path.resolve(DB_PATH));
const db = low(adapter);

db.defaults({
  users: [],
  grilles: [],
  tirages: [],
  transactions: [],
  jackpot: {
    montant: 47850,
    tiragesSansGagnant: 47,
    totalGrillesVendues: 1247,
  },
  config: {
    prixPack1: 2.00, prixPack5: 9.00, prixPack10: 16.00, prixPack25: 35.00,
    partJackpot: 0.60, partFrais: 0.40,
    prochainTirage: 'Samedi 07 mars 2026 — 21h00',
    tirageNumero: 48,
  }
}).write();

const Users = {
  findByEmail: (email) => db.get('users').find({ email: email.toLowerCase() }).value(),
  findById: (id) => db.get('users').find({ id }).value(),
  create(data) {
    const user = { id: data.id, email: data.email.toLowerCase(), passwordHash: data.passwordHash,
      prenom: data.prenom, nom: data.nom, telephone: data.telephone || '',
      solde: 0, gainsTotaux: 0, emailVerifie: false, emailToken: data.emailToken || null,
      resetToken: null, resetExpiry: null, stripeCustomerId: null, active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.get('users').push(user).write();
    return user;
  },
  update(id, updates) {
    updates.updatedAt = new Date().toISOString();
    db.get('users').find({ id }).assign(updates).write();
    return db.get('users').find({ id }).value();
  },
  all: () => db.get('users').value(),
};

const Grilles = {
  findById: (id) => db.get('grilles').find({ id }).value(),
  findByUser: (userId) => db.get('grilles').filter({ userId }).orderBy('createdAt','desc').value(),
  findPendingByTirage: (tirageNumero) => db.get('grilles').filter({ tirageNumero, statut: 'en_attente' }).value(),
  create(data) {
    const g = { id: data.id, userId: data.userId, tirageNumero: data.tirageNumero,
      numeros: data.numeros, statut: 'en_attente', numerosCoches: [],
      transactionId: data.transactionId, packId: data.packId,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.get('grilles').push(g).write();
    return g;
  },
  update(id, updates) {
    updates.updatedAt = new Date().toISOString();
    db.get('grilles').find({ id }).assign(updates).write();
    return db.get('grilles').find({ id }).value();
  },
  countByTirage: (tirageNumero) => db.get('grilles').filter({ tirageNumero }).size().value(),
  all: () => db.get('grilles').value(),
};

const Transactions = {
  findById: (id) => db.get('transactions').find({ id }).value(),
  findByStripeSession: (sessionId) => db.get('transactions').find({ stripeSessionId: sessionId }).value(),
  findByUser: (userId) => db.get('transactions').filter({ userId }).orderBy('createdAt','desc').value(),
  create(data) {
    const tx = { id: data.id, userId: data.userId, type: data.type,
      montant: data.montant, statut: data.statut || 'en_attente',
      stripeSessionId: data.stripeSessionId || null, packId: data.packId || null,
      qtyGrilles: data.qtyGrilles || 0, metadata: data.metadata || {},
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.get('transactions').push(tx).write();
    return tx;
  },
  update(id, updates) {
    updates.updatedAt = new Date().toISOString();
    db.get('transactions').find({ id }).assign(updates).write();
    return db.get('transactions').find({ id }).value();
  },
};

const Jackpot = {
  get: () => db.get('jackpot').value(),
  getMontant: () => db.get('jackpot.montant').value(),
  addMontant(amount) {
    const cur = db.get('jackpot.montant').value();
    db.set('jackpot.montant', Math.round((cur + amount) * 100) / 100).write();
    return db.get('jackpot.montant').value();
  },
  update: (updates) => { db.get('jackpot').assign(updates).write(); return db.get('jackpot').value(); },
};

const Config = {
  get: () => db.get('config').value(),
  update: (updates) => { db.get('config').assign(updates).write(); return db.get('config').value(); },
};

function genererGrille() {
  const nums = new Set();
  while (nums.size < 20) nums.add(Math.floor(Math.random() * 99) + 1);
  return [...nums].sort((a, b) => a - b);
}

function verifierGagnant(numerosGrille, boulestireees) {
  return numerosGrille.every(n => boulestireees.includes(n));
}

module.exports = { db, Users, Grilles, Transactions, Jackpot, Config, genererGrille, verifierGagnant };
