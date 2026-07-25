/**
 * @file src/module/utils.ts
 * utility functions for downtime logic and data handling.
 **/

import { MODULE_ID } from './constants.js';

/**
 * retrieves a namespaced flag from a document.
 **/
export const get_flag = ( doc: any, key: string ): any => 
{
	/** retrieve flag from document via shared library **/
	return ( globalThis as any ).yugen_utils.get_flag( doc, MODULE_ID, key );
};

/**
 * sets a namespaced flag on a document.
 **/
export const set_flag = async ( doc: any, key: string, value: any, options: any = { } ): Promise<any> => 
{
	/** set flag on document via shared library **/
	return await ( globalThis as any ).yugen_utils.set_flag( doc, MODULE_ID, key, value, options );
};

/**
 * logs a standardized lowercase message with the module prefix.
 **/
export const log = ( message: string, ...args: any[] ): void => 
{
	/** log message via shared library **/
	( globalThis as any ).yugen_utils.log( MODULE_ID, message, ...args );
};

/**
 * logs a debug message if debug-mode setting is enabled for the module.
 **/
export const debug = ( message: string, ...args: any[] ): void => 
{
	/** debug log message via shared library **/
	( globalThis as any ).yugen_utils.debug( MODULE_ID, message, ...args );
};

/**
 * aggregates abilities, skills, and tools into structured choice groups.
 **/
export const get_roll_choices = ( ): any =>
{
	const abilities =
	[
		{ id: 'str', name: 'Strength' },
		{ id: 'dex', name: 'Dexterity' },
		{ id: 'con', name: 'Constitution' },
		{ id: 'int', name: 'Intelligence' },
		{ id: 'wis', name: 'Wisdom' },
		{ id: 'cha', name: 'Charisma' }
	];

	const skills =
	[
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

	const default_tools: Record<string, string> =
	{
		thief: "Thieves' Tools",
		alchemist: "Alchemist's Supplies",
		herbalism: 'Herbalism Kit',
		disg: 'Disguise Kit',
		forg: 'Forgery Kit',
		navg: "Navigator's Tools",
		tinker: "Tinker's Tools",
		brewer: "Brewer's Supplies",
		cartg: "Cartographer's Tools",
		cobbler: "Cobbler's Tools",
		cook: "Cook's Utensils",
		glass: "Glassblower's Tools",
		jewel: "Jeweler's Tools",
		leather: "Leatherworker's Tools",
		mason: "Mason's Tools",
		painter: "Painter's Supplies",
		potter: "Potter's Tools",
		smith: "Smith's Tools",
		wood: "Woodcarver's Tools",
		dice: 'Dice Set',
		card: 'Playing Card Set',
		chess: 'Dragonchess Set',
		mus: 'Musical Instrument'
	};

	const tools_config = ( CONFIG as any ).DND5E?.tools || ( CONFIG as any ).DND5E?.toolIds || default_tools;
	const tools: Array<{ id: string; name: string }> = [ ];

	if ( typeof tools_config === 'object' && tools_config !== null )
	{
		for ( const [ key, val ] of Object.entries( tools_config ) )
		{
			let label = typeof val === 'string' ? val : ( ( val as any )?.label || key );
			if ( ( game as any ).i18n && typeof ( game as any ).i18n.localize === 'function' )
			{
				const localized = ( game as any ).i18n.localize( label );
				if ( localized && localized !== label )
				{
					label = localized;
				}
			}
			/** fallback to default_tools or title-casing if label is raw key or lowercase **/
			if ( label === key || label.toLowerCase( ) === key.toLowerCase( ) )
			{
				label = default_tools[ key ] || key.split( /[-_]/ ).map( ( w ) => w.charAt( 0 ).toUpperCase( ) + w.slice( 1 ).toLowerCase( ) ).join( ' ' );
			}
			tools.push( { id: key, name: label } );
		}
	}
	else
	{
		for ( const [ key, label ] of Object.entries( default_tools ) )
		{
			tools.push( { id: key, name: label } );
		}
	}

	return {
		abilities,
		skills,
		tools
	};
};

/**
 * resolves a human-readable title-cased label for any ability, skill, or tool check key.
 **/
export const get_roll_check_label = ( key?: string ): string =>
{
	if ( !key )
	{
		return '';
	}

	const choices = get_roll_choices( );
	for ( const group of [ choices.abilities, choices.skills, choices.tools ] )
	{
		const match = group.find( ( item: any ) => item.id === key );
		if ( match )
		{
			return match.name;
		}
	}

	return key.split( /[-_]/ ).map( ( word ) => word.charAt( 0 ).toUpperCase( ) + word.slice( 1 ).toLowerCase( ) ).join( ' ' );
};

/**
 * executes an ability, skill, or tool roll on an actor.
 **/
export const execute_roll_check = async ( actor: any, roll_check: string ): Promise<{ roll: any; total: number; label: string } | null> =>
{
	if ( !actor || !roll_check )
	{
		return null;
	}

	const abilities = [ 'str', 'dex', 'con', 'int', 'wis', 'cha' ];
	const skills = [ 'ath', 'acr', 'slh', 'ste', 'arc', 'his', 'inv', 'nat', 'rel', 'ani', 'ins', 'med', 'prc', 'sur', 'dec', 'itm', 'prf', 'per' ];

	let roll: any = null;
	let label = roll_check;

	try
	{
		if ( abilities.includes( roll_check ) )
		{
			label = ( CONFIG as any ).DND5E?.abilities?.[ roll_check ]?.label || roll_check.toUpperCase( );
			/** lowercase purpose of the api call **/
			roll = await actor.rollAbilityCheck( { ability: roll_check } );
		}
		else if ( skills.includes( roll_check ) || ( CONFIG as any ).DND5E?.skills?.[ roll_check ] )
		{
			label = ( CONFIG as any ).DND5E?.skills?.[ roll_check ]?.label || roll_check;
			/** lowercase purpose of the api call **/
			roll = await actor.rollSkill( { skill: roll_check } );
		}
		else
		{
			/** tool roll check **/
			const tool_label = ( CONFIG as any ).DND5E?.tools?.[ roll_check ]?.label ||
				( typeof ( CONFIG as any ).DND5E?.tools?.[ roll_check ] === 'string' ? ( CONFIG as any ).DND5E?.tools?.[ roll_check ] : roll_check );
			label = tool_label;

			if ( typeof actor.rollToolCheck === 'function' )
			{
				/** lowercase purpose of the api call **/
				roll = await actor.rollToolCheck( { tool: roll_check } );
			}
			else if ( typeof actor.rollTool === 'function' )
			{
				/** lowercase purpose of the api call **/
				roll = await actor.rollTool( { tool: roll_check } );
			}
			else
			{
				/** fallback to searching actor tool item **/
				const tool_item = actor.items.find( ( i: any ) => i.type === 'tool' && ( i.system?.type?.baseItem === roll_check || i.name.toLowerCase( ).includes( roll_check.toLowerCase( ) ) ) );
				if ( tool_item && typeof tool_item.roll === 'function' )
				{
					roll = await tool_item.roll( );
				}
				else
				{
					/** default ability check dex fallback if tool is not found on actor **/
					/** lowercase purpose of the api call **/
					roll = await actor.rollAbilityCheck( { ability: 'dex' } );
				}
			}
		}
	}
	catch ( err )
	{
		console.error( `${ MODULE_ID } | roll execution error:`, err );
		return null;
	}

	if ( !roll )
	{
		return null;
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
		return null;
	}

	const is_evaluated = actual_roll.evaluated || actual_roll._evaluated || typeof actual_roll.total === 'number';
	if ( !is_evaluated && typeof actual_roll.evaluateSync === 'function' )
	{
		try
		{
			actual_roll.evaluateSync( );
		}
		catch ( e )
		{
			debug( 'roll evaluateSync failed' );
		}
	}

	const total = typeof actual_roll.total === 'number' ? actual_roll.total : 0;
	return {
		roll: actual_roll,
		total,
		label
	};
};

/**
 * grants a list of dropped items/features to an actor's inventory.
 **/
export const grant_items = async ( actor: any, items: any[] ): Promise<void> =>
{
	if ( !actor || !Array.isArray( items ) || items.length === 0 )
	{
		return;
	}

	for ( const output of items )
	{
		let item_data: any = null;

		if ( output.item_data )
		{
			item_data = ( foundry.utils as any ).duplicate( output.item_data );
		}
		else if ( output.uuid )
		{
			try
			{
				/** lowercase purpose of the api call **/
				const source_item = await ( fromUuid as any )( output.uuid );
				if ( source_item )
				{
					item_data = source_item.toObject( );
				}
			}
			catch ( e )
			{
				debug( `could not resolve item uuid ${ output.uuid }` );
			}
		}

		if ( item_data )
		{
			item_data.system = item_data.system || { };

			if ( typeof item_data.system.quantity !== 'undefined' )
			{
				item_data.system.quantity = output.quantity || 1;
			}

			if ( item_data.flags )
			{
				for ( const key of Object.keys( item_data.flags ) )
				{
					if ( key.toLowerCase( ).includes( 'plutonium' ) )
					{
						delete item_data.flags[ key ];
					}
				}

				if ( item_data.flags.core?.sourceId?.toLowerCase( ).includes( 'plutonium' ) )
				{
					delete item_data.flags.core.sourceId;
				}
			}

			/** lowercase purpose of the api call **/
			await actor.createEmbeddedDocuments( 'Item', [ item_data ] );
		}
		else
		{
			const fallback_data =
			{
				name: output.name || 'Granted Item',
				type: 'loot',
				img: output.img || 'icons/svg/item-bag.svg',
				system:
				{
					quantity: output.quantity || 1
				}
			};
			/** lowercase purpose of the api call **/
			await actor.createEmbeddedDocuments( 'Item', [ fallback_data ] );
		}

		log( `granted item ${ output.name } x${ output.quantity || 1 } to ${ actor.name }` );
	}
};

