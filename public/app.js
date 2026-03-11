/**
 * BINGO MILOU — Application Frontend
 * Gère l'authentification, les achats Stripe, les grilles et le simulateur
 */

// ================================================================
//  CONFIG
// ================================================================
const API = '';  // Même domaine
let currentUser = null;
let allGrilles = [];
let currentFilter = 'all';
let simBalls = [];
let simInterval = null;

// ================================================================
//  INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initBackground();
  initNav();
  await loadStats();
  await checkAuth();
  buildPacksGrid();
  handleURLParams();
});

function handleURLParams() {
  const params = new URLSearchParams(window.location.search);
  // Retour de paiement Stripe (démo ou vrai)
  if (params.get('demo') === 'true' && params.get('transactionId')) {
    confirmDemoPayment(params.get('transactionId'), params.get('packId'), params.get('userId'));
  } else if (params.get('session_id')) {
    confirmStripePayment(params.get('session_id'));
  } else if (params.get('cancelled')) {
    showToast('❌ Paiement annulé', 'error');
  } else if (params.get('success') === 'email_verifie') {
    showToast('✅ Email vérifié ! Bienvenue chez Bingo Milou !', 'success');
  }
  // Nettoyer l'URL
  if (params.toString()) window.history.replaceState({}, '', '/');
}

// ================================================================
//  BACKGROUND
// ================================================================
function initBackground() {
  const wrap = document.getElementById('floatBalls');
  const colors = ['#FFD700','#4895EF','#E63946','#7B2FBE','#2DC653','#FF8C00'];
  for (let i = 0; i < 12; i++) {
    const el = document.createElement('div');
    el.className = 'float-ball';
    const sz = 20 + Math.random() * 55;
    el.style.cssText = `width:${sz}px;height:${sz}px;background:${colors[i%colors.length]};left:${Math.random()*100}%;animation-duration:${18+Math.random()*22}s;animation-delay:${Math.random()*18}s;`;
    wrap.appendChild(el);
  }
}

// ================================================================
//  NAVIGATION
// ================================================================
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.dataset.section;
      showSection(key);
    });
  });
}

function showSection(key) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('s-' + key)?.classList.add('active');
  if (key === 'mes-grilles') renderMesGrilles();
  if (key === 'compte') renderCompte();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setActiveNav(key) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.section === key);
  });
}

// ================================================================
//  STATS & JACKPOT
// ================================================================
async function loadStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const data = await res.json();
    updateJackpotUI(data.jackpot);
    document.getElementById('totalGrillesVendues').textContent = (data.totalGrillesVendues || 0).toLocaleString('fr-FR');
    document.getElementById('statSansGagnant').textContent = data.tiragesSansGagnant || 0;
    document.getElementById('tirageNum').textContent = data.tirageNumero || 48;
    document.getElementById('tirageInfoNum').textContent = data.tirageNumero || 48;
    document.getElementById('tiragesSansGagnant').textContent = `${data.tiragesSansGagnant || 47} tirages reportés`;
    document.getElementById('prochainTirage').textContent = data.prochainTirage || 'Samedi 21h00';
    document.getElementById('tirageGrilles').textContent = (data.totalGrillesVendues || 0).toLocaleString('fr-FR');
    document.getElementById('tirageJackpot').textContent = formatEur(data.jackpot);
  } catch (e) { console.warn('Stats non chargées:', e.message); }
}

function updateJackpotUI(montant) {
  const el = document.getElementById('jackpotAmount');
  const target = parseFloat(montant) || 0;
  const current = parseFloat(el.dataset.val || 0);
  el.dataset.val = target;
  animateNumber(el, current, target, v => formatEur(v));
  document.getElementById('tirageJackpot').textContent = formatEur(target);
}

function animateNumber(el, from, to, format) {
  const duration = 1000;
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (to - from) * ease);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function formatEur(v) {
  return Math.round(v).toLocaleString('fr-FR') + ' €';
}

// ================================================================
//  AUTH
// ================================================================
async function checkAuth() {
  try {
    const res = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
    if (res.ok) {
      currentUser = await res.json();
      onAuthSuccess();
    } else {
      onAuthLogout();
    }
  } catch { onAuthLogout(); }
}

function onAuthSuccess() {
  document.getElementById('headerAuth').innerHTML = `
    <span style="color:var(--muted);font-size:.85rem;font-weight:700">Bonjour <strong style="color:var(--gold)">${currentUser.prenom}</strong></span>
    <button class="btn-header" onclick="showSection('compte');setActiveNav('compte')">👤 Mon compte</button>
    <button class="btn-header" onclick="logout()">Déconnexion</button>`;
  document.querySelector('.nav-btn[data-section="compte"]').style.display = '';
}

function onAuthLogout() {
  currentUser = null;
  document.getElementById('headerAuth').innerHTML = `
    <button class="btn-header" onclick="showLoginModal()">Connexion</button>
    <button class="btn-header btn-header-gold" onclick="showRegisterModal()">S'inscrire</button>`;
  document.querySelector('.nav-btn[data-section="compte"]').style.display = 'none';
}

async function logout() {
  await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
  onAuthLogout();
  showToast('À bientôt ! 👋', 'info');
  showSection('boutique');
  setActiveNav('boutique');
}

// ================================================================
//  MODALS AUTH
// ================================================================
function showLoginModal() {
  openModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🎱 Connexion</div>
    <div class="modal-sub">Content de vous revoir !</div>
    <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="loginEmail" type="email" placeholder="votre@email.fr" autocomplete="email"></div>
    <div class="form-group"><label class="form-label">Mot de passe</label><input class="form-input" id="loginPwd" type="password" placeholder="••••••••" autocomplete="current-password">
    <div id="loginError" class="form-error" style="display:none"></div></div>
    <button class="btn-form" onclick="doLogin()" style="margin-top:4px">Se connecter</button>
    <div style="text-align:center;margin-top:14px;font-size:.85rem;color:var(--muted)">
      Pas encore de compte ? <button onclick="showRegisterModal()" style="background:none;border:none;color:var(--gold);font-weight:800;cursor:pointer;font-family:'Nunito',sans-serif">Créer un compte</button>
    </div>
    <div style="text-align:center;margin-top:8px">
      <button onclick="showForgotModal()" style="background:none;border:none;color:var(--muted);font-size:.8rem;cursor:pointer;font-family:'Nunito',sans-serif">Mot de passe oublié ?</button>
    </div>`);
  setTimeout(() => document.getElementById('loginEmail')?.focus(), 100);
}

function showRegisterModal() {
  openModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">✨ Créer un compte</div>
    <div class="modal-sub">Rejoignez Bingo Milou et tentez votre chance !</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-group"><label class="form-label">Prénom *</label><input class="form-input" id="regPrenom" type="text" placeholder="Marie"></div>
      <div class="form-group"><label class="form-label">Nom *</label><input class="form-input" id="regNom" type="text" placeholder="Dupont"></div>
    </div>
    <div class="form-group"><label class="form-label">Email *</label><input class="form-input" id="regEmail" type="email" placeholder="votre@email.fr" autocomplete="email"></div>
    <div class="form-group"><label class="form-label">Téléphone</label><input class="form-input" id="regTel" type="tel" placeholder="+33 6 12 34 56 78"></div>
    <div class="form-group"><label class="form-label">Mot de passe * (8 car. min)</label><input class="form-input" id="regPwd" type="password" placeholder="••••••••" autocomplete="new-password"></div>
    <div class="form-group"><label class="form-label">Confirmer le mot de passe *</label><input class="form-input" id="regPwd2" type="password" placeholder="••••••••" autocomplete="new-password">
    <div id="regError" class="form-error" style="display:none"></div></div>
    <div style="font-size:.75rem;color:var(--muted);margin-bottom:12px;line-height:1.5">
      En créant un compte, vous acceptez nos <a href="#" style="color:var(--gold)">CGU</a>. Le jeu est réservé aux 18+.
    </div>
    <button class="btn-form" onclick="doRegister()">Créer mon compte 🚀</button>
    <div style="text-align:center;margin-top:12px;font-size:.85rem;color:var(--muted)">
      Déjà un compte ? <button onclick="showLoginModal()" style="background:none;border:none;color:var(--gold);font-weight:800;cursor:pointer;font-family:'Nunito',sans-serif">Se connecter</button>
    </div>`);
}

function showForgotModal() {
  openModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">🔐 Mot de passe oublié</div>
    <div class="modal-sub">Entrez votre email pour recevoir un lien de réinitialisation</div>
    <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="forgotEmail" type="email" placeholder="votre@email.fr"></div>
    <div id="forgotMsg" style="display:none"></div>
    <button class="btn-form" onclick="doForgot()">Envoyer le lien 📧</button>`);
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPwd').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    currentUser = data.user;
    onAuthSuccess();
    closeModal();
showToast('🎉 Bienvenue ' + data.user.prenom + ' !', 'success');
  } catch { errEl.textContent = 'Erreur réseau'; errEl.style.display = 'block'; }
}

async function doRegister() {
  const prenom = document.getElementById('regPrenom').value.trim();
  const nom = document.getElementById('regNom').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const telephone = document.getElementById('regTel').value.trim();
  const password = document.getElementById('regPwd').value;
  const password2 = document.getElementById('regPwd2').value;
  const errEl = document.getElementById('regError');
  errEl.style.display = 'none';

  if (password !== password2) { errEl.textContent = 'Les mots de passe ne correspondent pas'; errEl.style.display = 'block'; return; }

  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, prenom, nom, telephone })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    currentUser = data.user;
onAuthSuccess();
closeModal();
showToast('📧 Compte créé ! Vérifiez votre email pour activer votre compte.', 'success');
  } catch { errEl.textContent = 'Erreur réseau'; errEl.style.display = 'block'; }
}

async function doForgot() {
  const email = document.getElementById('forgotEmail').value.trim();
  const msg = document.getElementById('forgotMsg');
  try {
    await fetch(`${API}/api/auth/forgot-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    msg.innerHTML = '<div class="form-success">✅ Si cet email existe, un lien a été envoyé !</div>';
    msg.style.display = 'block';
  } catch { msg.innerHTML = '<div class="form-error">Erreur réseau</div>'; msg.style.display = 'block'; }
}

// ================================================================
//  BOUTIQUE & STRIPE
// ================================================================
const PACKS_DATA = [
  { id:'pack1',  qty:1,  prix:2,  label:'Petite Chance',  emoji:'🍀', badge:'', winback:'1,20 €' },
  { id:'pack5',  qty:5,  prix:9,  label:'Bonne Étoile',   emoji:'🌟', badge:'pop', winback:'5,40 €' },
  { id:'pack10', qty:10, prix:16, label:'Super Milou',     emoji:'🚀', badge:'best', winback:'9,60 €' },
  { id:'pack25', qty:25, prix:35, label:'Pack Champion',   emoji:'👑', badge:'', winback:'21,00 €' },
];

function genPreview() {
  const nums = new Set();
  while (nums.size < 20) nums.add(Math.floor(Math.random() * 99) + 1);
  const chosen = [...nums];
  return Array.from({ length: 99 }, (_, i) => {
    const n = i + 1;
    const on = chosen.includes(n);
    return `<div class="pc ${on?'on':'off'}">${on ? (n<10?'0'+n:n) : ''}</div>`;
  }).join('');
}

function buildPacksGrid() {
  const grid = document.getElementById('packsGrid');
  grid.innerHTML = PACKS_DATA.map(p => `
    <div class="pack-card ${p.badge==='pop'?'featured':''}" onclick="buyPack('${p.id}')">
      ${p.badge==='pop'?'<div class="pack-badge pop">⭐ Populaire</div>':''}
      ${p.badge==='best'?'<div class="pack-badge best">💎 Meilleur ratio</div>':''}
      <div class="pack-emoji">${p.emoji}</div>
      <div class="pack-name">${p.label}</div>
      <div class="pack-qty">${p.qty} grille${p.qty>1?'s':''}</div>
      <div class="pack-preview">${genPreview()}</div>
      <div class="pack-price">${p.prix} €<span class="pack-price-unit"> / pack</span></div>
      <div class="pack-winback">✓ ${p.winback} reversés au jackpot</div>
      <button class="btn-buy">Acheter — ${p.prix} €</button>
    </div>`).join('');
}

async function buyPack(packId) {
  if (!currentUser) {
    showToast('🔐 Connectez-vous pour acheter des grilles', 'info');
    showLoginModal();
    return;
  }

  const pack = PACKS_DATA.find(p => p.id === packId);
  showToast(`⏳ Création du paiement Stripe...`, 'info');

  try {
    const res = await fetch(`${API}/api/stripe/checkout`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId })
    });
    const data = await res.json();

    if (data.demo) {
      // Mode démo : pas de vrai Stripe
      showDemoPaymentModal(data, pack);
    } else if (data.url) {
      // Redirection vers Stripe Checkout
      window.location.href = data.url;
    } else {
      showToast('❌ Erreur lors du paiement', 'error');
    }
  } catch (e) {
    showToast('❌ Erreur réseau', 'error');
  }
}

function showDemoPaymentModal(data, pack) {
  openModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <span class="modal-emoji">💳</span>
    <div class="modal-title">Paiement Sécurisé</div>
    <div class="modal-sub">Mode démo — Stripe non configuré</div>
    <div style="background:var(--card2);border:1px solid var(--border2);border-radius:var(--radius-sm);padding:16px;margin:14px 0;text-align:left">
      <div style="font-size:.8rem;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Récapitulatif de commande</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>${pack.emoji} ${pack.label}</span><strong class="gold">${pack.prix} €</strong></div>
      <div style="display:flex;justify-content:space-between;font-size:.82rem;color:var(--muted)"><span>${pack.qty} grille${pack.qty>1?'s':''} · Tirage du samedi</span><span>+${pack.winback} au jackpot</span></div>
    </div>
    <div style="background:rgba(255,165,0,.08);border:1px dashed rgba(255,165,0,.3);border-radius:var(--radius-sm);padding:12px;font-size:.8rem;color:var(--muted);margin-bottom:16px;line-height:1.5">
      ℹ️ En production, vous seriez redirigé vers <strong>Stripe Checkout</strong> pour un paiement sécurisé (CB, Apple Pay, Google Pay...). Configurez votre clé Stripe dans <code>.env</code>.
    </div>
    <button class="btn-form" onclick="simulateDemoPayment('${data.transactionId}','${data.packId}')">
      ✅ Simuler le paiement (démo)
    </button>
    <button class="btn-outline" style="display:block;width:100%;margin-top:10px;padding:11px" onclick="closeModal()">Annuler</button>`);
}

async function simulateDemoPayment(transactionId, packId) {
  closeModal();
  showToast('⏳ Traitement du paiement...', 'info');
  try {
    const res = await fetch(`${API}/api/stripe/demo-success`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId, packId, userId: currentUser.id })
    });
    const data = await res.json();
    if (res.ok) {
      await loadStats();
      showPurchaseSuccess(data);
    } else {
      showToast('❌ Erreur: ' + data.error, 'error');
    }
  } catch { showToast('❌ Erreur réseau', 'error'); }
}

async function confirmStripePayment(sessionId) {
  try {
    const res = await fetch(`${API}/api/stripe/success?session_id=${sessionId}`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok) { await loadStats(); showPurchaseSuccess(data); }
  } catch {}
}

async function confirmDemoPayment(transactionId, packId, userId) {
  if (!currentUser || currentUser.id !== userId) return;
  try {
    const res = await fetch(`${API}/api/stripe/demo-success`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId, packId, userId })
    });
    const data = await res.json();
    if (res.ok) { await loadStats(); showPurchaseSuccess(data); }
  } catch {}
}

function showPurchaseSuccess(data) {
  const grilles = data.grilles || [];
  const pack = data.pack || {};
  launchConfetti();
  openModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <span class="modal-emoji">🎟️</span>
    <div class="modal-title">${grilles.length} grille${grilles.length>1?'s':''} achetée${grilles.length>1?'s':''} !</div>
    <div class="modal-sub">Un email de confirmation a été envoyé</div>
    <div style="max-height:200px;overflow-y:auto;margin:14px 0">
      ${grilles.slice(0,5).map(g => `
        <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;text-align:left">
          <strong style="color:var(--gold);font-family:'Fredoka One',cursive">${g.id}</strong>
          <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
            ${g.numeros.map(n=>`<span style="background:var(--gold);color:#1A0A00;font-family:'Fredoka One',cursive;font-size:.8rem;padding:3px 8px;border-radius:6px">${n<10?'0'+n:n}</span>`).join('')}
          </div>
        </div>`).join('')}
      ${grilles.length > 5 ? `<div style="text-align:center;color:var(--muted);font-size:.83rem">... et ${grilles.length-5} autre(s) grille(s)</div>` : ''}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
      <button class="btn-gold" onclick="closeModal();showSection('mes-grilles');setActiveNav('mes-grilles')">📋 Voir mes grilles</button>
      <button class="btn-outline" onclick="closeModal()">Continuer les achats</button>
    </div>`);
}

// ================================================================
//  MES GRILLES
// ================================================================
async function renderMesGrilles() {
  if (!currentUser) {
    document.getElementById('grillesAuthRequired').style.display = 'block';
    document.getElementById('grillesLoggedIn').style.display = 'none';
    return;
  }
  document.getElementById('grillesAuthRequired').style.display = 'none';
  document.getElementById('grillesLoggedIn').style.display = 'block';

  try {
    const res = await fetch(`${API}/api/grilles`, { credentials: 'include' });
    const data = await res.json();
    allGrilles = data.grilles || [];
    renderGrillesList();
  } catch { showToast('❌ Erreur chargement des grilles', 'error'); }
}

function filterGrilles(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGrillesList();
}

function renderGrillesList() {
  const list = document.getElementById('grillesList');
  const filtered = currentFilter === 'all' ? allGrilles : allGrilles.filter(g => g.statut === currentFilter);

  if (filtered.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:50px 20px;color:var(--muted)">
      <div style="font-size:3rem;margin-bottom:12px;opacity:.5">🎟️</div>
      <div style="font-family:'Fredoka One',cursive;font-size:1.3rem;color:var(--text);margin-bottom:8px">${currentFilter==='all'?'Pas encore de grilles':'Aucune grille dans cette catégorie'}</div>
      ${currentFilter==='all'?'<button class="btn-gold" onclick="showSection(\'boutique\');setActiveNav(\'boutique\')">🛒 Acheter mes premières grilles</button>':''}
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(g => {
    const hits = (g.numerosCoches || []).length;
    const isWin = g.statut === 'gagnant';
    const chipClass = isWin ? 'chip-gagnant' : g.statut === 'perdu' ? 'chip-perdu' : 'chip-attente';
    const chipText = isWin ? '🏆 BINGO !' : g.statut === 'perdu' ? '❌ Non gagnant' : '⏳ En attente';

    const cells = Array.from({ length: 99 }, (_, i) => i + 1).map(n => {
      const inG = g.numeros.includes(n);
      const drawn = (g.numerosCoches || []).includes(n);
      if (!inG) return `<div class="gn" style="opacity:.08"></div>`;
      const cls = drawn ? (isWin ? 'gn win-hit' : 'gn hit') : 'gn sel';
      return `<div class="${cls}">${n<10?'0'+n:n}</div>`;
    }).join('');

    return `<div class="grille-item ${g.statut}">
      <div>
        <div class="grille-id">${g.id}</div>
        <div class="grille-date">Tirage #${g.tirageNumero} · ${new Date(g.createdAt).toLocaleDateString('fr-FR')}</div>
      </div>
      <div class="grille-nums">${cells}</div>
      <div class="grille-right">
        <div class="hit-count">${hits}<span style="font-size:1.1rem;color:var(--muted)">/20</span></div>
        <div class="hit-max">cochés</div>
        <div class="status-chip ${chipClass}">${chipText}</div>
      </div>
    </div>`;
  }).join('');
}

// ================================================================
//  MON COMPTE
// ================================================================
function renderCompte() {
  if (!currentUser) {
    document.getElementById('compteNotAuth').style.display = 'block';
    document.getElementById('compteAuth').style.display = 'none';
    return;
  }
  document.getElementById('compteNotAuth').style.display = 'none';
  document.getElementById('compteAuth').style.display = 'block';

  document.getElementById('accPrenom').value = currentUser.prenom || '';
  document.getElementById('accNom').value = currentUser.nom || '';
  document.getElementById('accEmail').value = currentUser.email || '';
  document.getElementById('accTel').value = currentUser.telephone || '';
  document.getElementById('soldeDisplay').textContent = formatEur(currentUser.solde || 0);
  document.getElementById('gainsTotaux').textContent = `Gains totaux : ${formatEur(currentUser.gainsTotaux || 0)}`;
}

async function saveProfile() {
  const prenom = document.getElementById('accPrenom').value.trim();
  const nom = document.getElementById('accNom').value.trim();
  const telephone = document.getElementById('accTel').value.trim();
  try {
    const res = await fetch(`${API}/api/auth/profile`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prenom, nom, telephone })
    });
    if (res.ok) { currentUser.prenom = prenom; currentUser.nom = nom; currentUser.telephone = telephone; onAuthSuccess(); showToast('✅ Profil mis à jour !', 'success'); }
    else showToast('❌ Erreur de mise à jour', 'error');
  } catch { showToast('❌ Erreur réseau', 'error'); }
}

async function changePassword() {
  const currentPassword = document.getElementById('pwdCurrent').value;
  const newPassword = document.getElementById('pwdNew').value;
  const confirm = document.getElementById('pwdConfirm').value;
  if (newPassword !== confirm) { showToast('❌ Les mots de passe ne correspondent pas', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/auth/password`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (res.ok) { ['pwdCurrent','pwdNew','pwdConfirm'].forEach(id => document.getElementById(id).value = ''); showToast('✅ Mot de passe mis à jour !', 'success'); }
    else showToast('❌ ' + data.error, 'error');
  } catch { showToast('❌ Erreur réseau', 'error'); }
}

async function loadTransactions() {
  const el = document.getElementById('transactionsList');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  if (el.style.display === 'none') return;
  try {
    const res = await fetch(`${API}/api/transactions`, { credentials: 'include' });
    const data = await res.json();
    const txs = data.transactions || [];
    el.innerHTML = txs.length === 0 ? '<div style="color:var(--muted);font-size:.83rem;padding:8px 0">Aucune transaction</div>' :
      txs.map(t => `<div class="tx-item">
        <div>
          <div style="font-weight:700">${t.type === 'achat_grille' ? '🎟️ Achat grilles' : t.type === 'gain_jackpot' ? '🏆 Jackpot gagné' : '💸 Retrait'}</div>
          <div style="color:var(--muted);font-size:.76rem">${new Date(t.createdAt).toLocaleDateString('fr-FR')}</div>
        </div>
        <div style="color:${t.type==='achat_grille'?'var(--red)':t.type==='retrait'?'var(--red)':'var(--green)'};font-weight:800">
          ${t.type==='achat_grille'||t.type==='retrait'?'-':'+'} ${formatEur(t.montant)}
        </div>
      </div>`).join('');
  } catch { el.innerHTML = '<div style="color:var(--red);font-size:.83rem">Erreur chargement</div>'; }
}

function showRetraitModal() {
  if (!currentUser || currentUser.solde <= 0) { showToast('💰 Aucun solde disponible à retirer', 'info'); return; }
  openModal(`
    <button class="modal-close" onclick="closeModal()">✕</button>
    <div class="modal-title">💸 Retirer mes gains</div>
    <div class="modal-sub">Solde disponible : <strong style="color:var(--green)">${formatEur(currentUser.solde)}</strong></div>
    <div class="form-group"><label class="form-label">Montant (€)</label><input class="form-input" id="retraitMontant" type="number" min="1" max="${currentUser.solde}" value="${currentUser.solde}" step="0.01"></div>
    <div class="form-group"><label class="form-label">IBAN</label><input class="form-input" id="retraitIBAN" type="text" placeholder="FR76 3000 6000 0112 3456 7890 189"></div>
    <div class="form-group"><label class="form-label">Titulaire du compte</label><input class="form-input" id="retraitNom" type="text" placeholder="${currentUser.prenom} ${currentUser.nom}"></div>
    <div style="font-size:.8rem;color:var(--muted);margin-bottom:14px;line-height:1.5">⏱️ Traitement sous 3-5 jours ouvrés · Virement SEPA gratuit</div>
    <button class="btn-form" onclick="doRetrait()">Confirmer le retrait</button>`);
}

async function doRetrait() {
  const montant = parseFloat(document.getElementById('retraitMontant').value);
  const iban = document.getElementById('retraitIBAN').value.trim();
  const titulaire = document.getElementById('retraitNom').value.trim();
  try {
    const res = await fetch(`${API}/api/retrait`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ montant, iban, titulaire })
    });
    const data = await res.json();
    if (res.ok) {
      currentUser.solde -= montant;
      renderCompte();
      closeModal();
      showToast(`✅ Retrait de ${formatEur(montant)} en cours !`, 'success');
    } else { showToast('❌ ' + data.error, 'error'); }
  } catch { showToast('❌ Erreur réseau', 'error'); }
}

// ================================================================
//  SIMULATEUR TIRAGE
// ================================================================
function drawBall() {
  if (simBalls.length >= 25) { showToast('🎱 25 boules tirées — tirage terminé !', 'info'); return; }
  const pool = Array.from({length:99},(_,i)=>i+1).filter(n => !simBalls.includes(n));
  const ball = pool[Math.floor(Math.random() * pool.length)];
  simBalls.push(ball);
  renderSimBalls();
  updateSimProgress();
  if (simBalls.length === 25) endSim();
}

function toggleAuto() {
  const btn = document.getElementById('btnAuto');
  if (simInterval) {
    clearInterval(simInterval); simInterval = null;
    btn.textContent = 'Tirage auto ⚡';
  } else {
    btn.textContent = '⏸ Pause';
    simInterval = setInterval(() => {
      drawBall();
      if (simBalls.length >= 25) { clearInterval(simInterval); simInterval = null; btn.textContent = 'Tirage auto ⚡'; }
    }, 500);
  }
}

function resetSim() {
  if (simInterval) { clearInterval(simInterval); simInterval = null; }
  document.getElementById('btnAuto').textContent = 'Tirage auto ⚡';
  simBalls = [];
  renderSimBalls();
  updateSimProgress();
  document.getElementById('simResult').style.display = 'none';
}

function renderSimBalls() {
  const z = document.getElementById('ballsZone');
  if (simBalls.length === 0) { z.innerHTML = '<span class="balls-placeholder">Les boules tirées apparaîtront ici ✨</span>'; return; }
  z.innerHTML = simBalls.map((n,i) => `<div class="bball bc${(i%5)+1}">${n}</div>`).join('');
}

function updateSimProgress() {
  const pct = (simBalls.length / 25 * 100).toFixed(0);
  document.getElementById('simProgress').style.width = pct + '%';
  document.getElementById('simLabel').textContent = `${simBalls.length} / 25 boules tirées`;
}

function endSim() {
  const result = document.getElementById('simResult');
  result.style.display = 'block';
  if (!currentUser || allGrilles.length === 0) {
    result.innerHTML = `<span style="font-size:1.4rem">🎱</span> Tirage terminé ! <strong style="color:var(--gold)">Boules :</strong> ${simBalls.join(', ')}. Connectez-vous et achetez des grilles pour voir si vous gagnez !`;
    return;
  }
  const winners = allGrilles.filter(g => g.statut === 'en_attente' && g.numeros.every(n => simBalls.includes(n)));
  if (winners.length > 0) {
    result.innerHTML = `🏆 <strong style="color:var(--gold);font-family:'Fredoka One',cursive;font-size:1.3rem">BINGO MILOU !</strong> La grille <strong>${winners[0].id}</strong> gagne !`;
    launchConfetti();
    showToast('🎉 BINGO ! Vous avez gagné !', 'gold');
  } else {
    const best = Math.max(...allGrilles.filter(g=>g.statut==='en_attente').map(g => g.numeros.filter(n=>simBalls.includes(n)).length), 0);
    result.innerHTML = `😢 Pas de gagnant. <strong style="color:var(--gold)">Meilleur score : ${best}/20.</strong> Le jackpot augmenterait !`;
  }
}

// ================================================================
//  MODAL
// ================================================================
function openModal(html) {
  document.getElementById('mainModalBox').innerHTML = html;
  document.getElementById('mainModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('mainModal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('mainModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ================================================================
//  TOAST
// ================================================================
function showToast(msg, type = 'success') {
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success:'✅', gold:'🏆', info:'ℹ️', error:'❌' };
  t.innerHTML = `<span class="toast-ico">${icons[type]||'💬'}</span><span>${msg}</span>`;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'all .35s';
    t.style.transform = 'translateX(130%)';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 350);
  }, 3500);
}

// ================================================================
//  CONFETTI
// ================================================================
function launchConfetti() {
  const wrap = document.getElementById('confettiWrap');
  const colors = ['#FFD700','#FF8C00','#4895EF','#2DC653','#E63946','#7B2FBE'];
  for (let i = 0; i < 100; i++) {
    const p = document.createElement('div');
    p.className = 'cpaper';
    const sz = 8 + Math.random() * 13;
    p.style.cssText = `left:${Math.random()*100}%;width:${sz}px;height:${sz}px;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random()>.5?'50%':'3px'};animation-duration:${2.5+Math.random()*3}s;animation-delay:${Math.random()*1.5}s;`;
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 6000);
  }
}

// ================================================================
//  GLOBALS EXPOSÉS
// ================================================================
window.showLoginModal = showLoginModal;
window.showRegisterModal = showRegisterModal;
window.showSection = showSection;
window.setActiveNav = setActiveNav;
window.buyPack = buyPack;
window.filterGrilles = filterGrilles;
window.saveProfile = saveProfile;
window.changePassword = changePassword;
window.loadTransactions = loadTransactions;
window.showRetraitModal = showRetraitModal;
window.logout = logout;
window.doLogin = doLogin;
window.doRegister = doRegister;
window.doForgot = doForgot;
window.simulateDemoPayment = simulateDemoPayment;
window.drawBall = drawBall;
window.toggleAuto = toggleAuto;
window.resetSim = resetSim;
window.closeModal = closeModal;
window.doRetrait = doRetrait;
window.showToast = showToast;
