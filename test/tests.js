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
		
		helpers.promiseIt('isWorkingCopyClean - clean working copy', async function( tempDir ) {
			let result = await helpers.createRepoCheckout(
				tempDir,
				transport,
				{
					files: [
						{ path: 'file.txt', contents: 'virgin contents' }
					]
				}
			);
			assert.equal( await transport.isWorkingCopyClean( result.checkoutDir ), true, 'isWorkingCopyClean - clean working copy reports true' );
		} );
		
		helpers.promiseIt('isWorkingCopyClean - modifying an existing file', async function( tempDir ) {
			let result = await helpers.createRepoCheckout(
				tempDir,
				transport,
				{
					files: [
						{ path: 'file.txt', contents: 'virgin contents' }
					]
				}
			);
			fs.writeFileSync( path.join( result.checkoutDir, 'file.txt' ), 'modified contents' );
			assert.equal( await transport.isWorkingCopyClean( result.checkoutDir ), false, 'isWorkingCopyClean - modifying an existing file reports false' );
		} );

		// TODO: no function to add files to a working copy yet
		// helpers.promiseIt('isWo##rkingCopyClean - adding a new file', async function( tempDir ) {
			// let result = await helpers.createRepoCheckout( tempDir, transport );
			
		// } );
		
		helpers.promiseIt('update', async function( tempDir ) {
			let result = await helpers.createRepoCheckout(
				tempDir,
				transport,
				{
					files: [
						{ path: 'file.txt', contents: 'virgin contents' }
					]
				}
			);
			await transport.unCat( result.url, null, 'file2.txt', 'new file contents' );
			await transport.update( result.checkoutDir );
			assert.equal( fs.existsSync( path.join( result.checkoutDir, 'file2.txt' ) ), true, 'update works' );
		} );
		
		helpers.promiseIt('exists', async function( tempDir ) {
			let result = await helpers.createRepo(
				tempDir,
				transport,
				{
					files: [
						{ path: 'file.txt', contents: 'virgin contents' }
					]
				}
			);
			assert.equal( await transport.exists( result.url, null, 'file.txt' ), true, 'exists reports file exists' );
			assert.equal( await transport.exists( result.url, null, 'file2.txt' ), false, 'exists reports file does not exist' );
		} );
		
		helpers.promiseIt('cat', async function( tempDir ) {
			let result = await helpers.createRepo(
				tempDir,
				transport,
				{
					files: [
						{ path: 'file.txt', contents: 'virgin contents' }
					]
				}
			);
			assert.equal( await transport.cat( result.url, null, 'file.txt' ), "virgin contents", 'cat works' );
			await helpers.assertPromiseThrows( async function() { await transport.cat( result.url, null, 'file2.txt' ); }, 'cat throws on non-existant file' );
		} );
		
		helpers.promiseIt('unCat', async function( tempDir ) {
			let result = await helpers.createRepo(
				tempDir,
				transport,
				{
					files: [
						{ path: 'file.txt', contents: 'virgin contents' }
					]
				}
			);
			await transport.unCat( result.url, null, 'file2.txt', 'uncat' );
			assert.equal( await transport.exists( result.url, null, 'file2.txt' ), true, 'uncat created file' );
			assert.equal( await transport.cat( result.url, null, 'file2.txt' ), "uncat", 'uncat has put correct contents in file' );
		} );
		
		helpers.promiseIt('getWorkingCopyInfo', async function( tempDir ) {
			let result = await helpers.createRepoCheckout(
				tempDir,
				transport,
				{
					files: [
						{ path: 'file.txt', contents: 'virgin contents' }
					]
				}
			);
			let info = await transport.getWorkingCopyInfo( result.checkoutDir );
			assert.equal( info.url, result.url, 'getWorkingCopyInfo reports correct url' );
		} );

		// TODO: not sure how to test these reliably
		// helpers.promiseIt('getUrlHeadRevision', async function( tempDir ) {
		// } );
		
		// helpers.promiseIt('getWorkingCopyRevision', async function( tempDir ) {
	
		// } );
		
		// helpers.promiseIt('listTags', async function( tempDir ) {
			
		// } );
		
		helpers.promiseIt('exportDir', async function( tempDir ) {
			let result = await helpers.createRepoCheckout(
				tempDir,
				transport,
				{
					files: [
						{ path: 'file.txt', contents: 'virgin contents' }
					]
				}
			);
			
			let outDir = path.join( tempDir, uuid.v4() );
			await transport.exportDir( result.checkoutDir, outDir );
			assert.equal( fs.existsSync( path.join( outDir, 'file.txt' ) ), true, 'file exported to outdir' );
			assert.equal( transport.isWorkingCopy( outDir ), false, 'export does not create a working copy' );
		} );
		
		helpers.promiseIt('createBranch', async function( tempDir ) {
			let result = await helpers.createRepoCheckout(
				tempDir,
				transport,
				{
					files: [
						{ path: 'file.txt', contents: 'virgin contents' }
					]
				}
			);
			await transport.createBranch( result.checkoutDir, 'newbranch' );
			assert.equal( await transport.exists( result.url, { name: 'newbranch', type: 'branch' }, 'file.txt' ), true, 'uncat created file' );			
		} );
		
		helpers.promiseIt('createTag', async function( tempDir ) {
		
		} );
	} );
}

defineTests( gs.svn );
if ( os.platform() !== 'win32' ) {
	defineTests( gs.git );
}


