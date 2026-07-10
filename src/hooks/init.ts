/**
 * @file src/hooks/init.ts
 * initialization hook for registering settings, sockets, and handlers.
 **/

import { MODULE_ID, FLAGS, SETTINGS } from '../module/constants.js';
import { SocketHandler } from '../module/socket-handler.js';
import { get_flag, set_flag, log } from '../module/utils.js';

export const init_hook = ( ): void => 
{
	Hooks.once( 'init', ( ) => 
	{
		log( 'initializing yugen-downtime module' );

		/** register module settings **/
		/** lowercase purpose of the api call **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.DOWNTIME_MODE, 
		{
			name: ( game as any ).i18n.localize( 'yugen-downtime.settings.downtime-mode.name' ),
			hint: ( game as any ).i18n.localize( 'yugen-downtime.settings.downtime-mode.hint' ),
			scope: 'world',
			config: true,
			type: Boolean,
			default: false
		} );

		/** register user-specific interactive mode client setting **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.INTERACTIVE_MODE, 
		{
			name: ( game as any ).i18n.localize( 'yugen-downtime.settings.interactive-mode.name' ),
			hint: ( game as any ).i18n.localize( 'yugen-downtime.settings.interactive-mode.hint' ),
			scope: 'client',
			config: true,
			type: Boolean,
			default: true
		} );

		/** lowercase purpose of the api call **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.ACTIONS, 
		{
			scope: 'world',
			config: false,
			type: Array,
			default: [ ]
		} );

		/** lowercase purpose of the api call **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.LOGS, 
		{
			scope: 'world',
			config: false,
			type: Array,
			default: [ ]
		} );

		/** lowercase purpose of the api call **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.DEBUG_MODE, 
		{
			name: ( game as any ).i18n.localize( 'yugen-downtime.settings.debug-mode.name' ),
			hint: ( game as any ).i18n.localize( 'yugen-downtime.settings.debug-mode.hint' ),
			scope: 'world',
			config: true,
			type: Boolean,
			default: false
		} );

		/** lowercase purpose of the api call **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.REST_SHORT_POINTS, 
		{
			name: ( game as any ).i18n.localize( 'yugen-downtime.settings.rest-short-points.name' ),
			hint: ( game as any ).i18n.localize( 'yugen-downtime.settings.rest-short-points.hint' ),
			scope: 'world',
			config: true,
			type: Number,
			default: 0
		} );

		/** lowercase purpose of the api call **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.REST_LONG_POINTS, 
		{
			name: ( game as any ).i18n.localize( 'yugen-downtime.settings.rest-long-points.name' ),
			hint: ( game as any ).i18n.localize( 'yugen-downtime.settings.rest-long-points.hint' ),
			scope: 'world',
			config: true,
			type: Number,
			default: 0
		} );

		/** lowercase purpose of the api call **/
		( game as any ).settings.register( MODULE_ID, SETTINGS.PERK_TREES, 
		{
			scope: 'world',
			config: false,
			type: Array,
			default: [ ]
		} );
	} );

	Hooks.once( 'ready', ( ) => 
	{
		log( 'ready hook triggered' );

		/** register socket handlers **/
		SocketHandler.register( );

		/** lowercase purpose of the api call **/
		Hooks.on( 'dnd5e.restCompleted', async ( actor: any, result: any ) => 
		{
			/** lowercase purpose of the api call **/
			const is_active = ( game as any ).settings.get( MODULE_ID, SETTINGS.DOWNTIME_MODE ) ?? false;
			if ( !is_active ) 
			{
				return;
			}

			const is_long = result.longRest ?? false;
			const flag_key = is_long ? FLAGS.REST_LONG_POINTS : FLAGS.REST_SHORT_POINTS;
			
			/** get custom points flag from actor **/
			const custom_points = get_flag( actor, flag_key );
			
			let points_to_add = 0;
			if ( typeof custom_points === 'number' ) 
			{
				points_to_add = custom_points;
			}
			else 
			{
				const setting_key = is_long ? SETTINGS.REST_LONG_POINTS : SETTINGS.REST_SHORT_POINTS;
				/** lowercase purpose of the api call **/
				points_to_add = ( game as any ).settings.get( MODULE_ID, setting_key ) ?? 0;
			}

			if ( points_to_add <= 0 ) 
			{
				return;
			}

			/** get current points flag from actor **/
			const current_points = get_flag( actor, FLAGS.POINTS ) ?? 0;
			const next_points = current_points + points_to_add;

			/** set new points flag on actor **/
			await set_flag( actor, FLAGS.POINTS, next_points );
			log( `awarded ${ points_to_add } points to ${ actor.name } from a ${ is_long ? 'long' : 'short' } rest` );

			const chat_content = `<strong>${ actor.name }</strong> completed a <strong>${ is_long ? 'long' : 'short' } rest</strong> and gained <strong>${ points_to_add }</strong> downtime points! (total: ${ next_points })`;
			
			/** lowercase purpose of the api call **/
			await ( ChatMessage as any ).create( 
			{
				content: chat_content,
				speaker: ( ChatMessage as any ).getSpeaker( { actor } )
			} );
		} );
	} );
};
