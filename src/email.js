/**
 * BINGO MILOU — Emails via API HTTP Brevo
 */

const SITE = process.env.SITE_URL || 'http://localhost:3000';
const FROM_EMAIL = 'hello@bingomilou.com';
const FROM_NAME = 'Bingo Milou';

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('BREVO_API_KEY non configurée — email non envoyé');
    return;
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo API error: ${response.status} — ${err}`);
  }

  return response.json();
}

const baseTemplate = (content) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f0ff;font-family:'Segoe UI',Arial,sans-serif;color:#1a0a2e">
  <div style="max-width:600px;margin:0 auto;padding:20px">

    <div style="text-align:center;padding:30px 20px;background:linear-gradient(135deg,#1A0A00,#3D1E00);border-radius:16px 16px 0 0;border:2px solid #FFD700;border-bottom:none">
      <div style="font-size:2.2rem;font-weight:900;color:#FFD700;letter-spacing:2px">🎱 Bingo Milou</div>
      <div style="color:#c9b8e8;font-size:0.85rem;letter-spacing:3px;margin-top:5px">LE BONHEUR EN 20 NUMÉROS</div>
    </div>

    <div style="background:#ffffff;border:2px solid #FFD700;border-top:none;border-radius:0 0 16px 16px;padding:30px;color:#1a0a2e">
      ${content}
    </div>

    <div style="text-align:center;padding:20px;color:#666;font-size:0.75rem">
      © 2026 Bingo Milou · Jeu de loterie · 18+ uniquement<br>
      <a href="${SITE}/desabonnement" style="color:#888">Se désabonner</a>
    </div>
  </div>
</body>
</html>`;

const Emails = {

  async bienvenue(user, verifyToken) {
    const url = `${SITE}/api/auth/verify-email?token=${verifyToken}`;
    await sendEmail({
      to: user.email,
      subject: '🎱 Bienvenue chez Bingo Milou ! Confirmez votre email',
      html: baseTemplate(`
        <h2 style="color:#3D1E00;margin-top:0">Bonjour <span style="color:#FF8C00;font-weight:900">${user.prenom}</span> ! 👋</h2>
        <p style="color:#333;line-height:1.6">Bienvenue dans la grande famille Bingo Milou ! Vous êtes à un clic de tenter votre chance au jackpot.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#333;line-height:1.6">Pour activer votre compte, cliquez sur le bouton ci-dessous :</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#FF8C00,#FFD700);color:#1A0A00;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:900;font-size:1rem">✅ Confirmer mon email</a>
        </div>
        <p style="color:#888;font-size:0.85rem">Ce lien expire dans 24h. Si vous n'avez pas créé de compte, ignorez cet email.</p>
      `)
    });
  },

  async confirmationAchat(user, transaction, grilles) {
    const grillesHtml = grilles.slice(0,3).map(g =>
      `<div style="background:#fff9ee;border:1px solid #FFD700;border-radius:8px;padding:10px;margin:6px 0">
        <strong style="color:#FF8C00">${g.id}</strong> — Numéros : <span style="color:#333">${g.numeros.join(', ')}</span>
      </div>`
    ).join('') + (grilles.length > 3 ? `<p style="color:#888;font-size:0.85rem">... et ${grilles.length-3} autre(s) grille(s)</p>` : '');

    await sendEmail({
      to: user.email,
      subject: `🎟️ ${grilles.length} grille(s) achetée(s) — Bingo Milou`,
      html: baseTemplate(`
        <h2 style="color:#3D1E00;margin-top:0">Commande confirmée ! 🎉</h2>
        <p style="color:#333;line-height:1.6">Bonjour <strong style="color:#FF8C00">${user.prenom}</strong>,</p>
        <p style="color:#333;line-height:1.6">Votre achat de <strong style="color:#FF8C00">${grilles.length} grille(s)</strong> pour un montant de <strong style="color:#FF8C00">${transaction.montant} €</strong> a été confirmé.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <h3 style="color:#3D1E00">Vos grilles :</h3>
        ${grillesHtml}
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#333;line-height:1.6">🗓️ <strong>Prochain tirage :</strong> Samedi à 21h00 sur YouTube</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${SITE}" style="display:inline-block;background:linear-gradient(135deg,#FF8C00,#FFD700);color:#1A0A00;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:900;font-size:1rem">📋 Voir mes grilles</a>
        </div>
        <p style="color:#888;font-size:0.85rem">Référence transaction : ${transaction.id}</p>
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
        <div style="background:${isWin?'#f0fff4':'#fff9ee'};border:1px solid ${isWin?'#2DC653':'#FFD700'};border-radius:8px;padding:12px;margin:8px 0">
          <strong style="color:${isWin?'#1a7a3a':'#FF8C00'}">${g.id}</strong>
          ${isWin ? '<span style="color:#1a7a3a;font-weight:900"> 🏆 BINGO !</span>' : ''}
          <br><span style="color:#666;font-size:0.85rem">${hits.length}/20 numéros cochés</span>
        </div>`;
    }).join('');

    await sendEmail({
      to: user.email,
      subject,
      html: baseTemplate(isWinner ? `
        <h2 style="color:#3D1E00;margin-top:0">🎉 FÉLICITATIONS <span style="color:#FF8C00">${user.prenom.toUpperCase()}</span> !</h2>
        <p style="color:#333;line-height:1.6">Vous avez décroché le jackpot Bingo Milou !</p>
        <div style="text-align:center;padding:20px;background:linear-gradient(135deg,#1A0A00,#3D1E00);border-radius:12px;border:2px solid #FFD700;margin:20px 0">
          <div style="font-size:2.5rem;font-weight:900;color:#FFD700">🏆 BINGO !</div>
          <div style="font-size:2rem;font-weight:900;color:#FFD700">${gagnantes[0]?.montantGagne || 0} €</div>
        </div>
        <p style="color:#333;line-height:1.6">Votre gain sera <strong style="color:#1a7a3a">crédité sur votre compte</strong> dans les 24h ouvrées.</p>
        ${grillesHtml}
        <div style="text-align:center;margin:24px 0">
          <a href="${SITE}" style="display:inline-block;background:linear-gradient(135deg,#FF8C00,#FFD700);color:#1A0A00;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:900;font-size:1rem">💰 Voir mes gains</a>
        </div>
      ` : `
        <h2 style="color:#3D1E00;margin-top:0">Résultat du tirage</h2>
        <p style="color:#333;line-height:1.6">Bonjour <strong style="color:#FF8C00">${user.prenom}</strong>, voici le résultat pour vos grilles :</p>
        <p style="color:#333;line-height:1.6">Boules tirées : <strong style="color:#FF8C00">${boulestireees.join(', ')}</strong></p>
        ${grillesHtml}
        <p style="color:#333;line-height:1.6">Pas de chance cette fois, mais le jackpot continue de grossir ! 💪</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${SITE}" style="display:inline-block;background:linear-gradient(135deg,#FF8C00,#FFD700);color:#1A0A00;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:900;font-size:1rem">🎟️ Acheter des grilles</a>
        </div>
      `)
    });
  },

  async resetPassword(user, token) {
    const url = `${SITE}/reset-password?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: '🔐 Réinitialisation de mot de passe — Bingo Milou',
      html: baseTemplate(`
        <h2 style="color:#3D1E00;margin-top:0">Réinitialisation du mot de passe</h2>
        <p style="color:#333;line-height:1.6">Bonjour <strong style="color:#FF8C00">${user.prenom}</strong>,</p>
        <p style="color:#333;line-height:1.6">Vous avez demandé à réinitialiser votre mot de passe. Cliquez ci-dessous :</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#FF8C00,#FFD700);color:#1A0A00;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:900;font-size:1rem">🔐 Réinitialiser mon mot de passe</a>
        </div>
        <p style="color:#888;font-size:0.85rem">Ce lien expire dans 1h. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
      `)
    });
  },

  async notificationRetrait(user, montant) {
    await sendEmail({
      to: user.email,
      subject: `💸 Votre retrait de ${montant} € est en cours`,
      html: baseTemplate(`
        <h2 style="color:#3D1E00;margin-top:0">Demande de retrait confirmée</h2>
        <p style="color:#333;line-height:1.6">Bonjour <strong style="color:#FF8C00">${user.prenom}</strong>,</p>
        <p style="color:#333;line-height:1.6">Votre demande de retrait de <strong style="color:#1a7a3a">${montant} €</strong> a bien été reçue.</p>
        <p style="color:#333;line-height:1.6">Le virement sera effectué sous <strong>3-5 jours ouvrés</strong>.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${SITE}" style="display:inline-block;background:linear-gradient(135deg,#FF8C00,#FFD700);color:#1A0A00;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:900;font-size:1rem">📊 Mon compte</a>
        </div>
      `)
    });
  },
};

module.exports = Emails;