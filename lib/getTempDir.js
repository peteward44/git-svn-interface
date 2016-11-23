'use strict';

var fs = require( 'fs-extra' );
var os = require( 'os' );
var path = require( 'path' );
var uuid = require( 'uuid' );


function getTempDir() {
	var d = path.join( os.tmpdir(), uuid.v4() );
	fs.ensureDirSync( d );
	return d;
}



module.exports = getTempDir;
