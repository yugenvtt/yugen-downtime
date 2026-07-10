/**
 * @file src/hooks/get-actor-sheet-header-buttons.ts
 * adds a downtime manager launcher button to character sheet headers.
 **/

import { InteractiveDowntimeApp } from '../module/interactive-app.js';

export const get_actor_sheet_header_buttons_hook = ( ): void => 
{
	/** listen for actor sheet header buttons construction (legacy sheets) **/
	Hooks.on( 'getActorSheetHeaderButtons', ( sheet: any, buttons: any[] ) => 
	{
		const actor = sheet.actor;
		if ( !actor || actor.type !== 'character' ) 
		{
			return;
		}

		buttons.unshift( 
		{
			class: 'yugen-downtime-btn',
			icon: 'fas fa-hourglass-half',
			label: 'Downtime',
			onclick: async ( ) => 
			{
				InteractiveDowntimeApp.open( actor );
			}
		} );
	} );

	/** listen for modern ApplicationV2 header controls construction **/
	Hooks.on( 'getHeaderControlsApplicationV2', ( application: any, controls: any[] ) => 
	{
		const actor = application.document;
		if ( !actor || actor.documentName !== 'Actor' || actor.type !== 'character' ) 
		{
			return;
		}

		controls.push( 
		{
			icon: 'fa-solid fa-hourglass-half',
			label: 'Downtime',
			onClick: async ( ) => 
			{
				InteractiveDowntimeApp.open( actor );
			}
		} );
	} );
};
