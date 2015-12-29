'use strict';

var spawn = require( 'child_process' ).spawn;

var pty;
try {
	pty = require( 'pty.js' );
}
catch ( err ) {
}


function doSpawn( exe, args, options ) {
//	if ( pty ) {
//		options.env = process.env;
//		return pty.spawn( exe, args, options );
//	} else {
		return spawn( exe, args, options );
//	}
}


module.exports = doSpawn;

