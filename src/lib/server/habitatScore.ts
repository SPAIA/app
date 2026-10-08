import type { Cookies } from '@sveltejs/kit';
import { z } from 'zod';
import { DEEPSEEK_URL, VISION_MODEL, toDataUri } from '$lib/server/deepseekVision';
import type { HabitatRead } from '$lib/habitat';

/** Anonymous visitors get this many scans before /habitat asks them to sign up. */
export const FREE_HABITAT_SCANS = 3;

const SCAN_COOKIE = 'spaia_habitat_scans';

// A cookie, not a DB row: anonymous visitors have no id to key on, and this
// only needs to stop casual reuse — clearing cookies resets it, which is fine.
export function readHabitatScanCount(cookies: Cookies): number {
	const n = Number(cookies.get(SCAN_COOKIE));
	return Number.isInteger(n) && n > 0 ? n : 0;
}

export function writeHabitatScanCount(cookies: Cookies, count: number) {
	cookies.set(SCAN_COOKIE, String(count), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
}

const PROMPT = `You are looking at a photo of an outdoor space.

Rate how insect-friendly this space appears to be from 0–100, based only on features you can clearly see in the image.

Consider visible features such as:
- flowers and flowering plants
- variety of plants
- tall or layered vegetation
- trees and shrubs
- bare soil
- dead wood
- fallen leaves
- potential shelter
- visible water
- closely cut lawn
- concrete, paving or sealed surfaces

Do not assume anything that is not visible.

Your entire response must be in German.

Keep the tone ultra-short, friendly and easy to understand.

Do not use scientific jargon.

Return structured JSON only, using exactly this shape:

{
  "score": 78,
  "features": [
    { "emoji": "🌸", "text": "Viele Blüten" },
    { "emoji": "🌿", "text": "Unterschiedliche Pflanzen" },
    { "emoji": "🍂", "text": "Gute Verstecke" }
  ]
}

Rules:

- "score" must be an integer from 0–100.
- "features" must contain exactly 3 items: the three visible features that most shaped the score, most important first. They may be good for insects (e.g. "Viele Blüten") or not (e.g. "Viel Pflaster").
- Each "text" is 1–4 words.
- Each "emoji" is exactly one emoji that fits the feature.
- Base all observations only on things clearly visible in the photo.
- If a feature cannot be seen, do not claim it is present or absent.
- Never mention that you are an AI.
- Return valid JSON only, with no markdown or extra prose.`;

// Lenient on the score (models sometimes send 78.0 or "78") but strict on
// shape — a missing feature means the card would render broken.
const HabitatReadSchema = z.object({
	score: z.coerce.number().min(0).max(100).transform(Math.round),
	features: z
		.array(z.object({ emoji: z.string().trim().min(1).max(16), text: z.string().trim().min(1).max(80) }))
		.min(3)
		.transform((a) => a.slice(0, 3))
});



export class HabitatScoreError extends Error {}

/** Asks DeepSeek Vision for a German insect-friendliness score plus the three features behind it. */
export async function scoreHabitatPhoto(params: {
	apiKey: string;
	imageBytes: ArrayBuffer;
	mimeType: string;
}): Promise<HabitatRead> {
	const res = await fetch(DEEPSEEK_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${params.apiKey}`
		},
		body: JSON.stringify({
			model: VISION_MODEL,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image_url', image_url: { url: toDataUri(params.imageBytes, params.mimeType) } },
						{ type: 'text', text: PROMPT }
					]
				}
			]
		})
	});

	if (!res.ok) {
		throw new HabitatScoreError(`DeepSeek Vision request failed: ${res.status} ${await res.text()}`);
	}

	const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
	const content = data.choices?.[0]?.message?.content;
	if (!content) throw new HabitatScoreError('DeepSeek Vision returned no content');

	let parsed: unknown;
	try {
		// Strip a stray ```json fence in case the model ignores the no-markdown rule.
		parsed = JSON.parse(content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
	} catch {
		throw new HabitatScoreError(`DeepSeek Vision returned invalid JSON: ${content.slice(0, 200)}`);
	}

	const result = HabitatReadSchema.safeParse(parsed);
	if (!result.success) {
		throw new HabitatScoreError(`DeepSeek Vision returned unexpected shape: ${result.error.message}`);
	}
	return result.data;
}
