/**
 * @file src/module/interactive-app.ts
 * handles the interactive wheel menu for selecting downtime tabs.
 **/

import { MODULE_ID, SETTINGS } from './constants.js';
import { DowntimeApp } from './downtime-app.js';

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

export class InteractiveDowntimeApp extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any )
{
	private static _instance: InteractiveDowntimeApp | null = null;
	private _target_actor: any = null;

	/**
	 * active target actor being managed in this ui instance.
	 **/
	public get target_actor( ): any
	{
		return this._target_actor;
	}

	public set target_actor( actor: any )
	{
		this._target_actor = actor;
	}

	/**
	 * singleton accessor to prevent multiple app instances.
	 **/
	public static get instance( ): InteractiveDowntimeApp
	{
		if ( !this._instance )
		{
			this._instance = new InteractiveDowntimeApp( );
		}

		return this._instance;
	}

	static DEFAULT_OPTIONS = 
	{
		id: 'yugen-downtime-interactive-app',
		tag: 'div',
		classes: 
		[
			'yugen-interactive-downtime',
			'app'
		],
		window: 
		{
			frame: false,
			resizable: false
		},
		position: 
		{
			width: '100%',
			height: '100%',
			left: 0,
			top: 0
		}
	};

	static PARTS = 
	{
		content: 
		{
			template: 'modules/yugen-downtime/templates/interactive-app.hbs'
		}
	};

	static ACTIONS = 
	{
		'open-tab': InteractiveDowntimeApp._on_open_tab
	};

	/**
	 * opens the appropriate downtime ui based on user settings and characters.
	 **/
	public static open( actor?: any ): void
	{
		/** lowercase purpose of the api call **/
		const is_gm: boolean = ( game as any ).user.isGM;

		if ( !is_gm )
		{
			/** check if an active gm is online **/
			const has_active_gm: boolean = ( game as any ).users.some( ( u: any ) => u.isGM && u.active );
			if ( !has_active_gm )
			{
				/** lowercase purpose of the api call **/
				( ui as any ).notifications.warn( ( game as any ).i18n.localize( 'yugen-downtime.notifications.no-gm-online' ) );
				return;
			}
		}

		/** lowercase purpose of the api call **/
		const is_interactive: boolean = ( game as any ).settings.get( MODULE_ID, SETTINGS.INTERACTIVE_MODE ) ?? true;

		/** resolve target actor with controlled token fallback **/
		const target_actor: any = actor || ( canvas as any ).tokens?.controlled[ 0 ]?.actor;

		if ( !target_actor )
		{
			if ( is_gm )
			{
				const app = DowntimeApp.instance;
				app.target_actor = null;
				app.tabGroups.downtime = 'manage';
				app.render( { force: true } );
			}
			else
			{
				/** lowercase purpose of the api call **/
				( ui as any ).notifications.warn( ( game as any ).i18n.localize( 'yugen-downtime.notifications.no-token-selected' ) );
			}

			return;
		}

		if ( is_interactive )
		{
			const app = InteractiveDowntimeApp.instance;
			app.target_actor = target_actor;
			app.render( { force: true } );
		}
		else
		{
			const app = DowntimeApp.instance;
			app.target_actor = target_actor;
			app.render( { force: true } );
		}
	}

	/**
	 * prepares context data for rendering templates.
	 **/
	async _prepareContext( _options: unknown )
	{
		const player_actor = this.target_actor;

		/** lowercase purpose of the api call **/
		const controlled_token: any = ( canvas as any ).tokens?.controlled[ 0 ];

		let avatar_img: string = 'icons/svg/mystery-man.svg';
		if ( player_actor )
		{
			avatar_img = ( controlled_token?.actor?.id === player_actor.id ? controlled_token?.document?.texture?.src : null )
				|| player_actor.prototypeToken?.texture?.src 
				|| player_actor.img 
				|| 'icons/svg/mystery-man.svg';
		}

		/** lowercase purpose of the api call **/
		const craft_enabled: boolean = ( game as any ).settings.get( MODULE_ID, SETTINGS.CRAFT_ENABLED ) ?? false;

		return {
			avatar_img,
			craft_enabled
		};
	}

	/**
	 * event listeners bound on first render.
	 **/
	protected _onFirstRender( _context: unknown, _options: unknown ): void
	{
		/** single delegated click listener for actions **/
		this.element.addEventListener( 'click', ( event: MouseEvent ) => 
		{
			const target = ( event.target as HTMLElement ).closest( '[data-action]' ) as HTMLElement;
			if ( target )
			{
				this._onAction( event, target );
			}
			else
			{
				/** clicking outside the interactive elements closes the app **/
				if ( event.target === this.element || ( event.target as HTMLElement ).classList.contains( 'interactive-overlay-backdrop' ) )
				{
					this.close( );
				}
			}
		} );
	}

	/**
	 * routes action string to the appropriate static method handler.
	 **/
	private _onAction( event: MouseEvent, target: HTMLElement )
	{
		const action_name = target.dataset.action || '';
		const handler = ( this.constructor as any ).ACTIONS[ action_name ];
		if ( handler )
		{
			handler.call( this, event, target );
		}
	}

	/**
	 * opens a specific tab in the main downtime app and closes the interactive app.
	 **/
	private static async _on_open_tab( this: InteractiveDowntimeApp, event: MouseEvent, target: HTMLElement )
	{
		event.preventDefault( );
		const tab = target.dataset.tab || '';

		const app = DowntimeApp.instance;
		app.tabGroups.downtime = tab;

		await this.close( );
		app.render( { force: true } );
	}
}
