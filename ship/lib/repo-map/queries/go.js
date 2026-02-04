/**
 * Go query patterns for ast-grep
 */

'use strict';

module.exports = {
  exports: [],
  functions: [
    { pattern: 'func $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'func ($$$) $NAME($$$) { $$$ }', nameVar: 'NAME' }
  ],
  classes: [],
  types: [
    { pattern: 'type $NAME struct { $$$ }', nameVar: 'NAME' },
    { pattern: 'type $NAME interface { $$$ }', nameVar: 'NAME' },
    { pattern: 'type $NAME = $$$', nameVar: 'NAME' }
  ],
  constants: [
    { pattern: 'const $NAME = $$$', nameVar: 'NAME' },
    { pattern: 'const $NAME $TYPE = $$$', nameVar: 'NAME' }
  ],
  imports: [
    { pattern: 'import $SOURCE', sourceVar: 'SOURCE', kind: 'import' },
    { pattern: 'import $NAME $SOURCE', sourceVar: 'SOURCE', kind: 'import' }
  ]
};
