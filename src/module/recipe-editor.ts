/**
 * @file src/module/recipe-editor.ts
 * popup editor for crafting recipes (v14 applicationv2).
 **/

import { MODULE_ID, SETTINGS } from './constants.js';
import type { CraftRecipe, CraftIngredient } from './craft-handler.js';
import { debug } from './utils.js';
import { ActiveEffectEditor } from './active-effect-editor.js';

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

export class RecipeEditor extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any )
{
	private recipe_id: string;
	private on_save: Function;

	constructor( recipe_id: string, options: any = { }, on_save: Function )
	{
		super( options );
		this.recipe_id = recipe_id;
		this.on_save = on_save;
	}

	static DEFAULT_OPTIONS =
	{
		id: 'yugen-downtime-recipe-editor',
		tag: 'form',
		classes:
		[
			'yugen-downtime',
			'recipe-editor',
			'yugen-app',
			'app'
		],
		window:
		{
			title: 'Craft Recipe Editor',
			resizable: true,
			controls: [ ]
		},
		position:
		{
			width: 600,
			height: 580
		}
	};

	static PARTS =
	{
		content:
		{
			template: 'modules/yugen-downtime/templates/recipe-editor.hbs'
		}
	};

	static ACTIONS =
	{
		save: RecipeEditor._on_save,
		'remove-ingredient': RecipeEditor._on_remove_ingredient,
		'remove-output': RecipeEditor._on_remove_output,
		'edit-ingredient-qty': RecipeEditor._on_edit_ingredient_qty,
		'create-effect': RecipeEditor._on_create_effect,
		'edit-effect': RecipeEditor._on_edit_effect,
		'remove-effect': RecipeEditor._on_remove_effect
	};

	async _prepareContext( _options: any )
	{
		const recipes = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
		const recipe = recipes.find( ( r: any ) =>
		{
			return r.id === this.recipe_id;
		} ) ||
		{
			id: this.recipe_id,
			name: '',
			description: '',
			dt_cost: 1,
			ingredients: [ ],
			output:
			{
				uuid: '',
				name: 'Unknown Output',
				img: 'icons/svg/item-bag.svg',
				quantity: 1
			},
			macro_id: '',
			macro_name: '',
			effect: null
		};

		const macros = ( game as any ).macros.contents.map( ( m: any ) => 
		{
			return {
				id: m.id,
				name: m.name
			};
		} );

		return {
			recipe,
			has_effect: !!recipe.effect,
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

		/** drag-and-drop support **/
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

	private _sync_form_to_settings( recipes: CraftRecipe[], recipe: CraftRecipe ): void
	{
		const el = this.element;
		if ( !el ) 
		{
			return;
		}

		const name_input = el.querySelector( 'input[name="name"]' ) as HTMLInputElement;
		if ( name_input )
		{
			recipe.name = name_input.value || 'New Recipe';
		}

		const cost_input = el.querySelector( 'input[name="dt_cost"]' ) as HTMLInputElement;
		if ( cost_input )
		{
			recipe.dt_cost = Math.max( 0, parseInt( cost_input.value ) || 0 );
		}

		const desc_textarea = el.querySelector( 'textarea[name="description"]' ) as HTMLTextAreaElement;
		if ( desc_textarea )
		{
			recipe.description = desc_textarea.value || '';
		}

		const qty_input = el.querySelector( 'input[name="output_quantity"]' ) as HTMLInputElement;
		if ( qty_input && recipe.output )
		{
			recipe.output.quantity = Math.max( 1, parseInt( qty_input.value ) || 1 );
		}

		const macro_select = el.querySelector( 'select[name="macro_id"]' ) as HTMLSelectElement;
		if ( macro_select )
		{
			recipe.macro_id = macro_select.value || '';
			const macro = recipe.macro_id ? ( game as any ).macros.get( recipe.macro_id ) : null;
			recipe.macro_name = macro ? macro.name : '';
		}

	}

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

		const ingredient_data: any =
		{
			uuid: drop_data.uuid,
			name: item.name,
			img: item.img || 'icons/svg/item-bag.svg',
			quantity: 1
		};

		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
		const recipe = recipes.find( ( r ) => r.id === this.recipe_id );

		if ( !recipe )
		{
			return;
		}

		this._sync_form_to_settings( recipes, recipe );

		if ( slot_type === 'output' )
		{
			ingredient_data.item_data = typeof item.toObject === 'function' ? item.toObject( ) : ( foundry.utils as any ).duplicate( item );
			recipe.output = ingredient_data;
		}
		else if ( slot_type === 'ingredient' )
		{
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

	private static async _on_remove_ingredient( this: RecipeEditor, event: any, target: HTMLButtonElement )
	{
		event.preventDefault( );
		const ingredient_uuid = target.dataset.ingredientUuid || '';

		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
		const recipe = recipes.find( ( r ) => r.id === this.recipe_id );

		if ( !recipe )
		{
			return;
		}

		this._sync_form_to_settings( recipes, recipe );
		recipe.ingredients = recipe.ingredients.filter( ( i ) => i.uuid !== ingredient_uuid );
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, recipes );
		this.render( );
	}

	private static async _on_remove_output( this: RecipeEditor, event: any, _target: HTMLButtonElement )
	{
		event.preventDefault( );

		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
		const recipe = recipes.find( ( r ) => r.id === this.recipe_id );

		if ( !recipe )
		{
			return;
		}

		this._sync_form_to_settings( recipes, recipe );
		recipe.output =
		{
			uuid: '',
			name: 'Unknown Output',
			img: 'icons/svg/item-bag.svg',
			quantity: 1
		};

		await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, recipes );
		this.render( );
	}

	private static async _on_edit_ingredient_qty( this: RecipeEditor, event: any, target: HTMLInputElement )
	{
		const ingredient_uuid = target.dataset.ingredientUuid || '';
		const qty = Math.max( 1, parseInt( target.value ) || 1 );

		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
		const recipe = recipes.find( ( r ) => r.id === this.recipe_id );

		if ( !recipe )
		{
			return;
		}

		this._sync_form_to_settings( recipes, recipe );
		const ingredient = recipe.ingredients.find( ( i ) => i.uuid === ingredient_uuid );
		if ( ingredient )
		{
			ingredient.quantity = qty;
		}

		await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, recipes );
	}

	private static _on_create_effect( this: RecipeEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
		const recipe = recipes.find( ( r ) => r.id === this.recipe_id );
		if ( !recipe )
		{
			return;
		}

		this._sync_form_to_settings( recipes, recipe );

		const default_effect = 
		{
			name: recipe.name + ' Effect',
			img: recipe.output?.img || 'icons/svg/aura.svg',
			description: '',
			changes: [ ]
		};

		new ActiveEffectEditor( default_effect, { }, async ( updated_effect: any ) => 
		{
			const updated_recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
			const r = updated_recipes.find( ( x ) => x.id === this.recipe_id );
			if ( r ) 
			{
				r.effect = updated_effect;
				await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, updated_recipes );
				this.render( );
			}
		} ).render( { force: true } );
	}

	private static _on_edit_effect( this: RecipeEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
		const recipe = recipes.find( ( r ) => r.id === this.recipe_id );
		if ( !recipe || !recipe.effect )
		{
			return;
		}

		this._sync_form_to_settings( recipes, recipe );

		new ActiveEffectEditor( recipe.effect, { }, async ( updated_effect: any ) => 
		{
			const updated_recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
			const r = updated_recipes.find( ( x ) => x.id === this.recipe_id );
			if ( r ) 
			{
				r.effect = updated_effect;
				await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, updated_recipes );
				this.render( );
			}
		} ).render( { force: true } );
	}

	private static async _on_remove_effect( this: RecipeEditor, event: any, _target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
		const recipe = recipes.find( ( r ) => r.id === this.recipe_id );
		if ( recipe )
		{
			this._sync_form_to_settings( recipes, recipe );
			recipe.effect = null;
			await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, recipes );
			this.render( );
		}
	}

	private static async _on_save( this: RecipeEditor, event: any )
	{
		const recipes: CraftRecipe[] = ( game as any ).settings.get( MODULE_ID, SETTINGS.RECIPES ) || [ ];
		const recipe = recipes.find( ( r ) => r.id === this.recipe_id );

		if ( recipe )
		{
			this._sync_form_to_settings( recipes, recipe );
			await ( game as any ).settings.set( MODULE_ID, SETTINGS.RECIPES, recipes );
		}

		this.on_save( );
		this.close( );
	}
}
