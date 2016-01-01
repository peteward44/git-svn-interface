'use strict';

var path = require( 'path' );
var fs = require( 'fs-extra' );
var uuid = require( 'node-uuid' );
var getTempDir = require( './getTempDir.js' );
var doSpawn = require( './doSpawn.js' );

/**
 * @module git-svn-interface
 */


// Use http://stackoverflow.com/questions/7439563/how-to-ssh-to-localhost-without-password
// to prevent being prompted for password
var g_serverUser = process.env.USER || 'git';

function printError( err, args ) {
	var argsString = args.join( " " );
	console.error( "'git " + argsString + "'" );
	console.error( err );
}





// used if the git library doesn't support what we need to do
function executeGit( args, options ) {
	options = options || {};
	return new Promise( function( resolve, reject ) {
		var stdo = '';
		console.log( "git " + args.join( " " ) );
		var proc = doSpawn( 'git', args, { cwd: options.cwd ? options.cwd : process.cwd(), stdio: [ 'ignore', 'pipe', 'ignore' ] } );
//		process.stdin.setEncoding( 'utf-8' );
//		proc.stdin.setEncoding( 'utf-8' );
		//process.stdin.setRawMode( true );
//		process.stdin.pipe( proc.stdin, { end: true } );
	//	process.stdin.resume();
//		proc.stderr.pipe( process.stderr, { end: true } );

		 function onStdout( data ) {
                                stdo += data.toString();
                        }

		function unpipe() {
			try {
	//		process.stdin.unpipe();
                    //    proc.stderr.unpipe();
                        if ( !options.captureStdout ) {
                    //            proc.stdout.unpipe();
                        } else {
				proc.stdout.removeListener( 'data', onStdout );
			}
			try { process.stdout.end(); } catch ( err ) {}
			try { process.stderr.end(); } catch ( err ) {}
		//	proc.kill();
	//		proc.stdin.flush();
	//		proc.stdin.end();
	//		process.stdin.flush();
	//		process.stdin.end();
			}
			catch ( err ) {
				console.error( err );
			}	
		}

		if ( options.captureStdout ) {
			proc.stdout.on( 'data', onStdout );
		} else {
//			proc.stdout.pipe( process.stdout, { end: true } );
		}
		proc.on( 'error', function( err ) {
			console.log( "git error" );
			unpipe();
			if ( options.ignoreError ) {
				resolve( { out: stdo, code: 0 } );
			} else {
				printError( err, args );
				reject( err );
			}
		} );
		proc.on( 'exit', function( code ) {
			console.log( "git exit" );
			unpipe();
		//	proc.emit( 'close' );

		} );
		proc.on( 'close', function( code ) {
			console.log( "git ended" );
			unpipe();
			if ( code !== 0 && !options.ignoreError ) {
				if ( !options.quiet ) {
					printError( '', args );
				}
				reject( new Error( "Error running git" ) );
			} else {
				resolve( { out: stdo, code: code } );
			}
		} );
	} );
}


function clone( url, targetDesc, dir, options ) {
	options = options || {};
	
	var args = [
		'clone',
		url,
		dir
	];
	var minimalOptions = [
		'--no-checkout'
		//'--depth=1' // breaks the tag command
	];
	if ( options.minimal ) {
		args.splice( 1, 0, ...minimalOptions );
	}
	if ( targetDesc ) {
		if ( targetDesc.type !== 'trunk' ) {
			args.push( '-b', targetDesc.name );
		}
	}
	fs.ensureDirSync( dir );
	return executeGit( args );
}


// converts dir pointing to a bare repo to a url
function formatRepoUrl( dir ) {
	dir = path.resolve( dir );
	dir = dir.replace( /\\/g, '/' );
	return g_serverUser + '@127.0.0.1:' + dir;
	//return 'file:///' + dir;
}


/** Takes the URL / target description and creates a dependency URL that can be used by bower
 * @param {string} url URL
 * @param {object} [targetDesc] Target description
 * @returns {string} bower URL
 */
export function formatBowerDependencyUrl( url, targetDesc ) {
	var suffix;
	if ( targetDesc && ( targetDesc.type === 'branch' || targetDesc.type === 'tag' ) ) {
		suffix = targetDesc.name;
	} else {
		suffix = 'master';
	}
	return url + '#' + suffix;
}


/** Checks if a working copy is clean
 * @param {string} dir Working copy
 * @param {string|Array} [filename] Optional specific filename to check
 */
export async function isWorkingCopyClean( dir, filename ) {
	let args = ['diff', 'HEAD'];
	if ( filename ) {
		args.push( '--' );
		if ( Array.isArray( filename ) ) {
			args = args.concat( filename );
		} else {
			args.push( filename );
		}
	}
	let out = ( await executeGit( args, { cwd: dir, captureStdout: true } ) ).out;
	out.trim();
	return out.length === 0;
}


async function updateOne( dir ) {
	try {
		let clean = await isWorkingCopyClean( dir );
		let stashName = uuid.v4();
		if ( !clean ) {
			await executeGit( [ 'stash', 'save', stashName ], { cwd: dir } );
			// check if it got saved
			let listOut = ( await executeGit( [ 'stash', 'list' ], { cwd: dir, captureStdout: true } ) ).out;
			if ( !listOut.match( stashName ) ) {
				clean = true;
			}
		}
		await executeGit( [ 'pull' ], { cwd: dir } );
		await executeGit( [ 'push' ], { cwd: dir } );
		if ( !clean ) {
			await executeGit( [ 'stash', 'pop' ], { cwd: dir } );
		}
	} catch ( err ) {}
}


/** Updates / pulls a repo
 * @param {string|Array} dirArray Working copies to update
 */
export async function update( dirArray ) {
	if ( !Array.isArray( dirArray ) ) {
		dirArray = [ dirArray ];
	}
	for ( let i=0; i<dirArray.length; ++i ) {
		await updateOne( dirArray[i] );
	}
}


/** Checks out / clones a repo
 * @param {string} url URL
 * @param {object} [targetDesc] Target description
 * @param {string} dir Output directory
 */
export function checkout( url, targetDesc, dir ) {
	return clone( url, targetDesc, dir );
}


/** Returns true if a file exists in the repo
 * @param {string} url URL
 * @param {object} [targetDesc] Target description
 * @param {string|Array} paths File paths to check. If multiple are specified, all must exist to return true
 * @returns {boolean}
 */
export async function exists( url, targetDesc, paths ) {
	if ( !Array.isArray( paths ) ) {
		paths = [ paths ];
	}
	var remote = ( targetDesc && targetDesc.type !== 'trunk' ) ? targetDesc.name : 'master';
	var tempDir = getTempDir();
	let exists = true;
	try {
		await clone( url, targetDesc, tempDir, { minimal: true } );
		for ( var i=0; i<paths.length; ++i ) {
			var filepath = paths[i].replace( /\\/g, '/' );
			var result = await executeGit( [ 'cat-file', '-e', /*'origin/' + */remote + ':' + filepath ], { cwd: tempDir, quiet: true } );
			if ( result.code !== 0 ) {
				exists = false;
				break;
			}
		}
	}
	catch ( err ) {
		exists = false;
	}
	finally {
		fs.removeSync( tempDir );
	}
	return exists;
}


export let name = 'git';


/** Returns true if the directory is a working copy
 * @param {string} dir Directory
 * @returns {boolean}
 */
export function isWorkingCopy( dir ) {
	return fs.existsSync( dir ) && fs.existsSync( path.join( dir, ".git" ) );
}


/** Returns true if the directory is a bare repo
 * @param {string} dir Directory
 * @returns {boolean}
 */
export function isRepoFolder( dir ) {
	return fs.existsSync( dir ) && fs.existsSync( path.join( dir, "HEAD" ) );
}


/** Attempts to guess the name of the project from the URL
 * @param {string} url URL
 * @returns {string} Project name
 */
export function guessProjectNameFromUrl( url ) {
	// remove .git at end of url if necessary
	const suffix = '.git';
	if ( url.endsWith( suffix ) ) {
		url = url.substr( 0, url.length - suffix.length );
	}
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

/** Gets the contents of a file
 * @param {string} url URL
 * @param {object} [targetDesc] Target description
 * @param {string} filepath Path of file to create
 * @returns {string} File contents
 */
export async function cat( url, targetDesc, filepath ) {
	// http://stackoverflow.com/questions/2466735/how-to-checkout-only-one-file-from-git-repository
	var tempDir = getTempDir();
	try {
		var bname = 'master';
		if ( targetDesc && targetDesc.name !== 'trunk' ) {
			bname = targetDesc.name;
		}
		// clone repo to temp dir first
		await clone( url, targetDesc, tempDir, { minimal: true } );
		// checkout single file from repo
		await executeGit( [ 'checkout', bname, filepath ], { cwd: tempDir } );
		// then read in file
		let p = path.join( tempDir, filepath );
		let text = fs.readFileSync( p, 'utf8' );
		return text;
	}
	finally {
		fs.removeSync( tempDir );
	}
}


/** Opposite of 'cat' - i.e. create a file at the given path using the provided contents
 * @param {string} url URL
 * @param {object} [targetDesc] Target description
 * @param {string} filepath Path of file to create
 * @param {object|string} optionsArg Options object, or file contents
 * @param {string} optionsArg.contents File contents
 * @param {string} optionsArg.msg Commit message
 */
export async function unCat( url, targetDesc, filepath, optionsArg ) {
	let options;
	if ( typeof optionsArg === 'string' ) {
		options = { contents: optionsArg };
	} else {
		options = optionsArg;
	}
	options = options || {};
	let tempDir = getTempDir();
	try {
		let fullPath = path.join( tempDir, filepath );
		// clone repo to temp dir first
		await clone( url, targetDesc, tempDir, { minimal: true } );
		// create file
		fs.ensureDirSync( path.dirname( fullPath ) );
		fs.writeFileSync( fullPath, options.contents || '' );
		// add it
		await executeGit( [ 'add', filepath ], { cwd: tempDir, ignoreError: true } );
		// commit it
		await executeGit( [ 'commit', '-m', ( options.msg || 'uncat' ), filepath ], { cwd: tempDir } );
		// push
		await executeGit( [ 'push', 'origin', targetDesc ? targetDesc.name : 'master' ], { cwd: tempDir } );
		// return current commit
		return await getWorkingCopyRevision( tempDir );
	}
	finally {
		fs.removeSync( tempDir );
	}
}


/** Creates a bare repository
 * @param {string} dir Directory to create in - must not exist
 * @param {object} [options] Options object
 * @param {object|Array} [options.targetDesc] Create the given target descriptions in the repo
 * @returns {object} Object containing { url: 'project url', dir: 'project directory' }
 */
export async function createRepo( dir, options ) {
	options = options || {};
	// see http://stackoverflow.com/questions/2337281/how-do-i-do-an-initial-push-to-a-remote-repository-with-git
	if ( !dir.endsWith( '.git' ) ) {
		dir = dir + '.git';
	}
	fs.ensureDirSync( dir );
	var url = formatRepoUrl( dir );
	var name = 'master';
	if ( options.targetDesc ) {
		name = options.targetDesc.name;
	}
	var checkoutDir = getTempDir();
	try {
		// init bare repo
		await executeGit( [ 'init', '--bare', dir ] );
		// init checkout repo
		await executeGit( [ 'init', checkoutDir ] );
		// create empty .gitignore file as we need one file to create the HEAD revision
		fs.writeFileSync( path.join( checkoutDir, ".gitignore" ), "" );
		// do add
		await executeGit( [ 'add', '.' ], { cwd: checkoutDir } );
		// then perform a commit so the HEAD revision exists
		await executeGit( [ 'commit', '-m', 'Creating repo: Initial commit' ], { cwd: checkoutDir } );
		// add remote origin
		await executeGit( [ 'remote', 'add', 'origin', url ], { cwd: checkoutDir } );
		await executeGit( [ 'push', '-u', 'origin', 'master' ], { cwd: checkoutDir } );
		if ( options.targetDesc ) {
			if ( !Array.isArray( options.targetDesc ) ) {
				options.targetDesc = [ options.targetDesc ];
			}
			for ( let i=0; i<options.targetDesc.length; ++i ) {
				let td = options.targetDesc[i];
				let name = td.name;
				if ( td.type === 'branch' ) {
					await executeGit( [ 'branch', name ], { cwd: checkoutDir } );
				} else if ( td.type === 'tag' ) {
					await executeGit( [ 'tag', '-a', name, '-m', 'Creating repo: Creating tag ' + name ], { cwd: checkoutDir } );
				}
			}
		}
		// push
		await executeGit( [ 'push', '-u', 'origin', name ], { cwd: checkoutDir } );
		return { url: url, dir: dir };
	}
	finally {
		fs.removeSync( checkoutDir );
	}
}


async function getCurrentTargetDesc( dir ) {
	// from http://stackoverflow.com/questions/18659425/get-git-current-branch-tag-name
	try {
		let result = ( await executeGit( [ 'symbolic-ref', '--short', '-q', 'HEAD' ], { cwd: dir, ignoreError: true, captureStdout: true } ) );
		let name = result.out.trim();
		if ( result.code === 0 && name.length > 0 ) {
			return {
				type: name === 'master' ? 'trunk' : 'branch',
				name: name
			};
		}
	}
	catch ( e ) {}

	let result = ( await executeGit( [ 'describe', '--tags', '--exact-match' ], { cwd: dir, captureStdout: true } ) ).out.trim();
	return {
		type: 'tag',
		name: result
	};
}


/** Gets information on a working copy
 * @param {string} dir Working copy directory
 * @returns {object} Object containing { name: 'project name', url: 'url', targetDesc: {} }
 */
export async function getWorkingCopyInfo( dir ) {
	// git is a bit more complicated than svn as a repo can have multiple remotes.
	// always assume 'origin' - TODO: allow an option to change this behaviour
	let result = await executeGit( [ 'config', '--get', 'remote.origin.url' ], { cwd: dir, captureStdout: true } );
	let url = result.out.trim();
	let targetDesc = await getCurrentTargetDesc( dir );
	return {
		name: guessProjectNameFromUrl( url ),
		url: url,
		targetDesc: targetDesc
	};
}

/**
 * Creates a tag, optionally adding any specific files to the tag or committing any local changes
 * @param {string} dir Working copy directory
 * @param {string} url Url
 * @param {object} [targetDesc] Target description
 * @param {string} [tagName] Name of new tag
 * @param {object} [options] Options
 * @param {boolean} [options.commit] Commit any uncommited changes in the working copy as part of the tag.
 * @param {object} [options.merge] Specify this if you wish to merge the local changes into another branch. commit must be true
 * @param {object} [options.merge.targetDesc] Target description of the branch to merge back into - defaults to master / trunk
 * @param {Array} [options.merge.exclude] Array of files to ignore as part of the merge back operation.
 * @param {string} [options.commentPrefix] The prefix to use for each commit comment
 * @param {string} [options.revision] The revision/commit ID to create a tag at
 * @param {Array} [options.files] Array of files to add explicitly to the tag. Takes the format { path: 'text.txt', content: 'this is the contents' }
 */
export async function createTag( dir, url, targetDesc, tagName, options ) {
	options = options || {};
	let mergeOptions = options.merge ? options.merge : null;
	let currentBranch = ( await getCurrentTargetDesc( dir ) ).name;
	let name = ( options.merge && options.merge.targetDesc ) ? options.merge.targetDesc.name : 'master';
	// create & checkout branch so we can then add any specified files, then create tag
	let tagstargetDesc = tagName + '_branch';
	await executeGit( [ 'fetch' ], { cwd: dir } );	
	await executeGit( [ 'checkout', '-b', tagstargetDesc, options.revision ], { cwd: dir } );

	let committedRevision;
	if ( options.commit ) {
		await executeGit( [ 'commit', '-m', options.commentPrefix + 'Committing local changes', '.' ], { cwd: dir } );
		if ( options.merge ) {
			committedRevision = await getWorkingCopyRevision( dir );
		}
	}

	if ( options.files ) {
		// add any specific files
		if ( !Array.isArray( options.files ) ) {
			options.files = [ options.files ];
		}
		let filesModified = [];
		for ( let i=0; i<options.files.length; ++i ) {
			let file = options.files[i];
			let fullpath = path.join( dir, file.path );
			if ( fs.existsSync( fullpath ) ) {
				fs.writeFileSync( fullpath, file.contents || '' );
				filesModified.push( file.path );
			}
		}
		if ( filesModified.length > 0 ) {
			await executeGit( [ 'add' ].concat( filesModified ), { cwd: dir } );
			await executeGit( [ 'commit', '-m', options.commentPrefix + 'Adding files' ].concat( filesModified ), { cwd: dir } );
		}
	}
	await executeGit( [ 'tag', '-a', tagName, '-m', options.commentPrefix + 'Creation', tagstargetDesc ], { cwd: dir } );
	// switch from new branch to original branch
	//console.log( "currentBranch", currentBranch );
	// delete the branch afterwards
	await executeGit( [ 'checkout', name ], { cwd: dir } );
	await executeGit( [ 'branch', '-D', tagstargetDesc ], { cwd: dir } );
	if ( committedRevision ) {
		try {
			await executeGit( [ 'pull' ], { cwd: dir } );
			let excludeFiles = [];
			if ( mergeOptions && mergeOptions.exclude ) {
				if ( !Array.isArray( mergeOptions.exclude ) ) {
					mergeOptions.exclude = [ mergeOptions.exclude ];
				}
				for ( let i=0; i<mergeOptions.exclude.length; ++i ) {
					let p = path.resolve( dir, mergeOptions.exclude[i] );
					if ( fs.existsSync( p ) ) {
						excludeFiles.push( p );
					}
				}
			}
			if ( excludeFiles.length > 0 ) {
				// exclude files: pass --no-commit to cherry-pick command so we can modify before commit
				await executeGit( [ 'cherry-pick', '-n', committedRevision ], { cwd: dir, quiet: true } );
				await executeGit( [ 'checkout', 'HEAD' ].concat( excludeFiles ), { cwd: dir, quiet: true } );
				await executeGit( [ 'commit', '-m', options.commentPrefix + "Merging changes with original branch '" + name + "'" ], { cwd: dir, quiet: true } );			
			} else {
				await executeGit( [ 'cherry-pick', committedRevision ], { cwd: dir, quiet: true } );
			}
			await executeGit( [ 'push', '-u', 'origin', name ], { cwd: dir } );
//			winston.info( options.commentPrefix + "Merge to original branch '" + name + "' successful" );
		}
		catch ( err ) {
//			winston.error( options.commentPrefix + "Merge to original branch '" + name + "' failed" );
			await executeGit( [ 'reset', '--hard' ], { cwd: dir } );
		}
	//	await executeGit( [ 'push', '-u', 'origin', options.merge.targetDesc.name ], { cwd: tempDir } );
	}
	// push changes
	await executeGit( [ 'push', '-u', 'origin', tagName ], { cwd: dir } );
	await executeGit( [ 'checkout', currentBranch ], { cwd: dir } );
	await executeGit( [ 'reset', '--soft', options.revision ], { cwd: dir } );
}


/** Gets the revision / commit ID of the given repository
 * @param {string} url URL
 * @param {object} [targetDesc] Optional target description
 */
export async function getUrlHeadRevision( url, targetDesc ) {
	let bname = targetDesc ? targetDesc.name : 'master';
	let result = ( await executeGit( [ 'ls-remote', url, bname /*'HEAD'*/ ], { captureStdout: true } ) ).out.trim();
	// format: f845c467b347b715ea9984b64e74911ef3f4c27c        refs/heads/master
	let matches = result.match( /^(.+?)\s+/ );
	if ( matches && matches[1] ) {
		return matches[1];
	} else {
		throw new Error( "getUrlHeadRevision: Could not parse commit hash from '" + result + "'" );
	}
}


/** Gets the revision / commit ID of the given working copy
 * @param {string} dir Working copy directory
 */
export async function getWorkingCopyRevision( dir ) {
	return ( await executeGit( [ 'rev-parse', 'HEAD' ], { cwd: dir, captureStdout: true } ) ).out.trim();
}


/** Lists all the tags that are part of the repository
 * @param {string} url URL
 */
export async function listTags( url ) {
	var tempDir = getTempDir();
	let result = [];
	try {
		await clone( url, null, tempDir, { minimal: true } );
		let out = ( await executeGit( [ 'tag' ], { cwd: tempDir, captureStdout: true } ) ).out.trim();
		let array = out.split( '\n' );
		for ( let i=0; i<array.length; ++i ) {
			let t = array[i].trim();
			if ( t.length > 0 ) {
				result.push( t );
			}
		}
	}
	finally {
		fs.removeSync( tempDir );
	}
	return result;
}


/** Exports the code from the working copy
 * @param {string} dir Working copy directory
 * @param {string} outdir Output directory, must not exist
 */
export async function exportDir( dir, outdir ) {
	// from: http://stackoverflow.com/questions/160608/do-a-git-export-like-svn-export
	// git checkout-index -a -f --prefix=/destination/path/
	if ( outdir[ outdir.length-1 ] !== path.sep ) {
		outdir += path.sep;
	}
	await executeGit( [ 'checkout-index', '-a', '-f', '--prefix', outdir ], { cwd: dir } );
}


/** Creates a branch
 * @param {string} dir Working copy directory
 * @param {string} branchName Name of branch
 * @param {object} [options] Options object
 * @param {boolean} [options.switch] Perform switch on working copy after branch creation
 */
export async function createBranch( dir, branchName, options ) {
	options = options || {};
	await executeGit( [ 'branch', branchName ], { cwd: dir } );
	await executeGit( [ 'push', '-u', 'origin', branchName ], { cwd: dir } );
	if ( options.switch ) {
		await executeGit( [ 'checkout', branchName ], { cwd: dir } );
	}
}
