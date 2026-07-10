/**
 * @file src/module/action-editor.ts
 * popup editor for downtime actions (v14 applicationv2).
 **/

import { MODULE_ID, SETTINGS } from './constants.js';
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
			effect: null
		};
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
			width: 520,
			height: 600
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
		'remove-effect': ActionEditor._on_remove_effect
	};

	async _prepareContext( _options: any )
	{
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
			if ( target )
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
		this.action_data.name = ( el.querySelector( 'input[name="name"]' ) as HTMLInputElement )?.value || 'New Action';
		this.action_data.cost = Math.max( 0, parseInt( ( el.querySelector( 'input[name="cost"]' ) as HTMLInputElement )?.value ) || 0 );
		this.action_data.macro_id = ( el.querySelector( 'select[name="macro_id"]' ) as HTMLSelectElement )?.value || '';
		this.action_data.roll_check = ( el.querySelector( 'select[name="roll_check"]' ) as HTMLSelectElement )?.value || '';
		this.action_data.dc = Math.max( 0, parseInt( ( el.querySelector( 'input[name="dc"]' ) as HTMLInputElement )?.value ) || 0 );
		this.action_data.description = ( el.querySelector( 'textarea[name="description"]' ) as HTMLTextAreaElement )?.value || '';

		const macro = this.action_data.macro_id ? ( game as any ).macros.get( this.action_data.macro_id ) : null;
		this.action_data.macro_name = macro ? macro.name : '';
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
