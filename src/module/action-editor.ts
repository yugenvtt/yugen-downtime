/**
 * @file src/module/action-editor.ts
 * popup editor for downtime actions (v14 applicationv2).
 **/

import { MODULE_ID, SETTINGS } from './constants.js';
import { get_roll_choices, debug } from './utils.js';
import { ActiveEffectEditor } from './active-effect-editor.js';

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

export class ActionEditor extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any )
{
	private action_id: string;
	private action_data: any;
	private on_save: Function;

	constructor( action_id: string, options: any = { }, on_save: Function )
	{
		super( options );
		this.action_id = action_id;
		this.on_save = on_save;

		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [ ];
		const existing = actions.find( ( a: any ) => 
		{
			return a.id === this.action_id;
		} );

		this.action_data = existing ? ( foundry.utils as any ).duplicate( existing ) : 
		{
			id: this.action_id,
			name: '',
			description: '',
			cost: 1,
			macro_id: '',
			macro_name: '',
			roll_check: '',
			dc: 0,
			effect: null,
			items: [ ]
		};

		if ( !this.action_data.items )
		{
			this.action_data.items = [ ];
		}
	}

	static DEFAULT_OPTIONS =
	{
		id: 'yugen-downtime-action-editor',
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
			title: 'Downtime Action Editor',
			resizable: true,
			controls: [ ]
		},
		position:
		{
			width: 540,
			height: 680
		}
	};

	static PARTS =
	{
		content:
		{
			template: 'modules/yugen-downtime/templates/action-editor.hbs'
		}
	};

	static ACTIONS =
	{
		save: ActionEditor._on_save,
		'create-effect': ActionEditor._on_create_effect,
		'edit-effect': ActionEditor._on_edit_effect,
		'remove-effect': ActionEditor._on_remove_effect,
		'remove-item': ActionEditor._on_remove_item,
		'edit-item-qty': ActionEditor._on_edit_item_qty
	};

	async _prepareContext( _options: any )
	{
		const roll_choices = get_roll_choices( );

		const macros = ( game as any ).macros.contents.map( ( m: any ) =>
		{
			return {
				id: m.id,
				name: m.name
			};
		} );

		return {
			action: this.action_data,
			roll_choices,
			macros
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

	private _sync_form_to_data( ): void 
	{
		const el = this.element;
		this.action_data.name = ( el.querySelector( 'input[name="name"]' ) as HTMLInputElement )?.value || 'New Action';
		this.action_data.cost = Math.max( 0, parseInt( ( el.querySelector( 'input[name="cost"]' ) as HTMLInputElement )?.value ) || 0 );
		this.action_data.macro_id = ( el.querySelector( 'select[name="macro_id"]' ) as HTMLSelectElement )?.value || '';
		this.action_data.roll_check = ( el.querySelector( 'select[name="roll_check"]' ) as HTMLSelectElement )?.value || '';
		this.action_data.dc = Math.max( 0, parseInt( ( el.querySelector( 'input[name="dc"]' ) as HTMLInputElement )?.value ) || 0 );
		this.action_data.description = ( el.querySelector( 'textarea[name="description"]' ) as HTMLTextAreaElement )?.value || '';

		const macro = this.action_data.macro_id ? ( game as any ).macros.get( this.action_data.macro_id ) : null;
		this.action_data.macro_name = macro ? macro.name : '';
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

		const existing_idx = this.action_data.items.findIndex( ( i: any ) => i.uuid === item_entry.uuid );
		if ( existing_idx >= 0 )
		{
			this.action_data.items[ existing_idx ].quantity += 1;
		}
		else
		{
			this.action_data.items.push( item_entry );
		}

		this.render( );
	}

	private static _on_remove_item( this: ActionEditor, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const item_uuid = target.dataset.itemUuid || '';
		this._sync_form_to_data( );
		this.action_data.items = this.action_data.items.filter( ( i: any ) => i.uuid !== item_uuid );
		this.render( );
	}

	private static _on_edit_item_qty( this: ActionEditor, _event: any, target: HTMLInputElement )
	{
		const item_uuid = target.dataset.itemUuid || '';
		const qty = Math.max( 1, parseInt( target.value ) || 1 );
		this._sync_form_to_data( );
		const item = this.action_data.items.find( ( i: any ) => i.uuid === item_uuid );
		if ( item )
		{
			item.quantity = qty;
		}
	}

	private static _on_create_effect( this: ActionEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		const default_effect = 
		{
			name: this.action_data.name + ' Effect',
			img: 'icons/svg/aura.svg',
			description: '',
			changes: [ ]
		};

		new ActiveEffectEditor( default_effect, { }, async ( updated_effect: any ) => 
		{
			this.action_data.effect = updated_effect;
			this.render( );
		} ).render( { force: true } );
	}

	private static _on_edit_effect( this: ActionEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		new ActiveEffectEditor( this.action_data.effect, { }, async ( updated_effect: any ) => 
		{
			this.action_data.effect = updated_effect;
			this.render( );
		} ).render( { force: true } );
	}

	private static async _on_remove_effect( this: ActionEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );
		this.action_data.effect = null;
		this.render( );
	}

	private static async _on_save( this: ActionEditor, event: any )
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		const actions = ( game as any ).settings.get( MODULE_ID, SETTINGS.ACTIONS ) || [ ];
		const index = actions.findIndex( ( a: any ) => 
		{
			return a.id === this.action_id;
		} );

		if ( index === -1 )
		{
			actions.push( this.action_data );
		}
		else
		{
			actions[ index ] = this.action_data;
		}

		await ( game as any ).settings.set( MODULE_ID, SETTINGS.ACTIONS, actions );
		this.on_save( );
		this.close( );
	}
}

