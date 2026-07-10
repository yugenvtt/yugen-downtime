/**
 * @file src/module/craft-app.ts
 * handles the crafting interface using applicationv2.
 * players browse recipes, drag items to verify ingredients, and click craft.
 * gms manage recipes and can drag any compendium/world item or spell into slots.
 **/

import { MODULE_ID, FLAGS, SETTINGS } from './constants.js';
import { get_flag, log, debug } from './utils.js';
import { SocketHandler } from './socket-handler.js';
import type { CraftRecipe, CraftIngredient } from './craft-handler.js';

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

export class CraftApp extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any )
{
	private static _instance: CraftApp | null = null;

	constructor( options: any = { } )
	{
		super( options );

		/** refresh on actor updates so ingredient availability is always current **/
		Hooks.on( 'updateActor', ( actor: any ) =>
		{
			const player_actor = ( game as any ).user.character || ( canvas as any ).tokens?.controlled[ 0 ]?.actor;
			if ( player_actor && actor.id === player_actor.id )
			{
				if ( this.state === ( ApplicationV2 as any ).RENDER_STATES.RENDERED )
				{
					this.render( );
				}
			}
		} );

		/** refresh on item changes in player actor **/
		Hooks.on( 'createItem', ( item: any ) =>
		{
			this._on_item_change( item.parent );
		} );

		Hooks.on( 'deleteItem', ( item: any ) =>
		{
			this._on_item_change( item.parent );
		} );

		Hooks.on( 'updateItem', ( item: any ) =>
		{
			this._on_item_change( item.parent );
		} );

		/** refresh on setting updates (recipes changed by gm) **/
		Hooks.on( 'updateSetting', ( setting: any ) =>
		{
			if ( setting.key.includes( MODULE_ID ) )
			{
				if ( this.state === ( ApplicationV2 as any ).RENDER_STATES.RENDERED )
				{
					this.render( );
				}
			}
		} );
	}

	/**
	 * only re-renders if the changed item belongs to the active player actor.
	 **/
	private _on_item_change( parent: any ): void
	{
		if ( !parent )
		{
			return;
		}
		const player_actor = ( game as any ).user.character || ( canvas as any ).tokens?.controlled[ 0 ]?.actor;
		if ( player_actor && parent.id === player_actor.id )
		{
			if ( this.state === ( ApplicationV2 as any ).RENDER_STATES.RENDERED )
			{
				this.render( );
			}
		}
	}

	/**
	 * singleton accessor.
	 **/
	public static get instance( ): CraftApp
	{
		if ( !this._instance )
		{
			this._instance = new CraftApp( );
		}
		return this._instance;
	}

	static DEFAULT_OPTIONS =
	{
		id: 'yugen-craft-app',
		tag: 'form',
		classes:
		[
			'yugen-app',
			'yugen-downtime',
			'yugen-craft',
			'app'
		],
		window:
		{
			title: 'yugen-downtime | craft',
			controls: [],
			resizable: true
		},
		position:
		{
			width: 900,
			height: 760
		}
	};

	static PARTS =
	{
		content:
		{
			template: 'modules/yugen-downtime/templates/craft-app.hbs'
		}
	};

	static TABS =
	{
		craft:
		{
			tabs:
			[
				{
					id: 'browse',
					label: 'Craft',
					icon: 'fas fa-hammer'
				},
				{
					id: 'manage-recipes',
					label: 'Recipes',
					icon: 'fas fa-scroll',
					cssClass: 'gm-only'
				}
			],
			initial: 'browse',
			label: true
		}
	};

	static ACTIONS =
	{
		tab: CraftApp._on_tab,
		craft: CraftApp._on_craft,
		'add-recipe': CraftApp._on_add_recipe,
		'delete-recipe': CraftApp._on_delete_recipe,
		'edit-recipe-field': CraftApp._on_edit_recipe_field,
		'remove-ingredient': CraftApp._on_remove_ingredient,
		'clear-craft-logs': CraftApp._on_clear_craft_logs
	};

	/**
	 * prepares the full context for rendering templates.
	 **/
	async _prepareContext( _options: any )
	{
		const is_gm = ( game as any ).user.isGM;

		/** lowercase purpose of the api call **/
		const craft_enabled = ( game as any ).settings.get( MODULE_ID, SETTINGS.CRAFT_ENABLED ) ?? false;

		/** lowercase purpose of the api call **/
		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [];

		/** resolve active player actor **/
		const player_actor = ( game as any ).user.character || ( canvas as any ).tokens?.controlled[ 0 ]?.actor;
		const player_points = player_actor ? ( get_flag( player_actor, FLAGS.POINTS ) ?? 0 ) : 0;

		/** annotate each recipe with ingredient availability status **/
		const annotated_recipes = recipes.map( ( recipe ) =>
		{
			const ingredients_with_status = recipe.ingredients.map( ( ing ) =>
			{
				const available = player_actor ? this._count_ingredient( player_actor, ing ) : 0;
				return {
					...ing,
					available,
					has_enough: available >= ing.quantity
				};
			} );

			const can_craft = craft_enabled &&
				!!player_actor &&
				player_points >= recipe.dt_cost &&
				ingredients_with_status.every( ( i ) => i.has_enough );

			return {
				...recipe,
				ingredients: ingredients_with_status,
				can_craft
			};
		} );

		/** craft logs for gm view **/
		/** lowercase purpose of the api call **/
		const raw_craft_logs = ( game as any ).settings.get( MODULE_ID, SETTINGS.CRAFT_LOGS ) || [];
		const craft_logs = raw_craft_logs.map( ( entry: any ) =>
		{
			const d = new Date( entry.timestamp );
			return {
				...entry,
				formatted_time: `${ d.toLocaleDateString( ) } ${ d.toLocaleTimeString( ) }`
			};
		} );

		/** player's own craft history **/
		const player_craft_logs = player_actor
			? craft_logs.filter( ( l: any ) => l.actor_id === player_actor.id )
			: [];

		/** filter tabs by role **/
		const tabs_config = ( foundry.utils as any ).duplicate( ( this.constructor as any ).TABS.craft );
		if ( !is_gm )
		{
			tabs_config.tabs = tabs_config.tabs.filter( ( t: any ) => t.id !== 'manage-recipes' );
		}

		/** gm defaults to manage tab if craft is disabled **/
		if ( is_gm && !craft_enabled && !this.tabGroups.craft )
		{
			this.tabGroups.craft = 'manage-recipes';
		}

		return {
			is_gm,
			craft_enabled,
			player:
			{
				has_actor: !!player_actor,
				name: player_actor?.name || '',
				points: player_points,
				id: player_actor?.id || ''
			},
			recipes: annotated_recipes,
			craft_logs,
			player_craft_logs,
			tabs: this._get_tabs_context( 'craft', tabs_config )
		};
	}

	/**
	 * counts how many of an ingredient the actor currently holds.
	 **/
	private _count_ingredient( actor: any, ingredient: CraftIngredient ): number
	{
		let total = 0;
		for ( const item of actor.items )
		{
			const matches_uuid = item.uuid === ingredient.uuid || item.sourceId === ingredient.uuid;
			const matches_name = item.name === ingredient.name;
			if ( matches_uuid || matches_name )
			{
				total += ( item.system?.quantity ?? 1 );
			}
		}
		return total;
	}

	/**
	 * event listeners bound on first render.
	 * drag-and-drop for ingredients and output is wired here.
	 **/
	protected _onFirstRender( _context: any, _options: any ): void
	{
		/** single delegated click listener **/
		this.element.addEventListener( 'click', ( event: any ) =>
		{
			const target = event.target.closest( '[data-action]' );
			if ( target && ![ 'INPUT', 'SELECT', 'TEXTAREA' ].includes( target.tagName ) )
			{
				this._onAction( event, target );
			}
		} );

		/** delegated change listener **/
		this.element.addEventListener( 'change', ( event: any ) =>
		{
			const target = event.target.closest( '[data-action]' );
			if ( target )
			{
				this._onAction( event, target );
			}
		} );

		/** drag-and-drop for ingredient and output slots **/
		this.element.addEventListener( 'dragover', ( event: any ) =>
		{
			const slot = event.target.closest( '.drop-slot' );
			if ( slot )
			{
				event.preventDefault( );
				slot.classList.add( 'drag-over' );
			}
		} );

		this.element.addEventListener( 'dragleave', ( event: any ) =>
		{
			const slot = event.target.closest( '.drop-slot' );
			if ( slot )
			{
				slot.classList.remove( 'drag-over' );
			}
		} );

		this.element.addEventListener( 'drop', ( event: any ) =>
		{
			const slot = event.target.closest( '.drop-slot' );
			if ( slot )
			{
				event.preventDefault( );
				slot.classList.remove( 'drag-over' );
				this._on_drop( event, slot );
			}
		} );
	}

	/**
	 * routes action to the matching static handler.
	 **/
	private _onAction( event: any, target: HTMLElement )
	{
		const action_name = target.dataset.action || '';
		const handler = ( this.constructor as any ).ACTIONS[ action_name ];
		if ( handler )
		{
			handler.call( this, event, target );
		}
	}

	/**
	 * handles item drops onto ingredient and output slots.
	 **/
	private async _on_drop( event: any, slot: HTMLElement ): Promise<void>
	{
		let drop_data: any = null;
		try
		{
			drop_data = JSON.parse( event.dataTransfer.getData( 'text/plain' ) );
		}
		catch ( e )
		{
			return;
		}

		/** only accept item drops **/
		if ( !drop_data || drop_data.type !== 'Item' )
		{
			return;
		}

		const recipe_id = slot.dataset.recipeId || '';
		const slot_type = slot.dataset.slotType || '';

		/** resolve the dropped item **/
		let item: any = null;
		try
		{
			item = await ( fromUuid as any )( drop_data.uuid );
		}
		catch ( e )
		{
			debug( `could not resolve dropped item uuid ${ drop_data.uuid }` );
			return;
		}

		if ( !item )
		{
			return;
		}

		const ingredient_data: CraftIngredient =
		{
			uuid: drop_data.uuid,
			name: item.name,
			img: item.img || 'icons/svg/item-bag.svg',
			quantity: 1
		};

		/** lowercase purpose of the api call **/
		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [];
		const recipe = recipes.find( ( r ) => r.id === recipe_id );

		if ( !recipe )
		{
			return;
		}

		if ( slot_type === 'output' )
		{
			recipe.output = ingredient_data;
		}
		else if ( slot_type === 'ingredient' )
		{
			/** avoid duplicate ingredients by uuid **/
			const existing_idx = recipe.ingredients.findIndex( ( i ) => i.uuid === ingredient_data.uuid );
			if ( existing_idx >= 0 )
			{
				recipe.ingredients[ existing_idx ].quantity += 1;
			}
			else
			{
				recipe.ingredients.push( ingredient_data );
			}
		}

		await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, recipes );
		this.render( );
	}

	/**
	 * helper to generate tab context data.
	 **/
	private _get_tabs_context( group: string, config_override: any = null )
	{
		const config = config_override || ( this.constructor as any ).TABS[ group ];
		const active = this.tabGroups[ group ] || config.initial;

		return Object.fromEntries( config.tabs.map( ( t: any ) =>
		{
			return [
				t.id,
				{
					...t,
					group,
					active: t.id === active,
					cssClass: t.id === active ? 'active' : ''
				}
			];
		} ) );
	}

	/** action: tab switch **/
	private static async _on_tab( this: CraftApp, _event: any, target: HTMLElement )
	{
		const group = target.dataset.group || '';
		const tab = target.dataset.tab || '';
		this.tabGroups[ group ] = tab;
		this.render( );
	}

	/**
	 * player clicks craft on a recipe.
	 **/
	private static async _on_craft( this: CraftApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const recipe_id = target.dataset.recipeId || '';
		const actor_id = target.dataset.actorId || '';

		if ( !recipe_id || !actor_id )
		{
			return;
		}

		await SocketHandler.emit_craft( actor_id, recipe_id );
	}

	/**
	 * gm adds a new blank recipe.
	 **/
	private static async _on_add_recipe( this: CraftApp, event: any, _target: HTMLButtonElement )
	{
		event.preventDefault( );

		/** lowercase purpose of the api call **/
		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [];
		const new_recipe: CraftRecipe =
		{
			id: ( foundry.utils as any ).randomID( ),
			name: 'New Recipe',
			description: 'Describe the crafting recipe here.',
			dt_cost: 1,
			ingredients: [],
			output:
			{
				uuid: '',
				name: 'Unknown Output',
				img: 'icons/svg/item-bag.svg',
				quantity: 1
			}
		};

		recipes.push( new_recipe );
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, recipes );
		this.render( );
	}

	/**
	 * gm deletes a recipe.
	 **/
	private static async _on_delete_recipe( this: CraftApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const recipe_id = target.dataset.recipeId || '';

		/** lowercase purpose of the api call **/
		let recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [];
		recipes = recipes.filter( ( r ) => r.id !== recipe_id );
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, recipes );
		this.render( );
	}

	/**
	 * gm edits a recipe field (name, description, dt_cost, ingredient quantity, output quantity).
	 **/
	private static async _on_edit_recipe_field( this: CraftApp, _event: any, target: HTMLInputElement | HTMLTextAreaElement )
	{
		const recipe_id = target.dataset.recipeId || '';
		const field = target.dataset.field || '';

		/** lowercase purpose of the api call **/
		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [];
		const recipe = recipes.find( ( r ) => r.id === recipe_id );

		if ( !recipe || !field )
		{
			return;
		}

		if ( field === 'dt_cost' )
		{
			recipe.dt_cost = Math.max( 0, parseInt( target.value ) || 0 );
		}
		else if ( field === 'output_quantity' )
		{
			recipe.output.quantity = Math.max( 1, parseInt( target.value ) || 1 );
		}
		else if ( field.startsWith( 'ingredient_quantity:' ) )
		{
			const ingredient_uuid = field.split( ':' )[ 1 ];
			const ingredient = recipe.ingredients.find( ( i ) => i.uuid === ingredient_uuid );
			if ( ingredient )
			{
				ingredient.quantity = Math.max( 1, parseInt( target.value ) || 1 );
			}
		}
		else
		{
			( recipe as any )[ field ] = target.value;
		}

		await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, recipes );
	}

	/**
	 * gm removes a specific ingredient from a recipe.
	 **/
	private static async _on_remove_ingredient( this: CraftApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const recipe_id = target.dataset.recipeId || '';
		const ingredient_uuid = target.dataset.ingredientUuid || '';

		/** lowercase purpose of the api call **/
		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [];
		const recipe = recipes.find( ( r ) => r.id === recipe_id );

		if ( !recipe )
		{
			return;
		}

		recipe.ingredients = recipe.ingredients.filter( ( i ) => i.uuid !== ingredient_uuid );
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, recipes );
		this.render( );
	}

	/**
	 * gm clears the craft logs.
	 **/
	private static async _on_clear_craft_logs( this: CraftApp, event: any, _target: HTMLButtonElement )
	{
		event.preventDefault( );
		/** lowercase purpose of the api call **/
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.CRAFT_LOGS, [] );
		this.render( );
	}
}
