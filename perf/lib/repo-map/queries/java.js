/**
 * Java query patterns for ast-grep
 */

'use strict';

module.exports = {
  exports: [
    { pattern: 'public class $NAME { $$$ }', kind: 'class', nameVar: 'NAME' },
    { pattern: 'public interface $NAME { $$$ }', kind: 'class', nameVar: 'NAME' },
    { pattern: 'public enum $NAME { $$$ }', kind: 'class', nameVar: 'NAME' },
    { pattern: 'public record $NAME($$$) { $$$ }', kind: 'class', nameVar: 'NAME' },
    { pattern: 'public $RET $NAME($$$) { $$$ }', kind: 'function', nameVar: 'NAME' },
    { pattern: 'public static $RET $NAME($$$) { $$$ }', kind: 'function', nameVar: 'NAME' },
    { pattern: 'public $RET $NAME($$$);', kind: 'function', nameVar: 'NAME' }
  ],
  functions: [
    { pattern: 'public $RET $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'public static $RET $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'protected $RET $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'private $RET $NAME($$$) { $$$ }', nameVar: 'NAME' }
  ],
  classes: [
    { pattern: 'class $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'interface $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'enum $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'record $NAME($$$) { $$$ }', nameVar: 'NAME' }
  ],
  types: [],
  constants: [
    { pattern: 'public static final $TYPE $NAME = $$$;', nameVar: 'NAME' },
    { pattern: 'static final $TYPE $NAME = $$$;', nameVar: 'NAME' }
  ],
  imports: [
    { pattern: 'import $SOURCE;', sourceVar: 'SOURCE', kind: 'import' },
    { pattern: 'import static $SOURCE;', sourceVar: 'SOURCE', kind: 'import' }
  ]
};
