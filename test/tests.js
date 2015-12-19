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

	describe( transport.name + ' tests', function() {
		this.timeout( 30 * 60 * 1000 ); // 30 minutes

		helpers.promiseIt('createRepo', async function( tempDir ) {
			let result = await helpers.createRepo( tempDir, transport );
			assert.equal( transport.isRepoFolder( result.dir ), true, 'Repository directory created correctly' );
		} );
		
		helpers.promiseIt('checkout', async function( tempDir ) {
			let result = await helpers.createRepo( tempDir, transport );
			let checkoutDir = path.join( tempDir, uuid.v4() );
			await transport.checkout( result.url, null, checkoutDir );
			assert.equal( transport.isWorkingCopy( checkoutDir ), true, 'Repository checkout out correctly' );
		} );
		
		helpers.promiseIt('isWorkingCopyClean', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('update', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('exists', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('cat', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('unCat', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('getWorkingCopyInfo', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('getUrlHeadRevision', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('getWorkingCopyRevision', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('listTags', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('exportDir', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('createBranch', async function( tempDir ) {
		
		} );
		
		helpers.promiseIt('createTag', async function( tempDir ) {
		
		} );
	} );
}

defineTests( gs.svn );
if ( os.platform() !== 'win32' ) {
	defineTests( gs.git );
}


