/**
 * @file src/hooks/get-scene-control-buttons.ts
 * adds a tool button to the scene controls for opening the downtime manager.
 **/

import { InteractiveDowntimeApp } from '../module/interactive-app.js';

export const get_scene_control_buttons_hook = ( ): void => 
{
	/** listen for the scene controls construction to inject the downtime manager tool **/
	Hooks.on( 'getSceneControlButtons', ( controls: any ) => 
	{
		const tool = 
		{
			name: 'yugen-downtime-tool',
			title: 'yugen-downtime',
			icon: 'fas fa-hourglass-half',
			onClick: ( ) => 
			{
				InteractiveDowntimeApp.open( );
			},
			button: true
		};

		/** register downtime tool button via shared library control utility **/
		( globalThis as any ).yugen_utils.register_control_tool( controls, 'tokens', tool );
	} );
};
