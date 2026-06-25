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
