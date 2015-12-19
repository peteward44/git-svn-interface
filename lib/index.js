'use strict';

if ( !global._babelPolyfill ) { // prevents "only one instance of babel-polyfill is allowed" error: see https://phabricator.babeljs.io/T2931
	require( 'babel-polyfill' );
}
let svn = require( './svn.js' );
let git = require( './git.js' );

module.exports = {
	svn: svn,
	git: git
};
