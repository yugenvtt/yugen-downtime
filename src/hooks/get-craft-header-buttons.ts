/**
 * @file src/hooks/get-craft-header-buttons.ts
 * adds a craft launcher to character sheet headers alongside the downtime button.
 **/

import { CraftApp } from '../module/craft-app.js';
import { MODULE_ID, SETTINGS } from '../module/constants.js';

export const get_craft_header_buttons_hook = ( ): void =>
{
	/** legacy sheet header buttons **/
	Hooks.on( 'getActorSheetHeaderButtons', ( sheet: any, buttons: any[] ) =>
	{
		const actor = sheet.actor;
		if ( !actor || actor.type !== 'character' )
		{
			return;
		}

		/** lowercase purpose of the api call **/
		const craft_enabled = ( game as any ).settings.get( MODULE_ID, SETTINGS.CRAFT_ENABLED ) ?? true;
		if ( !craft_enabled && !( game as any ).user.isGM )
		{
			return;
		}

		buttons.unshift(
		{
			class: 'yugen-craft-btn',
			icon: 'fas fa-hammer',
			label: 'Craft',
			onclick: async ( ) =>
			{
				const app = CraftApp.instance;
				app.render( { force: true } );
			}
		} );
	} );

	/** modern applicationv2 header controls **/
	Hooks.on( 'getHeaderControlsApplicationV2', ( application: any, controls: any[] ) =>
	{
		const actor = application.document;
		if ( !actor || actor.documentName !== 'Actor' || actor.type !== 'character' )
		{
			return;
		}

		/** lowercase purpose of the api call **/
		const craft_enabled = ( game as any ).settings.get( MODULE_ID, SETTINGS.CRAFT_ENABLED ) ?? true;
		if ( !craft_enabled && !( game as any ).user.isGM )
		{
			return;
		}

		controls.push(
		{
			icon: 'fa-solid fa-hammer',
			label: 'Craft',
			onClick: async ( ) =>
			{
				const app = CraftApp.instance;
				app.render( { force: true } );
			}
		} );
	} );
};
