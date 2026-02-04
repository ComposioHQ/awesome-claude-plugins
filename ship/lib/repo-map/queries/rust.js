/**
 * Rust query patterns for ast-grep
 */

'use strict';

module.exports = {
  exports: [
    { pattern: 'pub fn $NAME($$$) { $$$ }', kind: 'function', nameVar: 'NAME' },
    { pattern: 'pub(crate) fn $NAME($$$) { $$$ }', kind: 'function', nameVar: 'NAME' },
    { pattern: 'pub(super) fn $NAME($$$) { $$$ }', kind: 'function', nameVar: 'NAME' },
    { pattern: 'pub(in $PATH) fn $NAME($$$) { $$$ }', kind: 'function', nameVar: 'NAME' },
    { pattern: 'pub struct $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(crate) struct $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(super) struct $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(in $PATH) struct $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub enum $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(crate) enum $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(super) enum $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(in $PATH) enum $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub trait $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(crate) trait $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(super) trait $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(in $PATH) trait $NAME { $$$ }', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub type $NAME = $$$', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(crate) type $NAME = $$$', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(super) type $NAME = $$$', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub(in $PATH) type $NAME = $$$', kind: 'type', nameVar: 'NAME' },
    { pattern: 'pub const $NAME: $TYPE = $$$', kind: 'constant', nameVar: 'NAME' },
    { pattern: 'pub(crate) const $NAME: $TYPE = $$$', kind: 'constant', nameVar: 'NAME' },
    { pattern: 'pub(super) const $NAME: $TYPE = $$$', kind: 'constant', nameVar: 'NAME' },
    { pattern: 'pub(in $PATH) const $NAME: $TYPE = $$$', kind: 'constant', nameVar: 'NAME' },
    { pattern: 'pub static $NAME: $TYPE = $$$', kind: 'constant', nameVar: 'NAME' },
    { pattern: 'pub(crate) static $NAME: $TYPE = $$$', kind: 'constant', nameVar: 'NAME' },
    { pattern: 'pub(super) static $NAME: $TYPE = $$$', kind: 'constant', nameVar: 'NAME' },
    { pattern: 'pub(in $PATH) static $NAME: $TYPE = $$$', kind: 'constant', nameVar: 'NAME' },
    { pattern: 'pub mod $NAME { $$$ }', kind: 'module', nameVar: 'NAME' },
    { pattern: 'pub(crate) mod $NAME { $$$ }', kind: 'module', nameVar: 'NAME' },
    { pattern: 'pub(super) mod $NAME { $$$ }', kind: 'module', nameVar: 'NAME' },
    { pattern: 'pub(in $PATH) mod $NAME { $$$ }', kind: 'module', nameVar: 'NAME' },
    { pattern: 'pub mod $NAME;', kind: 'module', nameVar: 'NAME' }
  ],
  functions: [
    { pattern: 'fn $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'async fn $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'pub fn $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'pub(crate) fn $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'pub(super) fn $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'pub(in $PATH) fn $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'pub async fn $NAME($$$) { $$$ }', nameVar: 'NAME' },
    { pattern: 'pub(crate) async fn $NAME($$$) { $$$ }', nameVar: 'NAME' }
  ],
  classes: [],
  types: [
    { pattern: 'struct $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'enum $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'trait $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'type $NAME = $$$', nameVar: 'NAME' },
    { pattern: 'pub struct $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'pub enum $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'pub trait $NAME { $$$ }', nameVar: 'NAME' },
    { pattern: 'pub type $NAME = $$$', nameVar: 'NAME' }
  ],
  constants: [
    { pattern: 'const $NAME: $TYPE = $$$', nameVar: 'NAME' },
    { pattern: 'static $NAME: $TYPE = $$$', nameVar: 'NAME' }
  ],
  imports: [
    { pattern: 'use $SOURCE;', sourceVar: 'SOURCE', kind: 'use' },
    { pattern: 'use $SOURCE::{ $$$ };', sourceVar: 'SOURCE', kind: 'use' },
    { pattern: 'use $SOURCE::*;', sourceVar: 'SOURCE', kind: 'use' }
  ]
};
