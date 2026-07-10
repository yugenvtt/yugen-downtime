/**
 * @file src/module/actor-editor.ts
 * popup editor for character downtime configuration.
 **/

import { MODULE_ID, FLAGS, SETTINGS } from './constants.js';
import { get_flag, set_flag, log } from './utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

export class DowntimeActorEditor extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any )
{
	private actor_id: string;

	constructor( actor_id: string, options: any = { } )
	{
		super( options );
		this.actor_id = actor_id;
	}

	static DEFAULT_OPTIONS =
	{
		id: 'yugen-downtime-actor-editor',
		tag: 'form',
		classes:
		[
			'yugen-downtime',
			'action-editor',
			'yugen-app',
			'app'
		],
		window:
		{
			title: 'Configure Character',
			resizable: true,
			controls: [ ]
		},
		position:
		{
			width: 520,
			height: 480
		}
	};

	static PARTS =
	{
		content:
		{
			template: 'modules/yugen-downtime/templates/actor-editor.hbs'
		}
	};

	static ACTIONS =
	{
		save: DowntimeActorEditor._on_save,
		'assign-tree': DowntimeActorEditor._on_assign_tree,
		'unassign-tree': DowntimeActorEditor._on_unassign_tree
	};

	async _prepareContext( _options: any )
	{
		const actor = ( game as any ).actors.get( this.actor_id );
		if ( !actor )
		{
			return { };
		}

		const global_short = ( game as any ).settings.get( MODULE_ID, SETTINGS.REST_SHORT_POINTS ) ?? 0;
		const global_long = ( game as any ).settings.get( MODULE_ID, SETTINGS.REST_LONG_POINTS ) ?? 0;
		const global_trees = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [ ];

		const act_progress = get_flag( actor, FLAGS.PERK_TREES ) || { };
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
			actor:
			{
				id: actor.id,
				name: actor.name,
				img: actor.img || 'icons/svg/mystery-man.svg',
				points: get_flag( actor, FLAGS.POINTS ) ?? 0,
				rest_short: get_flag( actor, FLAGS.REST_SHORT_POINTS ) ?? global_short,
				rest_long: get_flag( actor, FLAGS.REST_LONG_POINTS ) ?? global_long,
				assigned_trees: assigned_tree_list,
				unassigned_trees: unassigned_tree_list
			}
		};
	}

	protected _onFirstRender( _context: any, _options: any ): void
	{
		this.element.addEventListener( 'click', ( event: any ) =>
		{
			const target = event.target.closest( '[data-action]' );
			if ( target )
			{
				this._onAction( event, target );
			}
		} );

		this.element.addEventListener( 'change', ( event: any ) =>
		{
			const target = event.target.closest( '[data-action]' );
			if ( target && target.tagName === 'SELECT' )
			{
				this._onAction( event, target );
			}
		} );

		this.element.addEventListener( 'submit', ( event: Event ) =>
		{
			event.preventDefault( );
		} );
	}

	protected _onAction( event: any, target: HTMLElement ): void
	{
		const action = target.dataset.action;
		if ( !action )
		{
			return;
		}

		const handler = ( this.constructor as any ).ACTIONS[ action ];
		if ( handler )
		{
			handler.call( this, event, target );
		}
	}

	private static async _on_assign_tree( this: DowntimeActorEditor, event: any, target: HTMLSelectElement )
	{
		const tree_id = target.value;
		if ( !tree_id )
		{
			return;
		}

		const actor = ( game as any ).actors.get( this.actor_id );
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

	private static async _on_unassign_tree( this: DowntimeActorEditor, event: any, target: HTMLButtonElement )
	{
		const tree_id = target.dataset.treeId || '';
		if ( !tree_id )
		{
			return;
		}

		const actor = ( game as any ).actors.get( this.actor_id );
		if ( !actor )
		{
			return;
		}

		const progress = get_flag( actor, FLAGS.PERK_TREES ) || { };
		if ( progress[ tree_id ] !== undefined )
		{
			delete progress[ tree_id ];
			await set_flag( actor, FLAGS.PERK_TREES, progress );
			log( `unassigned perk tree ${ tree_id } from actor ${ actor.name }` );
		}
		this.render( );
	}

	private static async _on_save( this: DowntimeActorEditor, event: any )
	{
		event.preventDefault( );
		const el = this.element;
		const actor = ( game as any ).actors.get( this.actor_id );
		if ( !actor )
		{
			this.close( );
			return;
		}

		const points = Math.max( 0, parseInt( ( el.querySelector( 'input[name="points"]' ) as HTMLInputElement )?.value ) || 0 );
		const rest_short = Math.max( 0, parseInt( ( el.querySelector( 'input[name="rest_short"]' ) as HTMLInputElement )?.value ) || 0 );
		const rest_long = Math.max( 0, parseInt( ( el.querySelector( 'input[name="rest_long"]' ) as HTMLInputElement )?.value ) || 0 );

		await set_flag( actor, FLAGS.POINTS, points );
		await set_flag( actor, FLAGS.REST_SHORT_POINTS, rest_short );
		await set_flag( actor, FLAGS.REST_LONG_POINTS, rest_long );

		log( `saved downtime config for actor ${ actor.name }` );
		this.close( );
	}
}
