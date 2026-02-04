/**
 * TypeScript query patterns for ast-grep
 */

'use strict';

const javascript = require('./javascript');

module.exports = {
  exports: [
    ...javascript.exports,
    { pattern: 'export interface $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'export type $NAME = $$$', kind: 'type', nameVar: 'NAME' },
    { pattern: 'export enum $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'export namespace $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'export const enum $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'export = $NAME', kind: 'value', nameVar: 'NAME' },
    { pattern: 'export as namespace $NAME', kind: 'namespace', nameVar: 'NAME' }
  ],
  functions: javascript.functions,
  classes: [
    ...javascript.classes,
    { pattern: 'abstract class $NAME { $$$ }', nameVar: 'NAME' }
  ],
  types: [
    { pattern: 'interface $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'type $NAME = $$$', nameVar: 'NAME' },
    { pattern: 'enum $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'namespace $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'const enum $NAME { $$$ }', nameVar: 'NAME' }
  ],
  constants: javascript.constants,
  imports: [
    ...javascript.imports,
    { pattern: 'import type { $$$ } from $SOURCE', sourceVar: 'SOURCE', kind: 'type' },
    { pattern: 'import type $NAME from $SOURCE', sourceVar: 'SOURCE', kind: 'type' }
  ]
};
