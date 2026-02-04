/**
 * JavaScript query patterns for ast-grep
 */

'use strict';

module.exports = {
  exports: [
    { pattern: 'export function $NAME($$$) { $$$ }', kind: 'function', nameVar: 'NAME' },
    { pattern: 'export async function $NAME($$$) { $$$ }', kind: 'function', nameVar: 'NAME' },
    { pattern: 'export class $NAME { $$$ }', kind: 'class', nameVar: 'NAME' },
    { pattern: 'export const $NAME = $$$', kind: 'constant', nameVar: 'NAME' },
    { pattern: 'export let $NAME = $$$', kind: 'variable', nameVar: 'NAME' },
    { pattern: 'export var $NAME = $$$', kind: 'variable', nameVar: 'NAME' },
    { pattern: 'export default function $NAME($$$) { $$$ }', kind: 'function', nameVar: 'NAME' },
    { pattern: 'export default class $NAME { $$$ }', kind: 'class', nameVar: 'NAME' },
    { pattern: 'export default function ($$$) { $$$ }', kind: 'function', fallbackName: 'default' },
    { pattern: 'export default class { $$$ }', kind: 'class', fallbackName: 'default' },
    { pattern: 'export default $NAME', kind: 'value', nameVar: 'NAME' },
    { pattern: 'export { $$$ }', kind: 'value', multi: 'exportList' },
    { pattern: 'export { $$$ } from $SOURCE', kind: 're-export', multi: 'exportList', sourceVar: 'SOURCE' },
    { pattern: 'export * from $SOURCE', kind: 're-export', fallbackName: '*', sourceVar: 'SOURCE' },
    { pattern: 'module.exports = $NAME', kind: 'value', nameVar: 'NAME' },
    { pattern: 'module.exports = { $$$ }', kind: 'value', multi: 'objectLiteral' },
    { pattern: 'exports.$NAME = $$$', kind: 'value', nameVar: 'NAME' }
  ],
  functions: [
    { pattern: 'function $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'async function $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'function* $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'async function* $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'const $NAME = ($$$) => $$$', nameVar: 'NAME' },
    { pattern: 'const $NAME = async ($$$) => $$$', nameVar: 'NAME' },
    { pattern: 'const $NAME = function ($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'const $NAME = async function ($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'let $NAME = ($$$) => $$$', nameVar: 'NAME' },
    { pattern: 'var $NAME = ($$$) => $$$', nameVar: 'NAME' }
  ],
  classes: [
    { pattern: 'class $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'const $NAME = class { $$$ }', nameVar: 'NAME' },
    { pattern: 'const $NAME = class $CLASS { $$$ }', nameVar: 'NAME' }
  ],
  types: [],
  constants: [],
  imports: [
    { pattern: 'import $NAME from $SOURCE', sourceVar: 'SOURCE', kind: 'default' },
    { pattern: 'import * as $NAME from $SOURCE', sourceVar: 'SOURCE', kind: 'namespace' },
    { pattern: 'import { $$$ } from $SOURCE', sourceVar: 'SOURCE', kind: 'named' },
    { pattern: 'import $SOURCE', sourceVar: 'SOURCE', kind: 'side-effect' },
    { pattern: 'const $NAME = require($SOURCE)', sourceVar: 'SOURCE', kind: 'require' },
    { pattern: 'const { $$$ } = require($SOURCE)', sourceVar: 'SOURCE', kind: 'require' },
    { pattern: 'require($SOURCE)', sourceVar: 'SOURCE', kind: 'require' }
  ]
};
