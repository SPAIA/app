import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { addEmailSignup } from '$lib/server/db/emailSignups';
import { addPlaceLinkEmail, sendEmail } from '$lib/server/email';
import { isPlaceType } from '$lib/placeTypes';

const EmailSchema = z.email().max(254);

/** Where the visitor came from — kept on the signup so campaigns can be told apart. */
function sourceFrom(from: FormDataEntryValue | null): string {
	return from === 'naturlabor' ? 'naturlabor' : 'habitat';
}

export const load: PageServerLoad = async ({ locals }) => {
	return { signedIn: !!locals.user };
};

export const actions: Actions = {
	// "Nicht hier? Wir erinnern dich." — emails a link that confirms the
	// address and opens the add-place flow in one tap.
	remind: async ({ request, platform, url }) => {
		const env = platform?.env;
		if (!env?.DB) return fail(503, { error: 'unavailable' });

		const form = await request.formData();
		const parsed = EmailSchema.safeParse(String(form.get('email') ?? '').trim().toLowerCase());
		if (!parsed.success) return fail(400, { error: 'invalid' });
		const placeType = form.get('place_type');

		if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
			console.error('add-place link email skipped: RESEND_API_KEY / EMAIL_FROM not set');
			return fail(503, { error: 'unavailable' });
		}

		const token = await addEmailSignup(env.DB, {
			email: parsed.data,
			source: sourceFrom(form.get('from')),
			placeType: isPlaceType(placeType) ? placeType : null
		});

		try {
			await sendEmail(env, { to: parsed.data, ...addPlaceLinkEmail(`${url.origin}/ort/bestaetigen?token=${token}`) });
		} catch (e) {
			// Submitting again retries — an unconfirmed row just gets a fresh token.
			console.error('add-place link email failed', e);
			return fail(502, { error: 'send' });
		}

		return { success: true };
	}
};
