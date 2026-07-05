/**
 * @file src/module/socket-handler.ts
 * handles cross-client communication for secure downtime actions.
 **/

import { MODULE_ID, FLAGS, SETTINGS } from './constants.js';
import { get_flag, set_flag, log, debug } from './utils.js';
import { CraftHandler } from './craft-handler.js';

export class SocketHandler 
{
	private static _registered = false;

	/**
	 * registers socket listeners for the module.
	 **/
	public static register( ): void 
	{
		if ( this._registered ) 
		{
			return;
		}

		const socket_name = `module.${ MODULE_ID }`;

		if ( !( game as any ).socket ) 
		{
			console.error( `${ MODULE_ID } | socket registration failed: game.socket is missing` );
			return;
		}

		log( `registering socket: ${ socket_name }` );

		( game as any ).socket.on( socket_name, ( data: any ) => 
		{
			const user = ( game as any ).user;
			debug( `socket message received by ${ user.name }`, data );

			if ( !user.isGM ) 
			{
				return;
			}

			/** handle buy-action on gm client **/
			if ( data.action === 'buy-action' ) 
			{
				SocketHandler.handle_buy_action( data ).catch( ( err ) => 
				{
					console.error( `${ MODULE_ID } | buy action execution failed:`, err );
				} );
			}

			/** handle craft-item on gm client **/
			if ( data.action === 'craft-item' )
			{
				CraftHandler.handle_craft( data ).catch( ( err ) =>
				{
					console.error( `${ MODULE_ID } | craft execution failed:`, err );
				} );
			}
		} );

		this._registered = true;
	}

	/**
	 * emits a craft request to the gm, or runs it directly if the user is a gm.
	 **/
	public static async emit_craft( actor_id: string, recipe_id: string ): Promise<void>
	{
		const data =
		{
			action: 'craft-item',
			actor_id,
			recipe_id
		};

		if ( ( game as any ).user.isGM )
		{
			await CraftHandler.handle_craft( data );
		}
		else
		{
			log( 'user is not gm, sending craft request via socket' );
			/** lowercase purpose of the api call **/
			( game as any ).socket.emit( `module.${ MODULE_ID }`, data );
		}
	}

	/**
	 * emits a purchase request to the gm, or runs it directly if the user is a gm.
	 **/
	public static async emit_buy_action( actor_id: string, action_id: string, roll_result: any = null ): Promise<void> 
	{
		const data = 
		{
			action: 'buy-action',
			actor_id,
			action_id,
			roll_result
		};

		if ( ( game as any ).user.isGM ) 
		{
			await SocketHandler.handle_buy_action( data );
		}
		else 
		{
			log( 'user is not gm, sending socket request to gm' );
			/** lowercase purpose of the api call **/
			( game as any ).socket.emit( `module.${ MODULE_ID }`, data );
		}
	}

	/**
	 * executes the downtime action purchase logic (executed only on GM client).
	 **/
	private static async handle_buy_action( data: any ): Promise<void> 
	{
		log( 'processing downtime action purchase request', data );

		/** verify downtime mode is enabled **/
		/** lowercase purpose of the api call **/
		const is_downtime_active = ( game as any ).settings.get( MODULE_ID, SETTINGS.DOWNTIME_MODE );
		if ( !is_downtime_active ) 
		{
			log( 'purchase rejected: downtime mode is inactive' );
			return;
		}

		/** lowercase purpose of the api call **/
		const actor = ( game as any ).actors.get( data.actor_id );
		if ( !actor ) 
		{
			console.error( `${ MODULE_ID } | purchase error: actor not found`, data.actor_id );
			return;
		}

		/** lowercase purpose of the api call **/
		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [ ];
		const selected_action = actions.find( ( a: any ) => 
		{
			return a.id === data.action_id;
		} );

		if ( !selected_action ) 
		{
			console.error( `${ MODULE_ID } | purchase error: action not found`, data.action_id );
			return;
		}

		/** check points flag **/
		const current_points = get_flag( actor, FLAGS.POINTS ) ?? 0;
		if ( current_points < selected_action.cost ) 
		{
			log( `purchase rejected: ${ actor.name } has ${ current_points } points, cost is ${ selected_action.cost }` );
			return;
		}

		/** determine roll success **/
		let roll_success = true;
		if ( data.roll_result ) 
		{
			roll_success = data.roll_result.success;
		}

		/** deduct points **/
		const next_points = current_points - selected_action.cost;
		/** lowercase purpose of the api call **/
		await set_flag( actor, FLAGS.POINTS, next_points );

		log( `deducted ${ selected_action.cost } points from ${ actor.name }` );

		/** execute macro (only on success) **/
		if ( roll_success && ( selected_action.macro_id || selected_action.macro_name ) ) 
		{
			/** lowercase purpose of the api call **/
			const macro = ( game as any ).macros.get( selected_action.macro_id ) || 
			              ( game as any ).macros.getName( selected_action.macro_name );

			if ( macro ) 
			{
				log( `executing macro: ${ macro.name }` );
				try 
				{
					/** execute macro with actor context **/
					macro.execute( { actor } );
				}
				catch ( err ) 
				{
					console.error( `${ MODULE_ID } | macro execution failed:`, err );
				}
			}
			else 
			{
				console.warn( `${ MODULE_ID } | macro not found: id=${ selected_action.macro_id }, name=${ selected_action.macro_name }` );
			}
		}

		/** send chat notification **/
		let chat_content = '';
		if ( data.roll_result ) 
		{
			const check_name = selected_action.roll_check.toUpperCase( );
			const success_text = roll_success ? 'SUCCESS' : 'FAILURE';
			const success_color = roll_success ? '#10b981' : '#ef4444';
			
			chat_content = `<div class="downtime-chat-card">
	<p><strong>${ actor.name }</strong> spent <strong>${ selected_action.cost }</strong> downtime points to attempt: <strong>${ selected_action.name }</strong></p>
	<div class="roll-result-box" style="border-left: 4px solid ${ success_color }; padding-left: 8px; margin: 8px 0;">
		<span style="font-weight: 600;">Check:</span> ${ check_name }<br/>
		<span style="font-weight: 600;">Roll Total:</span> ${ data.roll_result.total }<br/>
		${ selected_action.dc ? `<span style="font-weight: 600;">DC:</span> ${ selected_action.dc }<br/>` : '' }
		<span style="color: ${ success_color }; font-weight: bold;">Result: ${ success_text }</span>
	</div>
	${ roll_success ? '<p style="font-size: 0.95rem; color: #a1a1aa;">The downtime investment succeeded!</p>' : '<p style="font-size: 0.95rem; color: #a1a1aa;">The downtime investment failed, but points were spent.</p>' }
</div>`;
		}
		else 
		{
			/** lowercase purpose of the api call **/
			chat_content = ( game as any ).i18n.format( 'yugen-downtime.chat.spent', 
			{
				name: actor.name,
				cost: selected_action.cost,
				action: selected_action.name
			} );
		}

		/** lowercase purpose of the api call **/
		await ( ChatMessage as any ).create( 
		{
			user: ( game as any ).user.id,
			speaker: ( ChatMessage as any ).getSpeaker( { actor } ),
			content: chat_content
		} );

		/** append to logs setting **/
		/** lowercase purpose of the api call **/
		const current_logs = ( game as any ).settings.get( MODULE_ID, SETTINGS.LOGS ) || [ ];
		const new_log = 
		{
			id: ( foundry.utils as any ).randomID( ),
			timestamp: new Date( ).toISOString( ),
			actor_id: actor.id,
			actor_name: actor.name,
			action_name: selected_action.name,
			cost: selected_action.cost,
			roll_check: selected_action.roll_check || '',
			roll_total: data.roll_result ? data.roll_result.total : null,
			dc: selected_action.dc || 0,
			roll_success: roll_success
		};
		current_logs.unshift( new_log );
		if ( current_logs.length > 100 ) 
		{
			current_logs.length = 100;
		}
		/** lowercase purpose of the api call **/
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.LOGS, current_logs );
	}
}
