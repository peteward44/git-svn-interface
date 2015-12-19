/*jslint node: true */
'use strict';

var os = require( 'os' );
var path = require('path');
var assert = require( 'assert' );
var fs = require( 'fs-extra' );
var uuid = require( 'node-uuid' );
var helpers = require( '../testutil/helpers.js' );
var gs = require('..' );


function defineTests( transport ) {

	describe( transport.name + ' checkout', function() {
		this.timeout( 30 * 60 * 1000 ); // 30 minutes

		helpers.promiseIt('CreateRepo', async function( tempDir ) {
			let result = await helpers.createRepo( tempDir, transport );
			assert.equal( transport.isRepoFolder( result.dir ), true, 'Repository directory created correctly' );
		} );
		
		helpers.promiseIt('Checkout', async function( tempDir ) {
			let result = await helpers.createRepo( tempDir, transport );
			let checkoutDir = path.join( tempDir, uuid.v4() );
			await transport.checkout( result.url, null, checkoutDir );
			assert.equal( transport.isWorkingCopy( checkoutDir ), true, 'Repository checkout out correctly' );
		} );
	} );
}

defineTests( gs.svn );
if ( os.platform() !== 'win32' ) {
	defineTests( gs.git );
}


