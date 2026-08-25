import { register, init, getLocaleFromNavigator, waitLocale } from 'svelte-i18n';

import en from './en.json';
import de from './de.json';
import nl from './nl.json';

register('en', () => Promise.resolve(en));
register('de', () => Promise.resolve(de));
register('nl', () => Promise.resolve(nl));

export function initI18n(lang?: string) {
	const locale = lang ?? getLocaleFromNavigator() ?? 'en';
	const supported = ['en', 'de', 'nl'];
	const finalLocale = supported.includes(locale.split('-')[0]) ? locale.split('-')[0] : 'en';

	init({
		fallbackLocale: 'en',
		initialLocale: finalLocale
	});
}

export { waitLocale };
