/**
 * @file src/module/perk-node-editor.ts
 * popup editor for individual perk nodes (v14 applicationv2).
 **/

import { MODULE_ID, SETTINGS } from './constants.js';
import { ActiveEffectEditor } from './active-effect-editor.js';
import { get_roll_choices, debug } from './utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

export class PerkNodeEditor extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any )
{
	private tree_id: string;
	private node_data: any;
	private on_save: Function;

	constructor( tree_id: string, node_data: any, options: any = { }, on_save: Function )
	{
		super( options );
		this.tree_id = tree_id;
		this.node_data = ( foundry.utils as any ).duplicate( node_data );
		this.on_save = on_save;

		/** ensure default structure exists **/
		if ( !this.node_data.requirements ) 
		{
			this.node_data.requirements = [ ];
		}

		if ( !this.node_data.effect ) 
		{
			this.node_data.effect = null;
		}

		if ( !this.node_data.items )
		{
			this.node_data.items = [ ];
		}

		if ( typeof this.node_data.roll_check === 'undefined' )
		{
			this.node_data.roll_check = '';
		}

		if ( typeof this.node_data.dc === 'undefined' )
		{
			this.node_data.dc = 0;
		}
	}

	static DEFAULT_OPTIONS =
	{
		id: 'yugen-downtime-perk-node-editor',
		tag: 'form',
		classes:
		[
			'yugen-downtime',
			'perk-node-editor',
			'yugen-app',
			'app'
		],
		window:
		{
			title: 'Edit Perk Node',
			resizable: true,
			controls: [ ]
		},
		position:
		{
			width: 540,
			height: 640
		}
	};

	static PARTS =
	{
		content:
		{
			template: 'modules/yugen-downtime/templates/perk-node-editor.hbs'
		}
	};

	static ACTIONS =
	{
		save: PerkNodeEditor._on_save,
		'pick-icon': PerkNodeEditor._on_pick_icon,
		'create-effect': PerkNodeEditor._on_create_effect,
		'edit-effect': PerkNodeEditor._on_edit_effect,
		'remove-effect': PerkNodeEditor._on_remove_effect,
		'remove-item': PerkNodeEditor._on_remove_item,
		'edit-item-qty': PerkNodeEditor._on_edit_item_qty
	};

	async _prepareContext( _options: any )
	{
		/** gather global settings for other nodes in this tree **/
		const trees = ( game as any ).settings.get( MODULE_ID, SETTINGS.PERK_TREES ) || [ ];
		const tree = trees.find( ( t: any ) => 
		{
			return t.id === this.tree_id;
		} );

		const other_nodes = tree ? tree.nodes.filter( ( n: any ) => 
		{
			return n.id !== this.node_data.id;
		} ).map( ( n: any ) => 
		{
			return {
				id: n.id,
				name: n.name,
				selected: this.node_data.requirements.includes( n.id )
			};
		} ) : [ ];

		const macros = ( game as any ).macros.contents.map( ( m: any ) => 
		{
			return {
				id: m.id,
				name: m.name
			};
		} );

		const roll_choices = get_roll_choices( );

		return {
			node: this.node_data,
			has_effect: !!this.node_data.effect,
			macros,
			other_nodes,
			roll_choices
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

		this.element.addEventListener( 'change', ( event: any ) =>
		{
			const target = event.target.closest( '[data-action]' );
			if ( target )
			{
				this._onAction( event, target );
			}
		} );

		this.element.addEventListener( 'submit', ( event: Event ) =>
		{
			event.preventDefault( );
		} );

		/** drag and drop support for awarded items **/
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

	/**
	 * read all input values from the DOM and sync back to local node_data
	 **/
	private _sync_form_to_data( ): void 
	{
		const el = this.element;
		this.node_data.name = ( el.querySelector( 'input[name="name"]' ) as HTMLInputElement )?.value || 'New Perk';
		this.node_data.cost = Math.max( 0, parseInt( ( el.querySelector( 'input[name="cost"]' ) as HTMLInputElement )?.value ) || 0 );
		this.node_data.icon = ( el.querySelector( 'input[name="icon"]' ) as HTMLInputElement )?.value || 'icons/svg/book.svg';
		this.node_data.roll_check = ( el.querySelector( 'select[name="roll_check"]' ) as HTMLSelectElement )?.value || '';
		this.node_data.dc = Math.max( 0, parseInt( ( el.querySelector( 'input[name="dc"]' ) as HTMLInputElement )?.value ) || 0 );
		this.node_data.description = ( el.querySelector( 'textarea[name="description"]' ) as HTMLTextAreaElement )?.value || '';
		this.node_data.macro_id = ( el.querySelector( 'select[name="macro_id"]' ) as HTMLSelectElement )?.value || '';

		const macro = this.node_data.macro_id ? ( game as any ).macros.get( this.node_data.macro_id ) : null;
		this.node_data.macro_name = macro ? macro.name : '';

		/** sync requirements **/
		const req_selects = el.querySelectorAll( 'input[name="requirements"]:checked' );
		this.node_data.requirements = Array.from( req_selects ).map( ( input: any ) => 
		{
			return input.value;
		} );
	}

	private async _on_drop( event: any, _slot: HTMLElement ): Promise<void>
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

		this._sync_form_to_data( );

		const item_entry: any =
		{
			uuid: drop_data.uuid,
			name: item.name,
			img: item.img || 'icons/svg/item-bag.svg',
			quantity: 1,
			item_data: typeof item.toObject === 'function' ? item.toObject( ) : ( foundry.utils as any ).duplicate( item )
		};

		const existing_idx = this.node_data.items.findIndex( ( i: any ) => i.uuid === item_entry.uuid );
		if ( existing_idx >= 0 )
		{
			this.node_data.items[ existing_idx ].quantity += 1;
		}
		else
		{
			this.node_data.items.push( item_entry );
		}

		this.render( );
	}

	private static _on_remove_item( this: PerkNodeEditor, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const item_uuid = target.dataset.itemUuid || '';
		this._sync_form_to_data( );
		this.node_data.items = this.node_data.items.filter( ( i: any ) => i.uuid !== item_uuid );
		this.render( );
	}

	private static _on_edit_item_qty( this: PerkNodeEditor, _event: any, target: HTMLInputElement )
	{
		const item_uuid = target.dataset.itemUuid || '';
		const qty = Math.max( 1, parseInt( target.value ) || 1 );
		this._sync_form_to_data( );
		const item = this.node_data.items.find( ( i: any ) => i.uuid === item_uuid );
		if ( item )
		{
			item.quantity = qty;
		}
	}

	private static _on_pick_icon( this: PerkNodeEditor, event: any, _target: HTMLElement ) 
	{
		const input = this.element.querySelector( 'input[name="icon"]' ) as HTMLInputElement;
		const file_picker_class = ( ( foundry.applications as any )?.apps?.FilePicker?.implementation ) || ( globalThis as any ).FilePicker;
		const picker = new file_picker_class( 
		{
			type: 'image',
			current: input.value,
			callback: ( path: string ) => 
			{
				input.value = path;
				this._sync_form_to_data( );
				this.render( );
			}
		} );
		picker.browse( );
	}

	private static _on_create_effect( this: PerkNodeEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		const default_effect = 
		{
			name: this.node_data.name + ' Effect',
			img: this.node_data.icon || 'icons/svg/aura.svg',
			description: '',
			changes: [ ]
		};

		new ActiveEffectEditor( default_effect, { }, async ( updated_effect: any ) => 
		{
			this.node_data.effect = updated_effect;
			this.render( );
		} ).render( { force: true } );
	}

	private static _on_edit_effect( this: PerkNodeEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		new ActiveEffectEditor( this.node_data.effect, { }, async ( updated_effect: any ) => 
		{
			this.node_data.effect = updated_effect;
			this.render( );
		} ).render( { force: true } );
	}

	private static async _on_remove_effect( this: PerkNodeEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );
		this.node_data.effect = null;
		this.render( );
	}

	private static async _on_save( this: PerkNodeEditor, event: any ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		await this.on_save( this.node_data );
		this.close( );
	}
}

