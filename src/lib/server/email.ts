/** Sends one transactional email through Resend. Throws on a non-2xx response. */
export async function sendEmail(
	env: { RESEND_API_KEY: string; EMAIL_FROM: string },
	message: { to: string; subject: string; html: string }
) {
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ from: env.EMAIL_FROM, ...message })
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Resend send failed (${res.status}): ${detail}`);
	}
}

/**
 * The "Nicht hier? Wir erinnern dich." email from /ort. One link does both
 * jobs: it confirms the address (double opt-in) and opens the add-place flow.
 */
export function addPlaceLinkEmail(linkUrl: string) {
	return {
		subject: 'Dein Link: Füge deinen Ort hinzu 🐛',
		html: `
			<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0C2464">
				<p style="font-size:32px;margin:0 0 8px">🐛</p>
				<h1 style="font-size:22px;margin:0 0 16px">Welcher Ort ist dir wichtig?</h1>
				<p style="line-height:1.55;margin:0 0 8px">Öffne diesen Link, wenn du an deinem Ort bist – dann kannst du ihn direkt bei SPAIA hinzufügen.</p>
				<p style="line-height:1.55;margin:0">Hilf uns, Stadtnatur in Deutschland besser zu verstehen – durch die Insekten, die dort leben.</p>
				<p style="margin:24px 0">
					<a href="${linkUrl}" style="background:#3CF4A2;color:#0C2464;text-decoration:none;padding:14px 28px;border-radius:999px;display:inline-block;font-weight:700">Ort hinzufügen</a>
				</p>
				<p style="color:#5B6B8F;font-size:13px;line-height:1.5">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>${linkUrl}</p>
				<p style="color:#5B6B8F;font-size:12px;line-height:1.5">Mit dem Klick bestätigst du auch deine E-Mail-Adresse. Du hast das nicht angefordert? Dann ignoriere diese E-Mail einfach – ohne Bestätigung schreiben wir dir nicht.</p>
			</div>`
	};
}
