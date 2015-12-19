'use strict';

var fs = require('fs-extra');
var path = require('path');
var uuid = require( 'node-uuid' );
var getTempDir = require( '../lib/getTempDir.js' );

// replacement for mocha's it() method to return a promise instead of accept a callback
export function promiseIt( name, func ) {
	it( name, function( done ) {
		var tempDir = getTempDir();
		try {
			var prom = func( tempDir );
			prom.catch( done );
			prom.then( function() {
				// only delete temp folder on successful test
				try {
					fs.removeSync( tempDir );
				}
				catch ( err ) {
					console.error( "Could not delete temp folder for test '" + name + "'" );
				}
				done();
			} );
		}
		catch ( err ) {
			done( err );
		}
	} );
}


export async function createRepo( tempDir, transport, options ) {
	options = options || {};
	let dirname = uuid.v4();
	let { url: url, dir: dir } = await transport.createRepo( path.resolve( path.join( tempDir, dirname ) ), { targetDesc: options.targetDesc } );
	return {
		url: url,
		targetDesc: options.targetDesc,
		dir: dir
	};
}



export async function createRepoCheckout( tempDir, transport, options ) {
	if ( typeof tempDir !== 'string' ) {
		throw new Error( "createRepoCheckout invalid argument" );
	}
	options = options || {};
	options.name = options.name || 'main';
	
	var checkoutDir = path.resolve( path.join( tempDir, uuid.v4() ) );
	let result = await createRepo( tempDir, transport, options );
	result.checkoutDir = checkoutDir;

	// execute checkout command
	console.log( "Checking out " + result.url );
	await transport.checkout( result.url, options.targetDesc, checkoutDir );
	return result;
}
