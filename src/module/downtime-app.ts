/**
 * @file src/module/downtime-app.ts
 * handles the downtime management interface using applicationv2.
 **/

import { MODULE_ID, FLAGS, SETTINGS } from './constants.js';
import { get_flag, set_flag, log, debug } from './utils.js';
import { SocketHandler } from './socket-handler.js';
import type { CraftRecipe, CraftIngredient } from './craft-handler.js';
import { DowntimeLogsApp } from './downtime-logs-app.js';
import { ActionEditor } from './action-editor.js';
import { RecipeEditor } from './recipe-editor.js';
import { PerkTreeEditor } from './perk-tree-editor.js';
import { DowntimeActorEditor } from './actor-editor.js';

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

function calculate_tiers( nodes: any[] ): any[] 
{
	const node_map = new Map( nodes.map( ( n ) => 
	{
		return [ n.id, { ...n, tier: 1 } ];
	} ) );
	let changed = true;
	let iterations = 0;
	while ( changed && iterations < 100 ) 
	{
		changed = false;
		iterations++;
		for ( const node of node_map.values( ) ) 
		{
			let max_req_tier = 0;
			for ( const req_id of node.requirements ) 
			{
				const req_node = node_map.get( req_id );
				if ( req_node && req_node.tier > max_req_tier ) 
				{
					max_req_tier = req_node.tier;
				}
			}
			if ( max_req_tier > 0 && node.tier !== max_req_tier + 1 ) 
			{
				node.tier = max_req_tier + 1;
				changed = true;
			}
		}
	}
	return Array.from( node_map.values( ) );
}

export class DowntimeApp extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any )
{
	private static _instance: DowntimeApp | null = null;
	private _sub_tab: string = 'actions-config';
	private _only_show_on_map: boolean = false;
	private _active_tree_id: string = '';
	private _actor_search_query: string = '';
	private _actor_search_focused: boolean = false;
	private _target_actor: any = null;

	public get target_actor( ): any
	{
		return this._target_actor;
	}

	public set target_actor( actor: any )
	{
		this._target_actor = actor;
	}

	constructor( options: any = { } )
	{
		super( options );

		/** listen for actor flag updates to refresh player point views **/
		Hooks.on( 'updateActor', ( actor: any ) =>
		{
			const player_actor = this.target_actor || ( canvas as any ).tokens?.controlled[ 0 ]?.actor;
			if ( player_actor && actor.id === player_actor.id )
			{
				if ( this.state === ( ApplicationV2 as any ).RENDER_STATES.RENDERED )
				{
					this.render( );
				}
			}
		} );

		/** refresh craft ingredient availability on inventory changes **/
		Hooks.on( 'createItem', ( item: any ) => { this._on_item_change( item.parent ); } );
		Hooks.on( 'deleteItem', ( item: any ) => { this._on_item_change( item.parent ); } );
		Hooks.on( 'updateItem', ( item: any ) => { this._on_item_change( item.parent ); } );

		/** listen for setting updates to keep UI synchronized globally **/
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

		const player_actor = this.target_actor || ( canvas as any ).tokens?.controlled[ 0 ]?.actor;
		if ( player_actor && parent.id === player_actor.id )
		{
			if ( this.state === ( ApplicationV2 as any ).RENDER_STATES.RENDERED )
			{
				this.render( );
			}
		}
	}

	/**
	 * singleton accessor to prevent multiple app instances.
	 **/
	public static get instance( ): DowntimeApp
	{
		if ( !this._instance )
		{
			this._instance = new DowntimeApp( );
		}
		return this._instance;
	}

	static DEFAULT_OPTIONS =
	{
		id: 'yugen-downtime-app',
		tag: 'form',
		classes:
		[
			'yugen-app',
			'yugen-downtime',
			'app'
		],
		window:
		{
			title: 'yugen-downtime',
			resizable: true
		},
		position:
		{
			width: 920,
			height: 760
		}
	};

	static PARTS =
	{
		content:
		{
			template: 'modules/yugen-downtime/templates/downtime-app.hbs'
		}
	};

	static TABS =
	{
		downtime:
		{
			tabs:
			[
				{
					id: 'actions',
					label: 'Actions',
					icon: 'fas fa-tasks'
				},
				{
					id: 'craft',
					label: 'Craft',
					icon: 'fas fa-hammer'
				},
				{
					id: 'perks',
					label: 'Perks',
					icon: 'fas fa-project-diagram'
				},
				{
					id: 'manage',
					label: 'Manage',
					icon: 'fas fa-cog',
					cssClass: 'gm-only'
				}
			],
			initial: 'actions',
			label: true
		}
	};

	static ACTIONS =
	{
		buy: DowntimeApp._on_buy,
		tab: DowntimeApp._on_tab,
		'add-action': DowntimeApp._on_add_action,
		'delete-action': DowntimeApp._on_delete_action,
		'toggle-mode': DowntimeApp._on_toggle_mode,
		'update-actor-points': DowntimeApp._on_update_actor_points,
		'update-actor-rate': DowntimeApp._on_update_actor_rate,
		'edit-action-field': DowntimeApp._on_edit_action_field,
		'clear-logs': DowntimeApp._on_clear_logs,
		craft: DowntimeApp._on_craft,
		'add-recipe': DowntimeApp._on_add_recipe,
		'delete-recipe': DowntimeApp._on_delete_recipe,
		'edit-recipe-field': DowntimeApp._on_edit_recipe_field,
		'remove-ingredient': DowntimeApp._on_remove_ingredient,
		'clear-craft-logs': DowntimeApp._on_clear_craft_logs,
		'open-logs': DowntimeApp._on_open_logs,
		'sub-tab': DowntimeApp._on_sub_tab,
		'edit-action': DowntimeApp._on_edit_action,
		'edit-recipe': DowntimeApp._on_edit_recipe,
		'edit-actor': DowntimeApp._on_edit_actor,
		'toggle-map-filter': DowntimeApp._on_toggle_map_filter,
		'assign-tree': DowntimeApp._on_assign_tree,
		'unassign-tree': DowntimeApp._on_unassign_tree,
		'add-tree': DowntimeApp._on_add_tree,
		'edit-tree': DowntimeApp._on_edit_tree,
		'delete-tree': DowntimeApp._on_delete_tree,
		'select-player-tree': DowntimeApp._on_select_player_tree,
		'unlock-node': DowntimeApp._on_unlock_node,
		'refund-node': DowntimeApp._on_refund_node,
		'revoke-node': DowntimeApp._on_revoke_node
	};

	/**
	 * prepares context data for rendering templates.
	 **/
	async _prepareContext( _options: any )
	{
		const is_gm = ( game as any ).user.isGM;

		/** lowercase purpose of the api call **/
		const is_active = ( game as any ).settings.get( MODULE_ID, SETTINGS.DOWNTIME_MODE ) ?? false;
		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [];

		/** lowercase purpose of the api call **/
		const craft_enabled = ( game as any ).settings.get( MODULE_ID, SETTINGS.CRAFT_ENABLED ) ?? false;

		/** lowercase purpose of the api call **/
		const raw_recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [];

		/** lowercase purpose of the api call **/
		const global_trees = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [];

		/** resolve active player actor **/
		const player_actor = this.target_actor || ( canvas as any ).tokens?.controlled[ 0 ]?.actor;
		const player_points = player_actor ? ( get_flag( player_actor, FLAGS.POINTS ) ?? 0 ) : 0;

		/** filter player view of actions **/
		const mapped_actions = actions.map( ( action: any ) =>
		{
			return {
				...action,
				can_afford: player_points >= action.cost
			};
		} );

		/** gather macros list for the gm editor **/
		const macros = is_gm ? ( game as any ).macros.contents.map( ( m: any ) =>
		{
			return {
				id: m.id,
				name: m.name
			};
		} ) : [];

		/** prepare perk trees for player **/
		const progress = player_actor ? ( get_flag( player_actor, FLAGS.PERK_TREES ) || {} ) : {};
		const player_assigned_trees = global_trees.filter( ( t: any ) => 
		{
			return progress[ t.id ] !== undefined;
		} ).map( ( t: any ) => 
		{
			const tree_prog = progress[ t.id ] || { unlocked_nodes: [] };

			/** annotate nodes with player status **/
			const annotated_nodes = t.nodes.map( ( n: any ) => 
			{
				const is_unlocked = tree_prog.unlocked_nodes.includes( n.id );

				/** check requirements **/
				const missing_reqs = n.requirements.filter( ( req_id: string ) => 
				{
					return !tree_prog.unlocked_nodes.includes( req_id );
				} );

				const is_available = !is_unlocked && missing_reqs.length === 0;
				const is_locked = !is_unlocked && missing_reqs.length > 0;
				const can_afford = is_available && player_points >= n.cost;

				/** format requirement names **/
				const req_names = n.requirements.map( ( req_id: string ) => 
				{
					const req_node = t.nodes.find( ( o: any ) => o.id === req_id );
					return req_node ? req_node.name : 'Unknown';
				} );

				return {
					...n,
					is_unlocked,
					is_locked,
					is_available,
					can_afford,
					req_list: req_names.join( ', ' )
				};
			} );

			/** calculate tiers **/
			const nodes_with_tiers = calculate_tiers( annotated_nodes );

			/** group by tier **/
			const tiers_map = new Map( );
			nodes_with_tiers.forEach( ( n: any ) => 
			{
				if ( !tiers_map.has( n.tier ) ) 
				{
					tiers_map.set( n.tier, [] );
				}
				tiers_map.get( n.tier ).push( n );
			} );

			const tiers = Array.from( tiers_map.entries( ) ).map( ( [ tier_num, tier_nodes ] ) => 
			{
				return {
					tier_number: tier_num,
					nodes: tier_nodes
				};
			} ).sort( ( a, b ) => a.tier_number - b.tier_number );

			return {
				id: t.id,
				name: t.name,
				nodes: annotated_nodes,
				tiers
			};
		} );

		if ( !this._active_tree_id && player_assigned_trees.length > 0 )
		{
			this._active_tree_id = player_assigned_trees[ 0 ].id;
		}

		const active_player_tree = player_assigned_trees.find( ( t: any ) => 
		{
			return t.id === this._active_tree_id;
		} ) || player_assigned_trees[ 0 ] || null;

		/** gather player character actors list for points config **/
		let character_actors: any[] = [];
		if ( is_gm )
		{
			const actors_map = new Map( );

			if ( this._only_show_on_map )
			{
				/** only add character actors with active tokens on the current scene **/
				( canvas as any ).tokens?.placeables.map( ( t: any ) =>
				{
					return t.actor;
				} ).filter( ( a: any ) =>
				{
					return a && a.type === 'character';
				} ).forEach( ( a: any ) =>
				{
					actors_map.set( a.id, a );
				} );
			}
			else
			{
				/** 1. add actors of type 'character' from the directory **/
				( game as any ).actors.filter( ( a: any ) =>
				{
					return a.type === 'character';
				} ).forEach( ( a: any ) =>
				{
					actors_map.set( a.id, a );
				} );

				/** 2. add actors assigned to active users **/
				( game as any ).users.forEach( ( u: any ) =>
				{
					if ( u.character && u.character.type === 'character' )
					{
						actors_map.set( u.character.id, u.character );
					}
				} );

				/** 3. add active tokens on scene of type 'character' **/
				( canvas as any ).tokens?.placeables.map( ( t: any ) =>
				{
					return t.actor;
				} ).filter( ( a: any ) =>
				{
					return a && a.type === 'character';
				} ).forEach( ( a: any ) =>
				{
					actors_map.set( a.id, a );
				} );
			}

			const global_short = ( game as any ).settings.get( MODULE_ID, SETTINGS.REST_SHORT_POINTS ) ?? 0;
			const global_long = ( game as any ).settings.get( MODULE_ID, SETTINGS.REST_LONG_POINTS ) ?? 0;

			character_actors = Array.from( actors_map.values( ) ).map( ( a: any ) =>
			{
				const act_progress = get_flag( a, FLAGS.PERK_TREES ) || {};
				const assigned_tree_list = global_trees.filter( ( t: any ) => 
				{
					return act_progress[ t.id ] !== undefined;
				} ).map( ( t: any ) => 
				{
					return {
						id: t.id,
						name: t.name
					};
				} );

				const unassigned_tree_list = global_trees.filter( ( t: any ) => 
				{
					return act_progress[ t.id ] === undefined;
				} ).map( ( t: any ) => 
				{
					return {
						id: t.id,
						name: t.name
					};
				} );

				return {
					id: a.id,
					name: a.name,
					img: a.img || 'icons/svg/mystery-man.svg',
					points: get_flag( a, FLAGS.POINTS ) ?? 0,
					rest_short: get_flag( a, FLAGS.REST_SHORT_POINTS ) ?? global_short,
					rest_long: get_flag( a, FLAGS.REST_LONG_POINTS ) ?? global_long,
					assigned_trees: assigned_tree_list,
					unassigned_trees: unassigned_tree_list
				};
			} );

			if ( this._actor_search_query )
			{
				const query = this._actor_search_query.toLowerCase( );
				character_actors = character_actors.filter( ( a: any ) => 
				{
					return a.name.toLowerCase( ).includes( query );
				} );
			}
		}

		/** gather and format downtime logs **/
		const raw_logs = ( game as any ).settings.get( MODULE_ID, SETTINGS.LOGS ) || [];
		const formatted_logs = raw_logs.map( ( log_entry: any ) =>
		{
			const d = new Date( log_entry.timestamp );
			const formatted_time = `${ d.toLocaleDateString( ) } ${ d.toLocaleTimeString( ) }`;
			return {
				...log_entry,
				formatted_time
			};
		} );

		/** gather and format player-specific logs **/
		const player_logs = player_actor ? formatted_logs.filter( ( l: any ) =>
		{
			return l.actor_id === player_actor.id;
		} ) : [];

		/** annotate each recipe with live ingredient availability from player inventory **/
		const recipes = raw_recipes.map( ( recipe ) =>
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

		/** gather and format craft logs **/
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

		const player_craft_logs = player_actor
			? craft_logs.filter( ( l: any ) => l.actor_id === player_actor.id )
			: [];

		const roll_choices =
		[
			{ id: '', name: 'None' },
			{ id: 'str', name: 'Strength' },
			{ id: 'dex', name: 'Dexterity' },
			{ id: 'con', name: 'Constitution' },
			{ id: 'int', name: 'Intelligence' },
			{ id: 'wis', name: 'Wisdom' },
			{ id: 'cha', name: 'Charisma' },
			{ id: 'ath', name: 'Athletics' },
			{ id: 'acr', name: 'Acrobatics' },
			{ id: 'slh', name: 'Sleight of Hand' },
			{ id: 'ste', name: 'Stealth' },
			{ id: 'arc', name: 'Arcana' },
			{ id: 'his', name: 'History' },
			{ id: 'inv', name: 'Investigation' },
			{ id: 'nat', name: 'Nature' },
			{ id: 'rel', name: 'Religion' },
			{ id: 'ani', name: 'Animal Handling' },
			{ id: 'ins', name: 'Insight' },
			{ id: 'med', name: 'Medicine' },
			{ id: 'prc', name: 'Perception' },
			{ id: 'sur', name: 'Survival' },
			{ id: 'dec', name: 'Deception' },
			{ id: 'itm', name: 'Intimidation' },
			{ id: 'prf', name: 'Performance' },
			{ id: 'per', name: 'Persuasion' }
		];

		/** handle tabs configuration **/
		const tabs_config = ( foundry.utils as any ).duplicate( ( this.constructor as any ).TABS.downtime );
		if ( !is_gm )
		{
			tabs_config.tabs = tabs_config.tabs.filter( ( t: any ) =>
			{
				if ( t.id === 'manage' ) { return false; }
				if ( t.id === 'craft' && !craft_enabled ) { return false; }
				return true;
			} );
		}

		/** GM defaults to manage tab if downtime mode is off **/
		if ( is_gm && !is_active && !this.tabGroups.downtime )
		{
			this.tabGroups.downtime = 'manage';
		}

		return {
			is_gm,
			is_active,
			craft_enabled,
			sub_tab: this._sub_tab,
			only_show_on_map: this._only_show_on_map,
			actor_search_query: this._actor_search_query,
			player:
			{
				has_actor: !!player_actor,
				name: player_actor?.name || '',
				points: player_points,
				id: player_actor?.id || ''
			},
			actions: mapped_actions,
			macros,
			actors: character_actors,
			logs: formatted_logs,
			player_logs,
			recipes,
			craft_logs,
			player_craft_logs,
			roll_choices,
			perk_trees: global_trees,
			player_trees: player_assigned_trees,
			active_tree: active_player_tree,
			tabs: this._get_tabs_context( 'downtime', tabs_config )
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
	 **/
	protected _onFirstRender( _context: any, _options: any ): void
	{
		/** single delegated click listener for all app actions **/
		this.element.addEventListener( 'click', ( event: any ) =>
		{
			const target = event.target.closest( '[data-action]' );
			if ( target && ![ 'INPUT', 'SELECT', 'TEXTAREA' ].includes( target.tagName ) )
			{
				this._onAction( event, target );
			}
		} );

		/** delegated change listener for inputs **/
		this.element.addEventListener( 'change', ( event: any ) =>
		{
			const target = event.target.closest( '[data-action]' );
			if ( target )
			{
				this._onAction( event, target );
			}
		} );

		/** drag-and-drop for recipe ingredient and output slots **/
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

		/** search input event listener **/
		this.element.addEventListener( 'input', ( event: any ) =>
		{
			const target = event.target.closest( '.actor-search-input' );
			if ( target )
			{
				this._actor_search_query = target.value;
				this._actor_search_focused = true;
				this.render( );
			}
		} );
	}

	protected async _onRender( context: any, options: any )
	{
		await super._onRender( context, options );
		if ( this._actor_search_focused )
		{
			const search_input = this.element.querySelector( '#yugen-downtime-actor-search' ) as HTMLInputElement;
			if ( search_input )
			{
				search_input.focus( );
				const len = search_input.value.length;
				search_input.setSelectionRange( len, len );
			}
			this._actor_search_focused = false;
		}
	}

	/**
	 * routes action string to the appropriate static method handler.
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
	 * handles item drops onto recipe ingredient and output slots.
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

		if ( !drop_data || drop_data.type !== 'Item' )
		{
			return;
		}

		const recipe_id = slot.dataset.recipeId || '';
		const slot_type = slot.dataset.slotType || '';

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
			/** avoid duplicate ingredients; increment quantity instead **/
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

	/**
	 * action handler for tab selection.
	 **/
	private static async _on_tab( this: DowntimeApp, event: any, target: HTMLElement )
	{
		const group = target.dataset.group || '';
		const tab = target.dataset.tab || '';
		this.tabGroups[ group ] = tab;
		this.render( );
	}

	/**
	 * player buys a downtime action.
	 **/
	private static async _on_buy( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );

		if ( !( game as any ).user.isGM )
		{
			const has_active_gm: boolean = ( game as any ).users.some( ( u: any ) => u.isGM && u.active );
			if ( !has_active_gm )
			{
				/** lowercase purpose of the api call **/
				( ui as any ).notifications.warn( ( game as any ).i18n.localize( 'yugen-downtime.notifications.no-gm-online' ) );
				return;
			}
		}

		const action_id = target.dataset.actionId || '';
		const actor_id = target.dataset.actorId || '';

		if ( !action_id || !actor_id )
		{
			return;
		}

		/** lowercase purpose of the api call **/
		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [];
		const action = actions.find( ( a: any ) =>
		{
			return a.id === action_id;
		} );

		if ( !action )
		{
			return;
		}

		let roll_result = null;

		if ( action.roll_check )
		{
			/** lowercase purpose of the api call **/
			const actor = ( game as any ).actors.get( actor_id );
			if ( !actor )
			{
				return;
			}

			const abilities =
			[
				'str',
				'dex',
				'con',
				'int',
				'wis',
				'cha'
			];
			let roll = null;

			try
			{
				if ( abilities.includes( action.roll_check ) )
				{
					/** lowercase purpose of the api call **/
					roll = await actor.rollAbilityCheck( { ability: action.roll_check } );
				}
				else
				{
					/** lowercase purpose of the api call **/
					roll = await actor.rollSkill( { skill: action.roll_check } );
				}
			}
			catch ( err )
			{
				console.error( `${ MODULE_ID } | roll execution failed:`, err );
				return;
			}

			if ( !roll )
			{
				return;
			}

			let actual_roll = roll;
			if ( Array.isArray( roll ) )
			{
				actual_roll = roll[ 0 ];
			}
			else if ( roll && typeof roll === 'object' && roll.rolls && Array.isArray( roll.rolls ) )
			{
				actual_roll = roll.rolls[ 0 ];
			}

			if ( !actual_roll )
			{
				return;
			}

			/** ensure the roll is evaluated **/
			const is_evaluated = actual_roll.evaluated || actual_roll._evaluated || typeof actual_roll.total === 'number';
			if ( !is_evaluated && typeof actual_roll.evaluateSync === 'function' )
			{
				try
				{
					actual_roll.evaluateSync( );
				}
				catch ( e )
				{
					console.error( `${ MODULE_ID } | failed to evaluate roll synchronously:`, e );
				}
			}

			const roll_total = typeof actual_roll.total !== 'undefined' ? actual_roll.total : ( typeof actual_roll._total !== 'undefined' ? actual_roll._total : 0 );
			const roll_formula = actual_roll.formula || '';

			roll_result =
			{
				total: roll_total,
				formula: roll_formula,
				dc: action.dc || 0,
				success: action.dc ? roll_total >= action.dc : true
			};
		}

		await SocketHandler.emit_buy_action( actor_id, action_id, roll_result );
	}

	/**
	 * GM adds a new downtime action.
	 **/
	private static async _on_add_action( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [];
		const new_action =
		{
			id: ( foundry.utils as any ).randomID( ),
			name: 'New Action',
			description: 'Downtime action description',
			cost: 1,
			macro_id: '',
			macro_name: '',
			roll_check: '',
			dc: 0
		};

		actions.push( new_action );
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.ACTIONS, actions );
		this.render( );
	}

	/**
	 * GM deletes a downtime action.
	 **/
	private static async _on_delete_action( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const action_id = target.dataset.actionId || '';
		let actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [];
		actions = actions.filter( ( a: any ) =>
		{
			return a.id !== action_id;
		} );

		await ( game as any ).settings.set( MODULE_ID, SETTINGS.ACTIONS, actions );
		this.render( );
	}

	/**
	 * GM toggles downtime mode status.
	 **/
	private static async _on_toggle_mode( this: DowntimeApp, event: any, target: HTMLInputElement )
	{
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.DOWNTIME_MODE, target.checked );
		log( `downtime mode toggled: ${ target.checked }` );
		this.render( );
	}

	/**
	 * GM edits a specific property of a downtime action.
	 **/
	private static async _on_edit_action_field( this: DowntimeApp, event: any, target: HTMLInputElement | HTMLSelectElement )
	{
		const action_id = target.dataset.actionId || '';
		const field = target.dataset.field || '';
		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [];
		const action = actions.find( ( a: any ) =>
		{
			return a.id === action_id;
		} );

		if ( !action || !field )
		{
			return;
		}

		if ( field === 'cost' )
		{
			action.cost = Math.max( 0, parseInt( target.value ) || 0 );
		}
		else if ( field === 'dc' )
		{
			action.dc = Math.max( 0, parseInt( target.value ) || 0 );
		}
		else if ( field === 'macro' )
		{
			const macro_id = target.value;
			/** lowercase purpose of the api call **/
			const macro = ( game as any ).macros.get( macro_id );
			action.macro_id = macro_id;
			action.macro_name = macro ? macro.name : '';
		}
		else
		{
			action[ field ] = target.value;
		}

		await ( game as any ).settings.set( MODULE_ID, SETTINGS.ACTIONS, actions );
		/** only re-render if it was a selection dropdown to prevent losing input focus **/
		if ( target.tagName === 'SELECT' )
		{
			this.render( );
		}
	}

	/**
	 * GM updates character downtime points directly.
	 **/
	private static async _on_update_actor_points( this: DowntimeApp, event: any, target: HTMLInputElement )
	{
		const actor_id = target.dataset.actorId || '';
		/** lowercase purpose of the api call **/
		const actor = ( game as any ).actors.get( actor_id );
		if ( !actor )
		{
			return;
		}

		const points = Math.max( 0, parseInt( target.value ) || 0 );
		/** set current points flag on actor **/
		await set_flag( actor, FLAGS.POINTS, points );
		log( `allocated ${ points } points to actor: ${ actor.name }` );
	}

	/**
	 * GM updates character custom rest point rates.
	 **/
	private static async _on_update_actor_rate( this: DowntimeApp, event: any, target: HTMLInputElement )
	{
		const actor_id = target.dataset.actorId || '';
		const rate_type = target.dataset.rateType || '';
		/** lowercase purpose of the api call **/
		const actor = ( game as any ).actors.get( actor_id );
		if ( !actor || !rate_type )
		{
			return;
		}

		const rate = Math.max( 0, parseInt( target.value ) || 0 );
		const flag_key = rate_type === 'long' ? FLAGS.REST_LONG_POINTS : FLAGS.REST_SHORT_POINTS;
		/** set custom rest points flag on actor **/
		await set_flag( actor, flag_key, rate );
		log( `updated rest rate for ${ actor.name }: ${ rate_type } rest = ${ rate } points` );
	}

	/**
	 * GM clears the downtime purchase logs.
	 **/
	private static async _on_clear_logs( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		/** lowercase purpose of the api call **/
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.LOGS, [] );
		this.render( );
	}

	/**
	 * player clicks craft on a recipe.
	 **/
	private static async _on_craft( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );

		if ( !( game as any ).user.isGM )
		{
			const has_active_gm: boolean = ( game as any ).users.some( ( u: any ) => u.isGM && u.active );
			if ( !has_active_gm )
			{
				/** lowercase purpose of the api call **/
				( ui as any ).notifications.warn( ( game as any ).i18n.localize( 'yugen-downtime.notifications.no-gm-online' ) );
				return;
			}
		}

		const recipe_id = target.dataset.recipeId || '';
		const actor_id = target.dataset.actorId || '';

		console.log( `yugen-downtime | _on_craft click | recipe_id: ${ recipe_id } | actor_id: ${ actor_id }` );

		if ( !recipe_id || !actor_id )
		{
			console.error( 'yugen-downtime | craft error: missing recipe_id or actor_id dataset attributes on button' );
			return;
		}

		await SocketHandler.emit_craft( actor_id, recipe_id );
	}

	/**
	 * GM adds a new blank recipe.
	 **/
	private static async _on_add_recipe( this: DowntimeApp, event: any, _target: HTMLButtonElement )
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
	 * GM deletes a recipe.
	 **/
	private static async _on_delete_recipe( this: DowntimeApp, event: any, target: HTMLButtonElement )
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
	 * GM edits a recipe field (name, description, dt_cost, ingredient quantity, output quantity).
	 **/
	private static async _on_edit_recipe_field( this: DowntimeApp, _event: any, target: HTMLInputElement | HTMLTextAreaElement )
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
	 * GM removes a specific ingredient from a recipe.
	 **/
	private static async _on_remove_ingredient( this: DowntimeApp, event: any, target: HTMLButtonElement )
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
	 * GM clears the craft logs.
	 **/
	private static async _on_clear_craft_logs( this: DowntimeApp, event: any, _target: HTMLButtonElement )
	{
		event.preventDefault( );
		/** lowercase purpose of the api call **/
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.CRAFT_LOGS, [ ] );
		this.render( );
	}

	/**
	 * GM opens the logs window.
	 **/
	private static async _on_open_logs( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const app = DowntimeLogsApp.instance;
		app.render( { force: true } );
	}

	/**
	 * GM changes the configuration sub-tab (Actions or Recipes).
	 **/
	private static async _on_sub_tab( this: DowntimeApp, event: any, target: HTMLElement )
	{
		const tab = target.dataset.tab || 'actions-config';
		this._sub_tab = tab;
		this.render( );
	}

	/**
	 * GM opens the downtime action editor popup.
	 **/
	private static async _on_edit_action( this: DowntimeApp, event: any, target: HTMLElement )
	{
		event.preventDefault( );
		const action_id = target.dataset.actionId || '';
		if ( !action_id )
		{
			return;
		}

		new ActionEditor( action_id, { }, ( ) => { this.render( ); } ).render( { force: true } );
	}

	/**
	 * GM opens the craft recipe editor popup.
	 **/
	private static async _on_edit_recipe( this: DowntimeApp, event: any, target: HTMLElement )
	{
		event.preventDefault( );
		const recipe_id = target.dataset.recipeId || '';
		if ( !recipe_id )
		{
			return;
		}

		new RecipeEditor( recipe_id, { }, ( ) => { this.render( ); } ).render( { force: true } );
	}

	/**
	 * GM opens the character configuration editor popup.
	 **/
	private static async _on_edit_actor( this: DowntimeApp, event: any, target: HTMLElement )
	{
		event.preventDefault( );
		const actor_id = target.dataset.actorId || '';
		if ( !actor_id )
		{
			return;
		}

		new DowntimeActorEditor( actor_id ).render( { force: true } );
	}

	/**
	 * GM toggles filtering characters by active tokens on the current scene.
	 **/
	private static async _on_toggle_map_filter( this: DowntimeApp, event: any, target: HTMLElement )
	{
		event.preventDefault( );
		this._only_show_on_map = !this._only_show_on_map;
		this.render( );
	}

	/**
	 * GM assigns a perk tree to a player actor.
	 **/
	private static async _on_assign_tree( this: DowntimeApp, event: any, target: HTMLSelectElement )
	{
		const actor_id = target.dataset.actorId || '';
		const tree_id = target.value;
		if ( !actor_id || !tree_id )
		{
			return;
		}

		/** lowercase purpose of the api call **/
		const actor = ( game as any ).actors.get( actor_id );
		if ( !actor )
		{
			return;
		}

		const progress = get_flag( actor, FLAGS.PERK_TREES ) || { };
		if ( progress[ tree_id ] === undefined )
		{
			progress[ tree_id ] = 
			{
				unlocked_nodes: [ ]
			};
			await set_flag( actor, FLAGS.PERK_TREES, progress );
			log( `assigned perk tree ${ tree_id } to actor ${ actor.name }` );
		}
		this.render( );
	}

	/**
	 * GM unassigns a perk tree from a player actor.
	 **/
	private static async _on_unassign_tree( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		const actor_id = target.dataset.actorId || '';
		const tree_id = target.dataset.treeId || '';
		if ( !actor_id || !tree_id )
		{
			return;
		}

		/** lowercase purpose of the api call **/
		const actor = ( game as any ).actors.get( actor_id );
		if ( !actor )
		{
			return;
		}

		const progress = get_flag( actor, FLAGS.PERK_TREES ) || { };
		if ( progress[ tree_id ] !== undefined )
		{
			delete progress[ tree_id ];
			await set_flag( actor, FLAGS.PERK_TREES, progress );
			log( `removed perk tree ${ tree_id } from actor ${ actor.name }` );
		}
		this.render( );
	}

	/**
	 * GM adds a new perk tree config.
	 **/
	private static async _on_add_tree( this: DowntimeApp, event: any, _target: HTMLButtonElement )
	{
		event.preventDefault( );
		const trees = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [ ];
		const new_tree = 
		{
			id: ( foundry.utils as any ).randomID( ),
			name: 'New Perk Tree',
			nodes: [ ]
		};
		trees.push( new_tree );
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.PERK_TREES, trees );
		this.render( );
	}

	/**
	 * GM opens the perk tree config editor.
	 **/
	private static _on_edit_tree( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const tree_id = target.dataset.treeId || '';
		new PerkTreeEditor( tree_id, { }, ( ) => 
		{
			this.render( );
		} ).render( { force: true } );
	}

	/**
	 * GM deletes a perk tree config.
	 **/
	private static async _on_delete_tree( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const tree_id = target.dataset.treeId || '';
		let trees = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [ ];
		trees = trees.filter( ( t: any ) => 
		{
			return t.id !== tree_id;
		} );
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.PERK_TREES, trees );
		this.render( );
	}

	/**
	 * player switches the active perk tree tab view.
	 **/
	private static _on_select_player_tree( this: DowntimeApp, event: any, target: HTMLElement )
	{
		event.preventDefault( );
		this._active_tree_id = target.dataset.treeId || '';
		this.render( );
	}

	/**
	 * player unlocks a perk node.
	 **/
	private static async _on_unlock_node( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );

		if ( !( game as any ).user.isGM )
		{
			const has_active_gm: boolean = ( game as any ).users.some( ( u: any ) => u.isGM && u.active );
			if ( !has_active_gm )
			{
				/** lowercase purpose of the api call **/
				( ui as any ).notifications.warn( ( game as any ).i18n.localize( 'yugen-downtime.notifications.no-gm-online' ) );
				return;
			}
		}

		const actor_id = target.dataset.actorId || '';
		const tree_id = target.dataset.treeId || '';
		const node_id = target.dataset.nodeId || '';
		if ( !actor_id || !tree_id || !node_id )
		{
			return;
		}

		await SocketHandler.emit_unlock_perk( actor_id, tree_id, node_id );
	}

	/**
	 * gm refunds an unlocked perk node to an actor, returning their points.
	 **/
	private static async _on_refund_node( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );

		/** check gm user permissions **/
		if ( !( game as any ).user.isGM )
		{
			return;
		}

		const actor_id = target.dataset.actorId || '';
		const tree_id = target.dataset.treeId || '';
		const node_id = target.dataset.nodeId || '';
		if ( !actor_id || !tree_id || !node_id )
		{
			return;
		}

		/** retrieve actor from world collection **/
		const actor = ( game as any ).actors.get( actor_id );
		if ( !actor )
		{
			return;
		}

		/** verify user has owner permission on the actor **/
		if ( !actor.testUserPermission( ( game as any ).user, 'OWNER' ) )
		{
			return;
		}

		/** retrieve global perk trees setting **/
		const global_trees = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [ ];
		const tree = global_trees.find( ( t: any ) => 
		{
			return t.id === tree_id;
		} );
		const node = tree?.nodes.find( ( n: any ) => 
		{
			return n.id === node_id;
		} );

		if ( !node )
		{
			return;
		}

		/** get actor perk trees progress flag **/
		const progress = get_flag( actor, FLAGS.PERK_TREES ) || { };
		const tree_prog = progress[ tree_id ];
		if ( !tree_prog || !tree_prog.unlocked_nodes.includes( node_id ) )
		{
			return;
		}

		/** remove node from unlocked list **/
		tree_prog.unlocked_nodes = tree_prog.unlocked_nodes.filter( ( id: string ) => 
		{
			return id !== node_id;
		} );
		/** set actor perk trees progress flag **/
		await set_flag( actor, FLAGS.PERK_TREES, progress );

		/** get actor point flags **/
		const current_points = get_flag( actor, FLAGS.POINTS ) ?? 0;
		const refunded_points = current_points + node.cost;
		/** set actor points flag **/
		await set_flag( actor, FLAGS.POINTS, refunded_points );

		log( `gm refunded perk ${ node.name } for actor ${ actor.name }, returning ${ node.cost } points` );

		/** remove associated active effect **/
		if ( node.effect )
		{
			const effect_name = node.effect.name;
			/** search active effects on the actor **/
			const effect = actor.effects.find( ( e: any ) => 
			{
				const is_node_match = e.getFlag( MODULE_ID, 'node_id' ) === node_id;
				const is_legacy_match = ( e.origin === 'yugen-downtime' || e.getFlag( 'core', 'source' ) === 'yugen-downtime' ) && 
				                        ( e.name === effect_name || e.label === effect_name );
				return is_node_match || is_legacy_match;
			} );
			if ( effect )
			{
				/** delete active effect from the actor **/
				await effect.delete( );
			}
		}

		/** send chat notification **/
		const chat_content = `<div class="downtime-chat-card perk-chat-card">
	<p>GM <strong>yugen.</strong> refunded <strong>${ ( globalThis as any ).yugen_utils.escape_html( actor.name ) }</strong> for perk node <strong>${ ( globalThis as any ).yugen_utils.escape_html( node.name ) }</strong>, returning <strong>${ node.cost }</strong> points.</p>
</div>`;

		/** create chat message document **/
		await ( ChatMessage as any ).create( 
		{
			user: ( game as any ).user.id,
			content: chat_content
		} );

		this.render( );
	}

	/**
	 * gm revokes an unlocked perk node from an actor, locking it without returning points.
	 **/
	private static async _on_revoke_node( this: DowntimeApp, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );

		/** check gm user permissions **/
		if ( !( game as any ).user.isGM )
		{
			return;
		}

		const actor_id = target.dataset.actorId || '';
		const tree_id = target.dataset.treeId || '';
		const node_id = target.dataset.nodeId || '';
		if ( !actor_id || !tree_id || !node_id )
		{
			return;
		}

		/** retrieve actor from world collection **/
		const actor = ( game as any ).actors.get( actor_id );
		if ( !actor )
		{
			return;
		}

		/** verify user has owner permission on the actor **/
		if ( !actor.testUserPermission( ( game as any ).user, 'OWNER' ) )
		{
			return;
		}

		/** retrieve global perk trees setting **/
		const global_trees = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [ ];
		const tree = global_trees.find( ( t: any ) => 
		{
			return t.id === tree_id;
		} );
		const node = tree?.nodes.find( ( n: any ) => 
		{
			return n.id === node_id;
		} );

		if ( !node )
		{
			return;
		}

		/** get actor perk trees progress flag **/
		const progress = get_flag( actor, FLAGS.PERK_TREES ) || { };
		const tree_prog = progress[ tree_id ];
		if ( !tree_prog || !tree_prog.unlocked_nodes.includes( node_id ) )
		{
			return;
		}

		/** remove node from unlocked list **/
		tree_prog.unlocked_nodes = tree_prog.unlocked_nodes.filter( ( id: string ) => 
		{
			return id !== node_id;
		} );
		/** set actor perk trees progress flag **/
		await set_flag( actor, FLAGS.PERK_TREES, progress );

		log( `gm revoked perk ${ node.name } from actor ${ actor.name }` );

		/** remove associated active effect **/
		if ( node.effect )
		{
			const effect_name = node.effect.name;
			/** search active effects on the actor **/
			const effect = actor.effects.find( ( e: any ) => 
			{
				const is_node_match = e.getFlag( MODULE_ID, 'node_id' ) === node_id;
				const is_legacy_match = ( e.origin === 'yugen-downtime' || e.getFlag( 'core', 'source' ) === 'yugen-downtime' ) && 
				                        ( e.name === effect_name || e.label === effect_name );
				return is_node_match || is_legacy_match;
			} );
			if ( effect )
			{
				/** delete active effect from the actor **/
				await effect.delete( );
			}
		}

		/** send chat notification **/
		const chat_content = `<div class="downtime-chat-card perk-chat-card">
	<p>GM <strong>yugen.</strong> revoked perk node <strong>${ ( globalThis as any ).yugen_utils.escape_html( node.name ) }</strong> from <strong>${ ( globalThis as any ).yugen_utils.escape_html( actor.name ) }</strong>.</p>
</div>`;

		/** create chat message document **/
		await ( ChatMessage as any ).create( 
		{
			user: ( game as any ).user.id,
			content: chat_content
		} );

		this.render( );
	}
}
