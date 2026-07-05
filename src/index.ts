/**
 * @file src/index.ts
 * entry point for the yugen-downtime module.
 **/

import { init_hook } from './hooks/init.js';
import { get_scene_control_buttons_hook } from './hooks/get-scene-control-buttons.js';
import { get_actor_sheet_header_buttons_hook } from './hooks/get-actor-sheet-header-buttons.js';
import { craft_init_hook } from './hooks/craft-init.js';

/** initialize the module hooks **/
init_hook( );
get_scene_control_buttons_hook( );
get_actor_sheet_header_buttons_hook( );
craft_init_hook( );
