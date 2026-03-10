 * BINGO MILOU — Service Email
 */
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'ssl0.ovh.net',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const FROM = process.env.EMAIL_FROM || 'Bingo Milou <noreply@bingo-milou.fr>';
const SITE = process.env.SITE_URL || 'http://localhost:3000';

const baseTemplate = (content) => `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#07050F;font-family:'Segoe UI',Arial,sans-serif;color:#F4F0FF}
  .wrap{max-width:600px;margin:0 auto;padding:20px}
  .header{text-align:center;padding:30px 20px;background:linear-gradient(135deg,#1A0A00,#3D1E00);border-radius:16px 16px 0 0;border:2px solid #FFD700;border-bottom:none}
  .logo{font-size:2.5rem;font-weight:900;color:#FFD700;letter-spacing:2px}
  .tagline{color:#9B8FC4;font-size:0.85rem;letter-spacing:3px;margin-top:5px}
  .body{background:#160F2D;border:2px solid #FFD700;border-top:none;border-radius:0 0 16px 16px;padding:30px}
  .btn{display:inline-block;background:linear-gradient(135deg,#FF8C00,#FFD700);color:#1A0A00;text-decoration:none;padding:14px 30px;border-radius:50px;font-weight:900;font-size:1rem;margin:20px 0}
  .gold{color:#FFD700;font-weight:900}
  .green{color:#2DC653;font-weight:900}
  .muted{color:#8B7FC0;font-size:0.85rem}
  .footer{text-align:center;padding:20px;color:#5A5080;font-size:0.75rem}
  .divider{border:none;border-top:1px solid rgba(255,215,0,0.15);margin:20px 0}
</style></head><body>
<div class="wrap">
  <div class="header">
    <div class="logo">🎱 Bingo Milou</div>
    <div class="tagline">LE BONHEUR EN 20 NUMÉROS</div>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    © 2026 Bingo Milou · Jeu de loterie · 18+ uniquement<br>
    <a href="${SITE}/desabonnement" style="color:#5A5080">Se désabonner</a>
  </div>
</div>
</body></html>`;

const Emails = {

  async bienvenue(user, verifyToken) {
    const url = `${SITE}/api/auth/verify-email?token=${verifyToken}`;
    await transporter.sendMail({
      from: FROM, to: user.email,
      subject: '🎱 Bienvenue chez Bingo Milou ! Confirmez votre email',
      html: baseTemplate(`
        <h2>Bonjour <span class="gold">${user.prenom}</span> ! 👋</h2>
        <p>Bienvenue dans la grande famille Bingo Milou ! Vous êtes à un clic de tenter votre chance au jackpot.</p>
        <hr class="divider">
        <p>Pour activer votre compte, cliquez sur le bouton ci-dessous :</p>
        <center><a class="btn" href="${url}">✅ Confirmer mon email</a></center>
        <p class="muted">Ce lien expire dans 24h. Si vous n'avez pas créé de compte, ignorez cet email.</p>
      `)
    });
  },

  async confirmationAchat(user, transaction, grilles) {
    const grillesHtml = grilles.slice(0,3).map(g =>
      `<div style="background:#1E1640;border:1px solid rgba(255,215,0,0.2);border-radius:8px;padding:10px;margin:6px 0">
        <strong style="color:#FFD700">${g.id}</strong> — Numéros : ${g.numeros.join(', ')}
      </div>`
    ).join('') + (grilles.length > 3 ? `<p class="muted">... et ${grilles.length-3} autre(s) grille(s)</p>` : '');

    await transporter.sendMail({
      from: FROM, to: user.email,
      subject: `🎟️ ${grilles.length} grille(s) achetée(s) — Bingo Milou`,
      html: baseTemplate(`
        <h2>Commande confirmée ! 🎉</h2>
        <p>Bonjour <span class="gold">${user.prenom}</span>,</p>
        <p>Votre achat de <strong class="gold">${grilles.length} grille(s)</strong> pour un montant de <strong class="gold">${transaction.montant} €</strong> a été confirmé.</p>
        <hr class="divider">
        <h3 style="color:#FFD700">Vos grilles :</h3>
        ${grillesHtml}
        <hr class="divider">
        <p>🗓️ <strong>Prochain tirage :</strong> Samedi à 21h00 sur YouTube</p>
        <p>📺 Suivez le tirage en direct et vérifiez vos numéros en temps réel !</p>
        <center><a class="btn" href="${SITE}/mon-compte">📋 Voir mes grilles</a></center>
        <p class="muted">Référence transaction : ${transaction.id}</p>
      `)
    });
  },

  async resultatTirage(user, grilles, boulestireees, gagnantes) {
    const isWinner = gagnantes.length > 0;
    const subject = isWinner ? '🏆 BINGO ! Vous avez gagné le jackpot !' : '😢 Résultat du tirage — Bingo Milou';

    const grillesHtml = grilles.map(g => {
      const hits = g.numeros.filter(n => boulestireees.includes(n));
      const isWin = gagnantes.some(gag => gag.id === g.id);
      return `
        <div style="background:#1E1640;border:1px solid ${isWin?'#2DC653':'rgba(255,215,0,0.2)'};border-radius:8px;padding:12px;margin:8px 0">
          <strong style="color:${isWin?'#2DC653':'#FFD700'}">${g.id}</strong>
          ${isWin ? '<span style="color:#2DC653;font-weight:900"> 🏆 BINGO !</span>' : ''}
          <br><span style="color:#8B7FC0;font-size:0.85rem">${hits.length}/20 numéros cochés</span>
        </div>`;
    }).join('');

    await transporter.sendMail({
      from: FROM, to: user.email,
      subject,
      html: baseTemplate(isWinner ? `
        <h2>🎉 FÉLICITATIONS <span class="gold">${user.prenom.toUpperCase()}</span> !</h2>
        <p>Vous avez décroché le jackpot Bingo Milou ! Vos 20 numéros font partie des 25 boules tirées.</p>
        <div style="text-align:center;padding:20px;background:linear-gradient(135deg,#1A0A00,#3D1E00);border-radius:12px;border:2px solid #FFD700;margin:20px 0">
          <div style="font-size:3rem;font-weight:900;color:#FFD700">🏆 BINGO !</div>
          <div style="font-size:2.5rem;font-weight:900;color:#FFD700">${gagnantes[0]?.montantGagne || 0} €</div>
        </div>
        <p>Votre gain sera <strong class="green">crédité sur votre compte</strong> dans les 24h ouvrées.</p>
        ${grillesHtml}
        <center><a class="btn" href="${SITE}/mon-compte">💰 Voir mes gains</a></center>
      ` : `
        <h2>Résultat du tirage</h2>
        <p>Bonjour <span class="gold">${user.prenom}</span>, voici le résultat pour vos grilles :</p>
        <p>Boules tirées : <strong class="gold">${boulestireees.join(', ')}</strong></p>
        ${grillesHtml}
        <p>Pas de chance cette fois, mais le jackpot continue de grossir ! 💪</p>
        <center><a class="btn" href="${SITE}">🎟️ Acheter des grilles pour le prochain tirage</a></center>
      `)
    });
  },

  async resetPassword(user, token) {
    const url = `${SITE}/reset-password?token=${token}`;
    await transporter.sendMail({
      from: FROM, to: user.email,
      subject: '🔐 Réinitialisation de mot de passe — Bingo Milou',
      html: baseTemplate(`
        <h2>Réinitialisation du mot de passe</h2>
        <p>Bonjour <span class="gold">${user.prenom}</span>,</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez ci-dessous :</p>
        <center><a class="btn" href="${url}">🔐 Réinitialiser mon mot de passe</a></center>
        <p class="muted">Ce lien expire dans 1h. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
      `)
    });
  },

  async notificationRetrait(user, montant) {
    await transporter.sendMail({
      from: FROM, to: user.email,
      subject: `💸 Votre retrait de ${montant} € est en cours`,
      html: baseTemplate(`
        <h2>Demande de retrait confirmée</h2>
        <p>Bonjour <span class="gold">${user.prenom}</span>,</p>
        <p>Votre demande de retrait de <strong class="green">${montant} €</strong> a bien été reçue.</p>
        <p>Le virement sera effectué sous <strong>3-5 jours ouvrés</strong>.</p>
        <center><a class="btn" href="${SITE}/mon-compte">📊 Mon compte</a></center>
      `)
    });
  },
};

module.exports = Emails;
