/**
 * @file src/module/active-effect-editor.ts
 * popup editor for configuring a custom active effect and its changes (v14 applicationv2).
 **/

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

export class ActiveEffectEditor extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any )
{
	private effect_data: any;
	private on_save: Function;

	constructor( effect_data: any, options: any = { }, on_save: Function )
	{
		super( options );
		this.effect_data = effect_data ? ( foundry.utils as any ).duplicate( effect_data ) : 
		{
			name: 'New Active Effect',
			img: 'icons/svg/aura.svg',
			description: '',
			changes: [ ]
		};
		this.on_save = on_save;

		if ( !this.effect_data.changes ) 
		{
			this.effect_data.changes = [ ];
		}
	}

	static DEFAULT_OPTIONS =
	{
		id: 'yugen-downtime-active-effect-editor',
		tag: 'form',
		classes:
		[
			'yugen-downtime',
			'active-effect-editor',
			'yugen-app',
			'app'
		],
		window:
		{
			title: 'Configure Active Effect',
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
			template: 'modules/yugen-downtime/templates/active-effect-editor.hbs'
		}
	};

	static ACTIONS =
	{
		save: ActiveEffectEditor._on_save,
		'pick-effect-icon': ActiveEffectEditor._on_pick_effect_icon,
		'add-effect-change': ActiveEffectEditor._on_add_effect_change,
		'remove-effect-change': ActiveEffectEditor._on_remove_effect_change
	};

	async _prepareContext( _options: any )
	{
		return {
			effect: this.effect_data
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
		this.effect_data.name = ( el.querySelector( 'input[name="effect_name"]' ) as HTMLInputElement )?.value || 'Effect';
		this.effect_data.img = ( el.querySelector( 'input[name="effect_img"]' ) as HTMLInputElement )?.value || 'icons/svg/aura.svg';
		this.effect_data.description = ( el.querySelector( 'textarea[name="effect_description"]' ) as HTMLTextAreaElement )?.value || '';

		/** sync changes list **/
		if ( this.effect_data.changes ) 
		{
			for ( let i = 0; i < this.effect_data.changes.length; i++ ) 
			{
				const key_input = el.querySelector( `input[name="change_key_${ i }"]` ) as HTMLInputElement;
				const mode_select = el.querySelector( `select[name="change_mode_${ i }"]` ) as HTMLSelectElement;
				const val_input = el.querySelector( `input[name="change_value_${ i }"]` ) as HTMLInputElement;

				if ( key_input && mode_select && val_input ) 
				{
					this.effect_data.changes[ i ].key = key_input.value;
					this.effect_data.changes[ i ].mode = parseInt( mode_select.value ) || 0;
					this.effect_data.changes[ i ].value = val_input.value;
				}
			}
		}
	}

	private static _on_pick_effect_icon( this: ActiveEffectEditor, event: any, _target: HTMLElement ) 
	{
		const input = this.element.querySelector( 'input[name="effect_img"]' ) as HTMLInputElement;
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

	private static _on_add_effect_change( this: ActiveEffectEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		this.effect_data.changes.push( 
		{
			key: '',
			mode: 2, // default ADD
			value: ''
		} );

		this.render( );
	}

	private static _on_remove_effect_change( this: ActiveEffectEditor, event: any, target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		const index = parseInt( target.dataset.index || '0' );
		this._sync_form_to_data( );

		if ( this.effect_data.changes ) 
		{
			this.effect_data.changes.splice( index, 1 );
		}

		this.render( );
	}

	private static async _on_save( this: ActiveEffectEditor, event: any ) 
	{
		event.preventDefault( );
		this._sync_form_to_data( );

		await this.on_save( this.effect_data );
		this.close( );
	}
}
