// One-off: create the pay-what-you-want Price for the Bugmeister Hub Pack.
//
// Pay-what-you-want can only be configured on a Stripe Price object
// (custom_unit_amount), not on an inline checkout line item — so the
// checkout endpoint references this Price by id via STRIPE_PRICE_ID.
//
// Usage:  node scripts/create-stripe-price.mjs
// Reads STRIPE_SECRET_KEY from the environment, falling back to .dev.vars.
// Prints the new price id — paste it into STRIPE_PRICE_ID in .dev.vars
// (and set it as a Worker secret for production).

import { readFileSync } from 'node:fs';
import Stripe from 'stripe';

function loadKey() {
	if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;
	try {
		const vars = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
		const match = vars.match(/^STRIPE_SECRET_KEY=(.+)$/m);
		if (match) return match[1].trim();
	} catch {
		// .dev.vars not found — fall through
	}
	return null;
}

const key = loadKey();
if (!key) {
	console.error('No STRIPE_SECRET_KEY found in env or .dev.vars');
	process.exit(1);
}

const stripe = new Stripe(key);

const price = await stripe.prices.create({
	currency: 'eur',
	custom_unit_amount: {
		enabled: true,
		minimum: 100, // €1.00 floor (Stripe payment mode can't charge €0)
		preset: 1000 // suggested default shown to the customer: €10.00
	},
	product_data: { name: 'Bugmeister Hub Pack' }
});

console.log('\nCreated pay-what-you-want price:');
console.log(`  STRIPE_PRICE_ID=${price.id}\n`);
console.log('Paste that into .dev.vars (and your prod Worker secrets).');
