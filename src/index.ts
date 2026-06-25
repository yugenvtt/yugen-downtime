/**
 * @file src/index.ts
 * entry point for the yugen-downtime module.
 **/

import { init_hook } from './hooks/init.js';
import { get_scene_control_buttons_hook } from './hooks/get-scene-control-buttons.js';

/** initialize the module hooks **/
init_hook( );
get_scene_control_buttons_hook( );
