/**
 * @file src/hooks/craft-init.ts
 * registers crafting settings and integrates the craft tab into the downtime app.
 **/

import { MODULE_ID, SETTINGS } from '../module/constants.js';
import { log } from '../module/utils.js';

export const craft_init_hook = ( ): void =>
{
	Hooks.once( 'init', ( ) =>
	{
		log( 'registering craft settings' );

		/** register craft-enabled toggle **/
		/** lowercase purpose of the api call **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.CRAFT_ENABLED,
		{
			name: ( game as any ).i18n.localize( 'yugen-downtime.settings.craft-enabled.name' ),
			hint: ( game as any ).i18n.localize( 'yugen-downtime.settings.craft-enabled.hint' ),
			scope: 'world',
			config: true,
			type: Boolean,
			default: true
		} );

		/** store all gm-defined recipes **/
		/** lowercase purpose of the api call **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.RECIPES,
		{
			scope: 'world',
			config: false,
			type: Array,
			default: []
		} );

		/** store craft history logs **/
		/** lowercase purpose of the api call **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.CRAFT_LOGS,
		{
			scope: 'world',
			config: false,
			type: Array,
			default: []
		} );
	} );
};
