/**
 * @file src/module/downtime-logs-app.ts
 * handles the gm logs interface for both downtime investments and crafting history.
 **/

import { MODULE_ID, SETTINGS } from './constants.js';
import { log, debug } from './utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = ( foundry.applications.api as any );

export class DowntimeLogsApp extends ( HandlebarsApplicationMixin( ApplicationV2 ) as any ) 
{
	private static _instance: DowntimeLogsApp | null = null;

	constructor( options: any = { } ) 
	{
		super( options );
	}

	/**
	 * singleton accessor to prevent multiple app instances.
	 **/
	public static get instance( ): DowntimeLogsApp 
	{
		if ( !this._instance ) 
		{
			this._instance = new DowntimeLogsApp( );
		}
		return this._instance;
	}

	static DEFAULT_OPTIONS = 
	{
		id: 'yugen-downtime-logs-app',
		tag: 'form',
		classes: [ 
			'yugen-app',
			'yugen-downtime', 
			'yugen-logs-window',
			'app' 
		],
		window: 
		{
			title: 'yugen-downtime | logs',
			resizable: true
		},
		position: 
		{
			width: 600,
			height: 520
		}
	};

	static PARTS = 
	{
		content: 
		{
			template: 'modules/yugen-downtime/templates/downtime-logs-app.hbs'
		}
	};

	static TABS = 
	{
		logs: 
		{
			tabs: [
				{
					id: 'downtime-logs',
					label: 'Downtime Logs',
					icon: 'fas fa-hourglass-half'
				},
				{
					id: 'craft-logs',
					label: 'Craft Logs',
					icon: 'fas fa-hammer'
				}
			],
			initial: 'downtime-logs',
			label: true
		}
	};

	static ACTIONS = 
	{
		tab: DowntimeLogsApp._on_tab,
		'clear-logs': DowntimeLogsApp._on_clear_logs,
		'clear-craft-logs': DowntimeLogsApp._on_clear_craft_logs
	};

	/**
	 * prepares context data for rendering templates.
	 **/
	async _prepareContext( _options: any ) 
	{
		const raw_logs = ( game as any ).settings.get( MODULE_ID, SETTINGS.LOGS ) || [ ];
		const formatted_logs = raw_logs.map( ( log_entry: any ) => 
		{
			const d = new Date( log_entry.timestamp );
			return {
				...log_entry,
				formatted_time: `${ d.toLocaleDateString( ) } ${ d.toLocaleTimeString( ) }`
			};
		} );

		const raw_craft_logs = ( game as any ).settings.get( MODULE_ID, SETTINGS.CRAFT_LOGS ) || [ ];
		const craft_logs = raw_craft_logs.map( ( entry: any ) => 
		{
			const d = new Date( entry.timestamp );
			return {
				...entry,
				formatted_time: `${ d.toLocaleDateString( ) } ${ d.toLocaleTimeString( ) }`
			};
		} );

		return {
			logs: formatted_logs,
			craft_logs,
			tabs: this._get_tabs_context( 'logs' )
		};
	}

	/**
	 * event listeners bound on first render.
	 **/
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
	private _get_tabs_context( group: string ) 
	{
		const config = ( this.constructor as any ).TABS[ group ];
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
	private static async _on_tab( this: DowntimeLogsApp, event: any, target: HTMLElement ) 
	{
		const group = target.dataset.group || '';
		const tab = target.dataset.tab || '';
		this.tabGroups[ group ] = tab;
		this.render( );
	}

	/**
	 * GM clears the downtime purchase logs.
	 **/
	private static async _on_clear_logs( this: DowntimeLogsApp, event: any, target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.LOGS, [ ] );
		this.render( );
	}

	/**
	 * GM clears the craft logs.
	 **/
	private static async _on_clear_craft_logs( this: DowntimeLogsApp, event: any, target: HTMLButtonElement ) 
	{
		event.preventDefault( );
		await ( game as any ).settings.set( MODULE_ID, SETTINGS.CRAFT_LOGS, [ ] );
		this.render( );
	}
}
