import { z } from 'zod';
import { DEEPSEEK_URL, VISION_MODEL, toDataUri } from '$lib/server/deepseekVision';

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

Keep the tone ultra-short, playful, friendly and easy to understand.

Do not use scientific jargon.

Return structured JSON only, using exactly this shape:

{
  "score": 78,
  "verdict": "Ziemlich wild!",
  "good": [
    "Viele verschiedene Pflanzen",
    "Blüten als Nahrungsquelle",
    "Dichte Vegetation zum Verstecken"
  ],
  "improve": [
    "Etwas Totholz ergänzen",
    "Mehr offene Erde lassen",
    "Weniger kurz gemähten Rasen"
  ],
  "curiosity": "Sieht vielversprechend aus – mal sehen, ob die Insekten das genauso sehen."
}

Rules:

- "score" must be an integer from 0–100.
- "verdict" should be 2–4 words.
- "good" must contain exactly 3 short items.
- "improve" must contain exactly 3 short items.
- "curiosity" must be one short sentence.
- Base all observations only on things clearly visible in the photo.
- If a feature cannot be seen, do not claim it is present or absent.
- Never mention that you are an AI.
- Return valid JSON only, with no markdown or extra prose.`;

const item = z.string().trim().min(1).max(120);

// Lenient on the score (models sometimes send 78.0 or "78") but strict on
// shape — a missing list item means the card would render broken.
const HabitatScoreSchema = z.object({
	score: z.coerce.number().min(0).max(100).transform(Math.round),
	verdict: z.string().trim().min(1).max(80),
	good: z.array(item).min(3).transform((a) => a.slice(0, 3)),
	improve: z.array(item).min(3).transform((a) => a.slice(0, 3)),
	curiosity: z.string().trim().min(1).max(300)
});

export type HabitatScore = z.infer<typeof HabitatScoreSchema>;

export class HabitatScoreError extends Error {}

/** Asks DeepSeek Vision for a playful German insect-friendliness rating of one photo. */
export async function scoreHabitatPhoto(params: {
	apiKey: string;
	imageBytes: ArrayBuffer;
	mimeType: string;
}): Promise<HabitatScore> {
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

	const result = HabitatScoreSchema.safeParse(parsed);
	if (!result.success) {
		throw new HabitatScoreError(`DeepSeek Vision returned unexpected shape: ${result.error.message}`);
	}
	return result.data;
}
