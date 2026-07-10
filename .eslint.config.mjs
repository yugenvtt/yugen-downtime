import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		plugins: {
			prettier: prettierPlugin,
		},
		rules: {
			/** formatting overrides to maintain consistency with local coding standards **/
			'prettier/prettier': 'off',
			'indent': [ 'error', 'tab' ],
			'quotes': [ 'error', 'single', { 'avoidEscape': true } ],
			'semi': [ 'error', 'always' ],
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': [ 'warn' ],
			'@typescript-eslint/no-explicit-any': 'warn',
			
			/** spaces inside parentheses **/
			'space-in-parens': [ 'error', 'always' ],
			
			/** opening brackets on new line (allman style) **/
			'brace-style': [ 'error', 'allman', { 'allowSingleLine': false } ],
			
			/** mandatory brackets for all control structures **/
			'curly': [ 'error', 'all' ],
			
			/** naming conventions for internal logic **/
			'@typescript-eslint/naming-convention': [
				'error',
				{
					'selector': 'variable',
					'format': [ 'snake_case', 'UPPER_CASE', 'PascalCase' ],
				},
				{
					'selector': 'function',
					'format': [ 'snake_case' ],
				},
				{
					'selector': 'typeLike',
					'format': [ 'PascalCase' ],
				},
				{
					'selector': 'parameter',
					'format': [ 'snake_case' ],
					'leadingUnderscore': 'allow',
				}
			],
			'@typescript-eslint/no-unsafe-function-type': 'off',
		},
	},
	prettierConfig,
);
