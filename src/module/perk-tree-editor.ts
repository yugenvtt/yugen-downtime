/**
 * @file src/module/perk-tree-editor.ts
 * popup editor for configuring a perk tree and its nodes (v14 applicationv2).
 **/

import { MODULE_ID, SETTINGS } from './constants.js';
import { PerkNodeEditor } from './perk-node-editor.js';

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

export class PerkTreeEditor extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any )
{
	private tree_id: string;
	private tree_data: any;
	private on_save: Function;

	constructor( tree_id: string, options: any = { }, on_save: Function )
	{
		super( options );
		this.tree_id = tree_id;
		this.on_save = on_save;

		const trees = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [ ];
		const existing = trees.find( ( t: any ) => 
		{
			return t.id === this.tree_id;
		} );

		this.tree_data = existing ? ( foundry.utils as any ).duplicate( existing ) : 
		{
			id: this.tree_id,
			name: 'New Perk Tree',
			nodes: [ ]
		};
	}

	static DEFAULT_OPTIONS =
	{
		id: 'yugen-downtime-perk-tree-editor',
		tag: 'form',
		classes:
		[
			'yugen-downtime',
			'perk-tree-editor',
			'yugen-app',
			'app'
		],
		window:
		{
			title: 'Perk Tree Editor',
			resizable: true,
			controls: [ ]
		},
		position:
		{
			width: 650,
			height: 520
		}
	};

	static PARTS =
	{
		content:
		{
			template: 'modules/yugen-downtime/templates/perk-tree-editor.hbs'
		}
	};

	static ACTIONS =
	{
		save: PerkTreeEditor._on_save,
		'add-node': PerkTreeEditor._on_add_node,
		'edit-node': PerkTreeEditor._on_edit_node,
		'delete-node': PerkTreeEditor._on_delete_node
	};

	async _prepareContext( _options: any )
	{
		/** format requirements list for readable badges **/
		const nodes_with_meta = this.tree_data.nodes.map( ( n: any ) => 
		{
			const req_names = n.requirements.map( ( req_id: string ) => 
			{
				const req_node = this.tree_data.nodes.find( ( o: any ) => 
				{
					return o.id === req_id;
				} );
				return req_node ? req_node.name : 'Unknown';
			} );

			return {
				...n,
				req_list: req_names.join( ', ' )
			};
		} );

		return {
			tree: {
				...this.tree_data,
				nodes: nodes_with_meta
			}
		};
	}

	protected _onFirstRender( _context: any, _options: any ): void
	{
		this.element.addEventListener( 'click', ( event: any ) =>
		{
			const target = event.target.closest( '[data-action]' );
			if ( target && ![ 'INPUT', 'SELECT', 'TEXTAREA' ].includes( target.tagName ) )
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

	private _sync_form_to_data( ): void 
	{
		const el = this.element;
		this.tree_data.name = ( el.querySelector( 'input[name="name"]' ) as HTMLInputElement )?.value || 'New Perk Tree';
	}

	private static async _on_add_node( this: PerkTreeEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		const new_node = 
		{
			id: ( foundry.utils as any ).randomID( ),
			name: 'New Perk Node',
			description: 'Perk description',
			cost: 1,
			icon: 'icons/svg/book.svg',
			requirements: [ ],
			macro_id: '',
			macro_name: '',
			effect: null
		};

		this.tree_data.nodes.push( new_node );
		this.render( );
	}

	private static _on_edit_node( this: PerkTreeEditor, event: any, target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		const node_id = target.dataset.nodeId || '';
		const node = this.tree_data.nodes.find( ( n: any ) => 
		{
			return n.id === node_id;
		} );

		if ( !node ) 
		{
			return;
		}

		/** save settings temporarily in memory so dependencies can see it **/
		const trees = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [ ];
		const tree_idx = trees.findIndex( ( t: any ) => 
		{
			return t.id === this.tree_id;
		} );

		const temp_tree = ( foundry.utils as any ).duplicate( this.tree_data );
		if ( tree_idx >= 0 ) 
		{
			trees[ tree_idx ] = temp_tree;
		}
		else 
		{
			trees.push( temp_tree );
		}
		
		/** temporarily set setting so child editors can query nodes **/
		( game as any ).settings.set( MODULE_ID, SETTINGS.PERK_TREES, trees ).then( ( ) => 
		{
			new PerkNodeEditor( this.tree_id, node, { }, ( updated_node: any ) => 
			{
				const idx = this.tree_data.nodes.findIndex( ( n: any ) => 
				{
					return n.id === node_id;
				} );

				if ( idx >= 0 ) 
				{
					this.tree_data.nodes[ idx ] = updated_node;
					this.render( );
				}
			} ).render( { force: true } );
		} );
	}

	private static async _on_delete_node( this: PerkTreeEditor, event: any, target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		const node_id = target.dataset.nodeId || '';

		/** filter out target node **/
		this.tree_data.nodes = this.tree_data.nodes.filter( ( n: any ) => 
		{
			return n.id !== node_id;
		} );

		/** strip node_id from any prerequisites lists **/
		this.tree_data.nodes.forEach( ( n: any ) => 
		{
			n.requirements = n.requirements.filter( ( req: string ) => 
			{
				return req !== node_id;
			} );
		} );

		this.render( );
	}

	private static async _on_save( this: PerkTreeEditor, event: any ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		const trees = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [ ];
		const idx = trees.findIndex( ( t: any ) => 
		{
			return t.id === this.tree_id;
		} );

		if ( idx >= 0 ) 
		{
			trees[ idx ] = this.tree_data;
		}
		else 
		{
			trees.push( this.tree_data );
		}

		await ( game as any ).settings.set( MODULE_ID, SETTINGS.PERK_TREES, trees );
		this.on_save( );
		this.close( );
	}
}
