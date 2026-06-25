/**
 * @file src/module/downtime-app.ts
 * handles the downtime management interface using applicationv2.
 **/

import { MODULE_ID, FLAGS, SETTINGS } from './constants.js';
import { get_flag, set_flag, log, debug } from './utils.js';
import { SocketHandler } from './socket-handler.js';

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

export class DowntimeApp extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any ) 
{
	private static _instance: DowntimeApp | null = null;

	constructor( options: any = { } ) 
	{
		super( options );

		/** listen for actor flag updates to refresh player point views **/
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
		classes: [ 
			'yugen-downtime', 
			'app' 
		],
		window: 
		{
			title: 'yugen-downtime',
			controls: [ ],
			resizable: true
		},
		position: 
		{
			width: 880,
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
			tabs: [
				{
					id: 'actions',
					label: 'Actions',
					icon: 'fas fa-tasks'
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
		'clear-logs': DowntimeApp._on_clear_logs
	};

	/**
	 * prepares context data for rendering templates.
	 **/
	async _prepareContext( _options: any ) 
	{
		const is_gm = ( game as any ).user.isGM;
		const is_active = ( game as any ).settings.get( MODULE_ID, SETTINGS.DOWNTIME_MODE ) ?? false;
		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [ ];

		/** resolve active player actor **/
		const player_actor = ( game as any ).user.character || ( canvas as any ).tokens?.controlled[ 0 ]?.actor;
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
		} ) : [ ];

		/** gather player character actors list for points config **/
		let character_actors: any[] = [ ];
		if ( is_gm ) 
		{
			const actors_map = new Map( );

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

			const global_short = ( game as any ).settings.get( MODULE_ID, SETTINGS.REST_SHORT_POINTS ) ?? 0;
			const global_long = ( game as any ).settings.get( MODULE_ID, SETTINGS.REST_LONG_POINTS ) ?? 0;

			character_actors = Array.from( actors_map.values( ) ).map( ( a: any ) => 
			{
				return {
					id: a.id,
					name: a.name,
					img: a.img || 'icons/svg/mystery-man.svg',
					points: get_flag( a, FLAGS.POINTS ) ?? 0,
					rest_short: get_flag( a, FLAGS.REST_SHORT_POINTS ) ?? global_short,
					rest_long: get_flag( a, FLAGS.REST_LONG_POINTS ) ?? global_long
				};
			} );
		}

		/** gather and format downtime logs **/
		/** lowercase purpose of the api call **/
		const raw_logs = ( game as any ).settings.get( MODULE_ID, SETTINGS.LOGS ) || [ ];
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
		} ) : [ ];

		const roll_choices = [
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
				return t.id !== 'manage';
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
			roll_choices,
			tabs: this._get_tabs_context( 'downtime', tabs_config )
		};
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
		const action_id = target.dataset.actionId || '';
		const actor_id = target.dataset.actorId || '';

		if ( !action_id || !actor_id ) 
		{
			return;
		}

		/** lowercase purpose of the api call **/
		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [ ];
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

			const abilities = [ 
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
			if ( typeof actual_roll.evaluateSync === 'function' && !actual_roll.evaluated ) 
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
		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [ ];
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
		let actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [ ];
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
		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [ ];
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
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.LOGS, [ ] );
		this.render( );
	}
}
