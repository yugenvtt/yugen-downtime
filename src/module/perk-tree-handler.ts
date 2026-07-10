/**
 * @file src/module/perk-tree-handler.ts
 * gm-side execution logic for perk tree unlocks.
 **/

import { MODULE_ID, FLAGS, SETTINGS } from './constants.js';
import { get_flag, set_flag, log, debug } from './utils.js';

export interface PerkNode
{
	id: string;
	name: string;
	description: string;
	cost: number;
	icon: string;
	requirements: string[];
	macro_id: string;
	macro_name: string;
	effect: {
		name: string;
		img: string;
		description: string;
		changes: Array<{
			key: string;
			mode: number;
			value: string;
		}>;
	} | null;
}

export interface PerkTree
{
	id: string;
	name: string;
	nodes: PerkNode[];
}

export class PerkTreeHandler
{
	/**
	 * validates and executes a perk tree node unlock request.
	 **/
	public static async handle_unlock( data: any ): Promise<void>
	{
		debug( 'processing perk unlock request', data );

		/** verify downtime mode is active **/
		/** lowercase purpose of the api call **/
		const is_downtime_active = ( game as any ).settings.get( MODULE_ID, SETTINGS.DOWNTIME_MODE );
		if ( !is_downtime_active )
		{
			log( 'unlock rejected: downtime mode is inactive' );
			return;
		}

		/** lowercase purpose of the api call **/
		const actor = ( game as any ).actors.get( data.actor_id );
		if ( !actor )
		{
			console.error( `${ MODULE_ID } | unlock error: actor not found`, data.actor_id );
			return;
		}

		/** lowercase purpose of the api call **/
		const trees: PerkTree[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [ ];
		const tree = trees.find( ( t ) => 
		{
			return t.id === data.tree_id;
		} );

		if ( !tree )
		{
			console.error( `${ MODULE_ID } | unlock error: perk tree not found`, data.tree_id );
			return;
		}

		const node = tree.nodes.find( ( n ) => 
		{
			return n.id === data.node_id;
		} );

		if ( !node )
		{
			console.error( `${ MODULE_ID } | unlock error: perk node not found`, data.node_id );
			return;
		}

		/** verify downtime points **/
		const current_points = get_flag( actor, FLAGS.POINTS ) ?? 0;
		if ( current_points < node.cost )
		{
			log( `unlock rejected: ${ actor.name } has ${ current_points } points, node costs ${ node.cost }` );
			return;
		}

		/** verify prerequisites **/
		const progress = get_flag( actor, FLAGS.PERK_TREES ) || { };
		const tree_progress = progress[ tree.id ] || 
		{
			unlocked_nodes: [ ]
		};

		const missing_reqs = node.requirements.filter( ( req_id ) => 
		{
			return !tree_progress.unlocked_nodes.includes( req_id );
		} );

		if ( missing_reqs.length > 0 )
		{
			log( `unlock rejected: ${ actor.name } does not meet requirements for perk ${ node.name }` );
			return;
		}

		/** deduct downtime points **/
		const next_points = current_points - node.cost;
		await set_flag( actor, FLAGS.POINTS, next_points );
		log( `deducted ${ node.cost } dt points from ${ actor.name } for unlocking ${ node.name }` );

		/** update unlocked perks in actor flag **/
		tree_progress.unlocked_nodes.push( node.id );
		progress[ tree.id ] = tree_progress;
		await set_flag( actor, FLAGS.PERK_TREES, progress );
		log( `recorded perk ${ node.name } unlock for ${ actor.name }` );

		/** execute macro **/
		if ( node.macro_id || node.macro_name )
		{
			/** lowercase purpose of the api call **/
			const macro = ( game as any ).macros.get( node.macro_id ) || 
			              ( game as any ).macros.getName( node.macro_name );

			if ( macro )
			{
				log( `executing perk macro: ${ macro.name }` );
				try
				{
					macro.execute( { actor } );
				}
				catch ( err )
				{
					console.error( `${ MODULE_ID } | perk macro execution failed:`, err );
				}
			}
		}

		/** apply active effect **/
		if ( node.effect )
		{
			log( `applying perk active effect to ${ actor.name }` );
			try
			{
				const effect_data: any = 
				{
					name: node.effect.name,
					label: node.effect.name,
					img: node.effect.img || 'icons/svg/aura.svg',
					icon: node.effect.img || 'icons/svg/aura.svg',
					origin: `yugen-downtime`,
					description: node.effect.description,
					disabled: false,
					flags:
					{
						[ MODULE_ID ]:
						{
							node_id: node.id
						}
					},
					changes: node.effect.changes.map( ( c ) => 
					{
						return {
							key: c.key,
							mode: Number( c.mode ),
							value: c.value,
							priority: 20
						};
					} )
				};
				await actor.createEmbeddedDocuments( 'ActiveEffect', [ effect_data ] );
			}
			catch ( err )
			{
				console.error( `${ MODULE_ID } | applying custom active effect failed:`, err );
			}
		}

		/** send chat notification **/
		const chat_content = `<div class="downtime-chat-card perk-chat-card">
	<p><strong>${ ( globalThis as any ).yugen_utils.escape_html( actor.name ) }</strong> spent <strong>${ node.cost }</strong> downtime points to unlock: <strong>${ ( globalThis as any ).yugen_utils.escape_html( node.name ) }</strong></p>
	<div class="perk-result-row" style="display: flex; align-items: center; gap: 8px; margin: 8px 0; background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; border-left: 4px solid #eab308;">
		<img src="${ node.icon }" alt="${ ( globalThis as any ).yugen_utils.escape_html( node.name ) }" style="width: 36px; height: 36px; border: none; border-radius: 4px;">
		<div style="display: flex; flex-direction: column;">
			<span style="font-size: 0.75rem; color: #a1a1aa; text-transform: uppercase; font-weight: 600;">Perk Unlocked</span>
			<span style="font-weight: bold; color: #fff;">${ ( globalThis as any ).yugen_utils.escape_html( node.name ) }</span>
		</div>
	</div>
</div>`;

		/** lowercase purpose of the api call **/
		await ( ChatMessage as any ).create(
		{
			user: ( game as any ).user.id,
			speaker: ( ChatMessage as any ).getSpeaker( { actor } ),
			content: chat_content
		} );

		/** append to downtime logs **/
		/** lowercase purpose of the api call **/
		const current_logs = ( game as any ).settings.get( MODULE_ID, SETTINGS.LOGS ) || [ ];
		const new_log = 
		{
			id: ( foundry.utils as any ).randomID( ),
			timestamp: new Date( ).toISOString( ),
			actor_id: actor.id,
			actor_name: actor.name,
			action_name: `Unlocked Perk: ${ node.name }`,
			cost: node.cost,
			roll_check: '',
			roll_total: null,
			dc: 0,
			roll_success: true
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
