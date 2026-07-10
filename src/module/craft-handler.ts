/**
 * @file src/module/craft-handler.ts
 * gm-side execution logic for crafting requests via socket.
 **/

import { MODULE_ID, FLAGS, SETTINGS } from './constants.js';
import { get_flag, set_flag, log, debug } from './utils.js';

export interface CraftIngredient
{
	uuid: string;
	name: string;
	img: string;
	quantity: number;
}

export interface CraftRecipe
{
	id: string;
	name: string;
	description: string;
	dt_cost: number;
	ingredients: CraftIngredient[];
	output: CraftIngredient;
	macro_id?: string;
	macro_name?: string;
	effect?: {
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

export class CraftHandler
{
	/**
	 * called on gm client from socket, validates and executes a craft request.
	 **/
	public static async handle_craft( data: any ): Promise<void>
	{
		console.log( 'yugen-downtime | CraftHandler.handle_craft processing craft request | data:', data );

		/** verify craft is enabled **/
		/** lowercase purpose of the api call **/
		const craft_enabled = ( game as any ).settings.get( MODULE_ID, SETTINGS.CRAFT_ENABLED );
		if ( !craft_enabled )
		{
			console.warn( 'yugen-downtime | craft rejected: crafting is disabled' );
			return;
		}

		/** lowercase purpose of the api call **/
		const actor = ( game as any ).actors.get( data.actor_id );
		if ( !actor )
		{
			console.error( `yugen-downtime | craft error: actor not found | actor_id: ${ data.actor_id }` );
			return;
		}

		/** lowercase purpose of the api call **/
		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [];
		const recipe = recipes.find( ( r ) =>
		{
			return r.id === data.recipe_id;
		} );

		if ( !recipe )
		{
			console.error( `yugen-downtime | craft error: recipe not found | recipe_id: ${ data.recipe_id }` );
			return;
		}

		/** verify dt points **/
		const current_points = get_flag( actor, FLAGS.POINTS ) ?? 0;
		if ( current_points < recipe.dt_cost )
		{
			console.warn( `yugen-downtime | craft rejected: ${ actor.name } has ${ current_points } points, recipe costs ${ recipe.dt_cost }` );
			return;
		}

		/** verify all ingredients are present in actor inventory **/
		const missing = CraftHandler._check_ingredients( actor, recipe.ingredients );
		if ( missing.length > 0 )
		{
			console.warn( `yugen-downtime | craft rejected: ${ actor.name } is missing ingredients: ${ missing.join( ', ' ) }` );
			return;
		}

		/** consume ingredients **/
		await CraftHandler._consume_ingredients( actor, recipe.ingredients );

		/** deduct dt points **/
		const next_points = current_points - recipe.dt_cost;
		/** set updated points flag on actor **/
		await set_flag( actor, FLAGS.POINTS, next_points );
		log( `deducted ${ recipe.dt_cost } dt points from ${ actor.name } for crafting ${ recipe.output.name }` );

		/** produce output item **/
		await CraftHandler._produce_output( actor, recipe.output );

		/** execute macro **/
		if ( recipe.macro_id || recipe.macro_name )
		{
			const macro = ( game as any ).macros.get( recipe.macro_id ) || 
			              ( game as any ).macros.getName( recipe.macro_name );
			if ( macro )
			{
				log( `executing recipe macro: ${ macro.name }` );
				try
				{
					macro.execute( { actor } );
				}
				catch ( err )
				{
					console.error( `${ MODULE_ID } | recipe macro execution failed:`, err );
				}
			}
		}

		/** apply custom active effect **/
		if ( recipe.effect )
		{
			log( `applying custom active effect to ${ actor.name }` );
			try
			{
				const effect_data: any = {
					name: recipe.effect.name,
					label: recipe.effect.name,
					img: recipe.effect.img || 'icons/svg/aura.svg',
					icon: recipe.effect.img || 'icons/svg/aura.svg',
					origin: `yugen-downtime`,
					description: recipe.effect.description,
					disabled: false,
					changes: recipe.effect.changes.map( ( c ) => ( {
						key: c.key,
						mode: Number( c.mode ),
						value: c.value,
						priority: 20
					} ) )
				};
				await actor.createEmbeddedDocuments( 'ActiveEffect', [ effect_data ] );
			}
			catch ( err )
			{
				console.error( `${ MODULE_ID } | applying custom active effect failed:`, err );
			}
		}

		/** send chat notification **/
		const chat_content = `<div class="downtime-chat-card craft-chat-card">
	<p><strong>${ ( globalThis as any ).yugen_utils.escape_html( actor.name ) }</strong> spent <strong>${ recipe.dt_cost }</strong> downtime points to craft: <strong>${ ( globalThis as any ).yugen_utils.escape_html( recipe.output.name ) }</strong></p>
	<div class="craft-result-row">
		<img src="${ recipe.output.img }" alt="${ ( globalThis as any ).yugen_utils.escape_html( recipe.output.name ) }" class="craft-output-img">
		<div class="craft-result-info">
			<span class="craft-result-label">Obtained</span>
			<span class="craft-result-name">${ ( globalThis as any ).yugen_utils.escape_html( recipe.output.name ) } x${ recipe.output.quantity }</span>
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

		/** append to craft logs **/
		/** lowercase purpose of the api call **/
		const craft_logs = ( game as any ).settings.get( MODULE_ID, SETTINGS.CRAFT_LOGS ) || [];
		const new_log =
		{
			id: ( foundry.utils as any ).randomID( ),
			timestamp: new Date( ).toISOString( ),
			actor_id: actor.id,
			actor_name: actor.name,
			recipe_name: recipe.name,
			output_name: recipe.output.name,
			output_qty: recipe.output.quantity,
			dt_cost: recipe.dt_cost
		};
		craft_logs.unshift( new_log );
		if ( craft_logs.length > 100 )
		{
			craft_logs.length = 100;
		}
		/** lowercase purpose of the api call **/
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.CRAFT_LOGS, craft_logs );
	}

	/**
	 * returns the names of any missing or insufficient ingredients.
	 **/
	private static _check_ingredients( actor: any, ingredients: CraftIngredient[] ): string[]
	{
		const missing: string[] = [];

		for ( const ingredient of ingredients )
		{
			const quantity_needed = ingredient.quantity;
			let quantity_held = 0;

			/** sum up all matching items by uuid or name fallback **/
			for ( const item of actor.items )
			{
				const matches_uuid = item.uuid === ingredient.uuid || item.sourceId === ingredient.uuid;
				const matches_name = item.name === ingredient.name;

				if ( matches_uuid || matches_name )
				{
					quantity_held += ( item.system?.quantity ?? 1 );
				}
			}

			if ( quantity_held < quantity_needed )
			{
				missing.push( ingredient.name );
			}
		}

		return missing;
	}

	/**
	 * removes the required quantity of each ingredient from the actor's inventory.
	 **/
	private static async _consume_ingredients( actor: any, ingredients: CraftIngredient[] ): Promise<void>
	{
		for ( const ingredient of ingredients )
		{
			let remaining_to_consume = ingredient.quantity;

			/** gather matching items sorted so we deplete smallest stacks first **/
			const matches: any[] = actor.items.filter( ( item: any ) =>
			{
				return item.uuid === ingredient.uuid ||
					item.sourceId === ingredient.uuid ||
					item.name === ingredient.name;
			} ).sort( ( a: any, b: any ) =>
			{
				return ( a.system?.quantity ?? 1 ) - ( b.system?.quantity ?? 1 );
			} );

			for ( const item of matches )
			{
				if ( remaining_to_consume <= 0 )
				{
					break;
				}

				const stack = item.system?.quantity ?? 1;

				if ( stack <= remaining_to_consume )
				{
					remaining_to_consume -= stack;
					/** delete item document entirely **/
					await item.delete( );
				}
				else
				{
					/** reduce item quantity **/
					await item.update( { 'system.quantity': stack - remaining_to_consume } );
					remaining_to_consume = 0;
				}
			}
		}
	}

	/**
	 * creates the output item in the actor's inventory, resolved from uuid or plain item data.
	 **/
	private static async _produce_output( actor: any, output: any ): Promise<void>
	{
		let item_data: any = null;

		if ( output.item_data )
		{
			item_data = ( foundry.utils as any ).duplicate( output.item_data );
		}
		else
		{
			/** attempt to resolve the source document from its uuid **/
			let source_item: any = null;
			try
			{
				source_item = await ( fromUuid as any )( output.uuid );
			}
			catch ( e )
			{
				debug( `could not resolve output uuid ${ output.uuid }, falling back to plain item data` );
			}

			if ( source_item )
			{
				item_data = source_item.toObject( );
			}
		}
		if ( item_data )
		{
			item_data.system = item_data.system || {};

			/** set quantity if the system model supports it **/
			if ( typeof item_data.system.quantity !== 'undefined' )
			{
				item_data.system.quantity = output.quantity;
			}

			if ( item_data.flags )
			{
				for ( const key of Object.keys( item_data.flags ) )
				{
					if ( key.toLowerCase( ).includes( 'plutonium' ) )
					{
						delete item_data.flags[ key ];
					}
				}

				if ( item_data.flags.core?.sourceId?.toLowerCase( ).includes( 'plutonium' ) )
				{
					delete item_data.flags.core.sourceId;
				}
			}

			/** create item in actor inventory **/
			await actor.createEmbeddedDocuments( 'Item', [ item_data ] );
		}
		else
		{
			/** fallback: create a plain item entry with available metadata **/
			const fallback_data =
			{
				name: output.name,
				type: 'loot',
				img: output.img,
				system:
				{
					quantity: output.quantity
				}
			};
			await actor.createEmbeddedDocuments( 'Item', [ fallback_data ] );
		}

		log( `created ${ output.name } x${ output.quantity } in ${ actor.name }'s inventory` );
	}
}
