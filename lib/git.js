'use strict';

var path = require( 'path' );
var fs = require( 'fs-extra' );
var uuid = require( 'node-uuid' );
var spawn = require( 'child_process' ).spawn;
var getTempDir = require( './getTempDir.js' );


// Use http://stackoverflow.com/questions/7439563/how-to-ssh-to-localhost-without-password
// to prevent being prompted for password
var g_serverUser = process.env.USER || 'git';

function printError( stde, args ) {
	var argsString = args.join( " " );
//	winston.error( "'git " + argsString + "'" );
//	winston.error( stde );
}


// used if the git library doesn't support what we need to do
function executeGit( args, options ) {
	options = options || {};
	return new Promise( function( resolve, reject ) {
		var stdo = '';
		var stde = '';
		var proc = spawn( 'git', args, { cwd: options.cwd ? options.cwd : process.cwd(), detached: true } );
	//	proc.stdin.pipe( process.stdin );
		proc.stderr.on( 'data', function( data ) {
			stde += data.toString();
		} );
		proc.stdout.on( 'data', function( data ) {
			stdo += data.toString();
		} );
		proc.on( 'error', function( err ) {
			if ( options.ignoreError ) {
				resolve( { out: stdo, code: 0 } );
			} else {
				printError( stde, args );
				reject( err );
			}
		} );
		proc.on( 'close', function( code ) {
			if ( code !== 0 && !options.ignoreError ) {
				if ( !options.quiet ) {
					printError( stde, args );
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


export function formatBowerDependencyUrl( url, targetDesc ) {
	var suffix;
	if ( targetDesc && ( targetDesc.type === 'branch' || targetDesc.type === 'tag' ) ) {
		suffix = targetDesc.name;
	} else {
		suffix = 'master';
	}
	return url + '#' + suffix;
}


export async function isWorkingCopyClean( dir, filename ) {
	let args = ['diff', 'HEAD'];
	if ( filename ) {
		args.push( '--' );
		args.push( filename );
	}
	let out = ( await executeGit( args, { cwd: dir } ) ).out;
	out.trim();
	return out.length === 0;
}


async function updateOne( dir ) {
	let clean = await isWorkingCopyClean( dir );
	let stashName = uuid.v4();
	if ( !clean ) {
		await executeGit( [ 'stash', 'save', stashName ], { cwd: dir } );
		// check if it got saved
		let listOut = ( await executeGit( [ 'stash', 'list' ], { cwd: dir } ) ).out;
		if ( !listOut.match( stashName ) ) {
			clean = true;
		}
	}
	await executeGit( [ 'pull' ], { cwd: dir } );
	await executeGit( [ 'push' ], { cwd: dir } );
	if ( !clean ) {
		await executeGit( [ 'stash', 'pop' ], { cwd: dir } );
	}
}


export async function update( dirArray ) {
	for ( let i=0; i<dirArray.length; ++i ) {
		await updateOne( dirArray[i] );
	}
}


export function checkout( url, targetDesc, dir ) {
	return clone( url, targetDesc, dir );
}



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
export let tortoiseExe = 'TortoiseGitProc.exe';


export function isWorkingCopy( dir ) {
	return fs.existsSync( dir ) && fs.existsSync( path.join( dir, ".git" ) );
}


export function isRepoFolder( dir ) {
	return fs.existsSync( dir ) && fs.existsSync( path.join( dir, "HEAD" ) );
}


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


export async function unCat( url, targetDesc, filepath, text, msg ) {
	var tempDir = getTempDir();
	try {
		var fullPath = path.join( tempDir, filepath );
		// clone repo to temp dir first
		await clone( url, targetDesc, tempDir, { minimal: true } );
		// create file
		fs.ensureDirSync( path.dirname( fullPath ) );
		fs.writeFileSync( fullPath, text );
		// add it
		await executeGit( [ 'add', filepath ], { cwd: tempDir, ignoreError: true } );
		// commit it
		await executeGit( [ 'commit', '-m', ( msg || 'uncat' ), filepath ], { cwd: tempDir } );
		// push
		await executeGit( [ 'push', 'origin', targetDesc ? targetDesc.name : 'master' ], { cwd: tempDir } );
		// return current commit
		return await getWorkingCopyRevision( tempDir );
	}
	finally {
		fs.removeSync( tempDir );
	}
}


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
		if ( options.targetDesc && options.targetDesc.type === 'branch' ) {
			// create branch if necessary
			await executeGit( [ 'branch', name ], { cwd: checkoutDir } );
		} else  if ( options.targetDesc && options.targetDesc.type === 'tag' ) {
			// create tag if necessary
			await executeGit( [ 'tag', '-a', name, '-m', 'Creating repo: Creating tag ' + name ], { cwd: checkoutDir } );
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
		let result = ( await executeGit( [ 'symbolic-ref', '--short', '-q', 'HEAD' ], { cwd: dir, ignoreError: true } ) );
		let name = result.out.trim();
		if ( result.code === 0 && name.length > 0 ) {
			return {
				type: name === 'master' ? 'trunk' : 'branch',
				name: name
			};
		}
	}
	catch ( e ) {}

	let result = ( await executeGit( [ 'describe', '--tags', '--exact-match' ], { cwd: dir } ) ).out.trim();
	return {
		type: 'tag',
		name: result
	};
}


export async function getWorkingCopyInfo( dir ) {
	// git is a bit more complicated than svn as a repo can have multiple remotes.
	// always assume 'origin' - TODO: allow an option to change this behaviour
	let result = await executeGit( [ 'config', '--get', 'remote.origin.url' ], { cwd: dir } );
	let url = result.out.trim();
	let name;
	let bowerJsonPath = path.join( dir, 'bower.json' );
	if ( fs.existsSync( bowerJsonPath ) ) {
		let json = JSON.parse( fs.readFileSync( bowerJsonPath ) );
		name = json.name;
	}
	let targetDesc = await getCurrentTargetDesc( dir );
	return {
		name: name,
		url: url,
		targetDesc: targetDesc
	};
}


export async function createTag( dir, url, targetDesc, tagName, options ) {
	options = options || {};
	// commitLocalChanges, mergeLocalChanges, mergeBowerJson, mergeOriginalBranchTargetDesc, taggedBowerJson, workingCopyRevision, commentPrefix
	let currentBranch = ( await getCurrentTargetDesc( dir ) ).name;
	let name = options.mergeOriginalBranchTargetDesc ? options.mergeOriginalBranchTargetDesc.name : 'master';
	// create & checkout branch so we can then modify the bower.json, then create tag
	let tagstargetDesc = tagName + '_branch';
	await executeGit( [ 'fetch' ], { cwd: dir } );	
	await executeGit( [ 'checkout', '-b', tagstargetDesc, options.workingCopyRevision ], { cwd: dir } );

	let committedRevision;
	if ( options.commitLocalChanges ) {
		await executeGit( [ 'commit', '-m', options.commentPrefix + 'Committing local changes', '.' ], { cwd: dir } );
		if ( options.mergeLocalChanges ) {
			committedRevision = await getWorkingCopyRevision( dir );
		}
	}

	if ( options.taggedBowerJson  ) {
		fs.writeFileSync( path.join( dir, 'bower.json' ), JSON.stringify( options.taggedBowerJson, null, '\t' ) );
		await executeGit( [ 'add', 'bower.json' ], { cwd: dir } );
		await executeGit( [ 'commit', '-m', options.commentPrefix + 'Adding modified bower.json', 'bower.json' ], { cwd: dir } );
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
			if ( options.mergeBowerJson ) {
				await executeGit( [ 'cherry-pick', committedRevision ], { cwd: dir, quiet: true } );
			} else {
				// exclude bower.json: pass --no-commit to cherry-pick command so we can modify before commit
				await executeGit( [ 'cherry-pick', '-n', committedRevision ], { cwd: dir, quiet: true } );
				await executeGit( [ 'checkout', 'HEAD', 'bower.json' ], { cwd: dir, quiet: true } );
				await executeGit( [ 'commit', '-m', options.commentPrefix + "Merging changes with original branch '" + name + "'" ], { cwd: dir, quiet: true } );
			}
			await executeGit( [ 'push', '-u', 'origin', name ], { cwd: dir } );
//			winston.info( options.commentPrefix + "Merge to original branch '" + name + "' successful" );
		}
		catch ( err ) {
//			winston.error( options.commentPrefix + "Merge to original branch '" + name + "' failed" );
			await executeGit( [ 'reset', '--hard' ], { cwd: dir } );
		}
	//	await executeGit( [ 'push', '-u', 'origin', options.mergeOriginalBranchTargetDesc.name ], { cwd: tempDir } );
	}
	// push changes
	await executeGit( [ 'push', '-u', 'origin', tagName ], { cwd: dir } );
	await executeGit( [ 'checkout', currentBranch ], { cwd: dir } );
	await executeGit( [ 'reset', '--soft', options.workingCopyRevision ], { cwd: dir } );
}


export async function getUrlHeadRevision( url, targetDesc ) {
	let bname = targetDesc ? targetDesc.name : 'master';
	let result = ( await executeGit( [ 'ls-remote', url, bname /*'HEAD'*/ ] ) ).out.trim();
	// format: f845c467b347b715ea9984b64e74911ef3f4c27c        refs/heads/master
	let matches = result.match( /^(.+?)\s+/ );
	if ( matches && matches[1] ) {
		return matches[1];
	} else {
		throw new Error( "getUrlHeadRevision: Could not parse commit hash from '" + result + "'" );
	}
}


export async function getWorkingCopyRevision( dir ) {
	return ( await executeGit( [ 'rev-parse', 'HEAD' ], { cwd: dir } ) ).out.trim();
}


export async function listTags( url ) {
	var tempDir = getTempDir();
	let result = [];
	try {
		await clone( url, null, tempDir, { minimal: true } );
		let out = ( await executeGit( [ 'tag' ], { cwd: tempDir } ) ).out.trim();
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


export async function exportDir( dir, outdir ) {
	// from: http://stackoverflow.com/questions/160608/do-a-git-export-like-svn-export
	// git checkout-index -a -f --prefix=/destination/path/
	if ( outdir[ outdir.length-1 ] !== path.sep ) {
		outdir += path.sep;
	}
	await executeGit( [ 'checkout-index', '-a', '-f', '--prefix', outdir ], { cwd: dir } );
}


export async function createBranch( dir, branchName, doSwitch, comment ) {
	await executeGit( [ 'branch', branchName ], { cwd: dir } );
	await executeGit( [ 'push', '-u', 'origin', branchName ], { cwd: dir } );
	if ( doSwitch ) {
		await executeGit( [ 'checkout', branchName ], { cwd: dir } );
	}
}
