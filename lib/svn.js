'use strict';

var path = require( 'path' );
var fs = require( 'fs-extra' );
var uuid = require( 'node-uuid' );
var svn = require( 'node-svn-ultimate' );
var spawn = require( 'child_process' ).spawn;
var getTempDir = require( './getTempDir.js' );


// converts dir pointing to a bare repo to a url
function formatRepoUrl( dir ) {
	dir = path.resolve( dir );
	dir = dir.replace( /\\/g, '/' );
	if ( dir[0] === '/' ) {
		dir = dir.substr( 1 );
	}
	return 'file:///' + dir;
}


function joinUrl( url, targetDesc, suffix ) {
	// TODO: better joining of slashes, add tag support in here
	var result = url;
	var set = false;
	if ( targetDesc ) {
		if ( targetDesc.type === 'branch' ) {
			result += '/branches/' + targetDesc.name;
			set = true;
		} else if ( targetDesc.type === 'tag' ) {
			result += '/tags/' + targetDesc.name;
			set = true;
		}
	}
	if ( !set ) {
		result += '/trunk';
	}
	return result + ( suffix ? '/' + suffix : '' );
}


export async function isWorkingCopyClean( dir, filename ) {
	return new Promise( function( resolve, reject ) {
		let p;
		if ( filename ) {
			p = path.join( dir, filename );
		} else {
			p = dir;
		}
		svn.util.getWorkingCopyRevision( p, function( err, result ) {
			//console.log( JSON.stringify( result ) );
			err ? reject( err ) : resolve( result.modified ? false : true );
		} );
	} );
}


export function formatBowerDependencyUrl( url, targetDesc ) {
	var suffix;
	if ( targetDesc && ( targetDesc.type === 'branch' || targetDesc.type === 'tag' ) ) {
		suffix = targetDesc.name;
	} else {
		suffix = 'trunk';
	}
	return "svn+" + url + '#' + suffix;
}


export async function update( dirArray ) {
	if ( !Array.isArray( dirArray ) ) {
		dirArray = [ dirArray ];
	}
	for ( let i=0; i<dirArray.length; ++i ) {
		let dir = dirArray[i];
		await new Promise( function( resolve, reject ) {
			svn.commands.update( dir, function( err ) {
				err ? reject( err ) : resolve();
			} );
		} );
	}
}


export function checkout( url, targetDesc, dir ) {
	return new Promise( function( resolve, reject ) {
		let fullUrl = joinUrl( url, targetDesc );
		svn.commands.checkout( fullUrl, dir, function( err ) {
			err ? reject( err ) : resolve();
		} );
	} );
}


function existsOne( url, targetDesc, filepath ) {
	return new Promise( function( resolve, reject ) {
		svn.commands.info( joinUrl( url, targetDesc, filepath ), { 'quiet': true }, function( err ) { resolve( !err ); } );
	} );
}


export async function exists( url, targetDesc, paths ) {
	if ( !Array.isArray( paths ) ) {
		paths = [ paths ];
	}
	for ( var i=0; i<paths.length; ++i ) {
		if ( !await existsOne( url, targetDesc, paths[i] ) ) {
			return false;
		}
	}
	return true;
}


export let name = 'svn';


export function isWorkingCopy( dir ) {
	return fs.existsSync( dir ) && fs.existsSync( path.join( dir, ".svn" ) );
}


export function isRepoFolder( dir ) {
	return fs.existsSync( dir ) && fs.existsSync( path.join( dir, "format" ) );
}


export function guessProjectNameFromUrl( url ) {
	try {
		// use node-svn-ultimate to parse url and get projectname
		var result = svn.util.parseUrl( url );
		return result.projectName;
	}
	catch ( err ) {
		// failed to parse - just return last portion of url
		if ( url[ url.length-1 ] === '/' ) {
			// chop off trailing slash if there is one
			url = url.substr( 0, url.length - 1 );
		}
		var index = url.lastIndexOf( '/' );
		if ( index >= 0 ) {
			return url.substr( index );
		} else {
			return url;
		}
	}
}


export function cat( url, targetDesc, filepath ) {
	return new Promise( function( resolve, reject ) {
		svn.commands.cat( joinUrl( url, targetDesc, filepath ), function( err, text ) {
			err ? reject( err ) : resolve( text );
		} );
	} );
}


export function unCat( url, targetDesc, filepath, optionsArg ) {
	let options;
	if ( typeof optionsArg === 'string' ) {
		options = { contents: optionsArg };
	} else {
		options = optionsArg;
	}
	options = options || {};
	// mucc 'put' does not need file deleted before hand unlike import, so use that instead
	return new Promise( function( resolve, reject ) {
		let mucc = new svn.util.MuccHelper();
		mucc.put( options.contents || '', joinUrl( url, targetDesc, filepath ) );
		mucc.commit( { msg: options.msg || 'commit' }, function( err, result ) {
			return err ? reject( err ) : resolve( result.revision );
		} );
	} );
}


export function createRepo( dir, options ) {
	options = options || {};
	var url = formatRepoUrl( dir );
	return new Promise( function( resolve, reject ) {
			var root = path.dirname( dir );
			var dirname = path.basename( dir );
			fs.ensureDirSync( root );
			var proc = spawn( 'svnadmin', [ 'create', dirname ], { cwd: root } );
			proc.stderr.pipe( process.stderr );
			proc.stdout.pipe( process.stdout );
			proc.on( 'error', function( err ) { reject( err ); } );
			proc.on( 'exit', function() { resolve(); } );
		} )
		.then( function() {
			return new Promise( function( resolve, reject ) {
				var dirs = [ url + '/trunk', url + '/tags', url + '/branches' ];
				if ( options.targetDesc ) {
					if ( options.targetDesc.type === 'tag' ) {
						dirs.push( url + '/tags/' + options.targetDesc.name );
					} else if ( options.targetDesc.type === 'branch' ) {
						dirs.push( url + '/branches/' + options.targetDesc.name );
					}
				}
				//console.log( "creating dir", dirs );
				svn.commands.mkdir(
					dirs,
					{
						params: [ '-m "Creating repo: Creating dirs"' ]
					},
					function( err ) {
						err ? reject( err ) : resolve( { url: url, dir: dir } );
					}
				);
			} );
		} );
}


export function getWorkingCopyInfo( dir ) {
	return new Promise( function( resolve, reject ) {
		svn.commands.info( dir, { quiet: true }, function( err, data ) {
			if ( err ) {
				return reject( err );
			}
			try {
				var parsedUrl = svn.util.parseUrl( data.entry.url );
				var type;
				if ( parsedUrl.type === 'tags' ) {
					type = 'tag';
				} else if ( parsedUrl.type === 'branches' ) {
					type = 'branch';
				} else {
					type = 'trunk';
				}
			//	console.log( "parsedUrl", JSON.stringify( parsedUrl ) );
				var pkg = {
					name: parsedUrl.projectName,
					url: parsedUrl.rootUrl,
					targetDesc: {
						type: type,
						name: parsedUrl.typeName || 'trunk'
					}
				};
				return resolve( pkg );
			}
			catch ( err2 ) {
				return reject( err2 );
			}
		} );
	} );
}


function cherryPickMerge( tagUrl, commitRevision, url, options ) {
	// targetDesc, mergeBowerJson, commentPrefix
	let mergeOptions = options.merge;
	let name = mergeOptions.targetDesc ? mergeOptions.targetDesc.name : 'trunk';
	let tempDir = getTempDir();
	function cleanUp() {
		if ( fs.existsSync( tempDir ) ) {
			fs.removeSync( tempDir );
		}
	}
	return checkout( url, mergeOptions.targetDesc, tempDir )
		.then( function() {
			// perform merge
			// TODO: expose this through node-svn-ultimate module instead
			return new Promise( function( resolve, reject ) {
				var proc = spawn( 'svn', [ 'merge', '-c', commitRevision, tagUrl ], { cwd: tempDir } );
			//	proc.stderr.pipe( process.stderr );
			//	proc.stdout.pipe( process.stdout );
				proc.on( 'error', function( err ) { reject( err ); } );
				proc.on( 'exit', function() { resolve(); } );
			} );
		} )
		.then( function() {
			// revert specified files if they have been excluded from the merge
			if ( mergeOptions.exclude ) {
				if ( !Array.isArray( mergeOptions.exclude ) ) {
					mergeOptions.exclude = [ mergeOptions.exclude ];
				}
				let files = [];
				for ( let i=0; i<mergeOptions.exclude.length; ++i ) {
					let p = path.resolve( tempDir, mergeOptions.exclude[i] );
					if ( fs.existsSync( p ) ) {
						files.push( p );
					}
				}
				if ( files.length > 0 ) {
					return new Promise( function( resolve, reject ) {
						svn.commands.revert( files, function( err ) {
							err ? reject( err ) : resolve();
						} );
					} );
				}
			}
		} )
		.then( function() {
			// then commit
			return new Promise( function( resolve, reject ) {
				svn.commands.commit(
					tempDir,
					{
						quiet: true,
						msg: options.commentPrefix + "Merging changes with original branch '" + name + "'"
					},
					function( err ) {
						err ? reject( err ) : resolve();
					}
				);
			} );
		} )
		.then( function() {
			cleanUp();
//			winston.info( commentPrefix + "Merge to original branch '" + name + "' successful" );
		} )
		.catch( function( err ) {
			cleanUp();
//			winston.error( commentPrefix + "Merge to original branch '" + name + "' failed" );
		} );
}


export function createTag( dir, url, targetDesc, tagName, options ) {
	options = options || {};
	let branchUrl = joinUrl( url, targetDesc );
	let tagUrl = joinUrl( url, { type: 'tag', name: tagName } );
	let tagComment = options.commentPrefix + 'creation';

	if ( !options.commit ) {
		// do not use local working copy
		return new Promise( function( resolve, reject ) {
			let mucc = new svn.util.MuccHelper();
			// create tag folder from same revision of working copy
			mucc.cp( branchUrl, tagUrl, { revision: options.revision } );
			if ( options.files ) {
				// add any specific files specified in the options
				if ( !Array.isArray( options.files ) ) {
					options.files = [ options.files ];
				}
				for ( let i=0; i<options.files.length; ++i ) {
					let file = options.files[i];
					mucc.put( file.contents || '', joinUrl( url, { type: 'tag', name: tagName }, file.path ) );
				}
			}
			mucc.commit( { msg: tagComment }, function( err ) {
				err ? reject( err ) : resolve();
			} );
		} );
	} else {
		// switch & use local copy to commit changes
		return new Promise( function( resolve, reject ) {
			let mucc = new svn.util.MuccHelper();
			// create tag folder from same revision of working copy
			mucc.cp( branchUrl, tagUrl, { revision: options.revision } );
			mucc.commit( { msg: tagComment }, function( err ) {
				err ? reject( err ) : resolve();
			} );
		} )
		.then( function() {
			return new Promise( function( resolve, reject ) {
				svn.commands.switch( tagUrl, dir, function( err ) {
					err ? reject( err ) : resolve();
				} );
			} );
		} )
		.then( function() {
			return new Promise( function( resolve, reject ) {
				// commit local changes only
				svn.commands.commit( dir, options.commentPrefix + 'Committing local changes', function( err, stdout ) {
					err ? reject( err ) : resolve( stdout );
				} );
			} );
		} )
		.then( function( commitStdout ) {
			if ( options.merge ) {
				// cherry-pick commit just created and apply to original branch
				let matches = commitStdout.match( /Committed revision\s+(\d+)\./ );
				if ( matches && matches.length > 1 ) {
					let commitRevision = matches[1];
					return cherryPickMerge( tagUrl, commitRevision, url, options );
				}
			}
			return new Promise( function( resolve ) { resolve(); } ); // no-op
		} )
		.then( function() {
			if ( !options.files ) {
				return;
			}
			return new Promise( function( resolve, reject ) {
				let mucc = new svn.util.MuccHelper();
				if ( options.files ) {
					// add any specific files specified in the options
					if ( !Array.isArray( options.files ) ) {
						options.files = [ options.files ];
					}
					for ( let i=0; i<options.files.length; ++i ) {
						let file = options.files[i];
						mucc.put( file.contents || '', joinUrl( url, { type: 'tag', name: tagName }, file.path ) );
					}
				}
				mucc.commit( { msg: options.commentPrefix + 'Adding files' }, function( err ) {
					err ? reject( err ) : resolve();
				} );
			} );
		} )
		.then( function() {
			return new Promise( function( resolve, reject ) {
				// switch back to branch
				// TODO: do this on error too
				svn.commands.switch( branchUrl, dir, function( err ) {
					err ? reject( err ) : resolve();
				} );
			} );
		} );
	}
}


export function getUrlHeadRevision( url, targetDesc ) {
	return new Promise( function( resolve, reject ) {
		// get the current HEAD revision on the url.
		svn.util.getRevision( joinUrl( url, targetDesc ), function( err, rev ) {
			return err ? reject( err ) : resolve( rev );
		} );
	} );
}


export function getWorkingCopyRevision( dir ) {
	return new Promise( function( resolve, reject ) {
		svn.util.getWorkingCopyRevision( dir, { lastChangeRevision: true }, function( err, result ) {
			err ? reject( err ) : resolve( result.high );
		} );
	} );
}


export function listTags( url ) {
	return new Promise( function( resolve, reject ) {
		svn.util.getTags( joinUrl( url, null ), function( err, result ) {
			let names = [];
			if ( !err ) {
				names = result.map( function( res ) {
					return res.name;
				} );
			}
			err ? reject( err ) : resolve( names );
		} );
	} );
}


export function exportDir( wc, outDir ) {
	return new Promise( function( resolve, reject ) {
		svn.commands.export( wc, outDir, { force: true }, function( err ) {
			err ? reject( err ) : resolve();
		} );
	} );
}


export async function createBranch( dir, branchName, options ) {
	options = options || {};
	let info = await getWorkingCopyInfo( dir );
	let rev = await getWorkingCopyRevision( dir );
	let wcUrl = joinUrl( info.url, info.targetDesc );
	let branchUrl = joinUrl( info.url, { name: branchName, type: 'branch' } );
	
	await new Promise( function( resolve, reject ) {
		let mucc = new svn.util.MuccHelper();
		// create tag folder from same revision of working copy
		mucc.cp( wcUrl, branchUrl, { revision: rev } );
		mucc.commit( { msg: options.comment || 'Create branch' }, function( err ) {
			err ? reject( err ) : resolve();
		} );
	} );
	if ( options.doSwitch ) {
		await new Promise( function( resolve, reject ) {
			svn.commands.switch( branchUrl, dir, function( err ) {
				err ? reject( err ) : resolve();
			} );
		} );
	}
}

