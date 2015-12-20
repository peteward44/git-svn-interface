'use strict';


var fs = require( 'fs-extra' );
var path = require( 'path' );
var gulp = require('gulp');
var gutil = require( 'gulp-util' );
var babel = require('gulp-babel');
var rename = require('gulp-rename');
var gulpJsdoc2md = require('gulp-jsdoc-to-markdown');


fs.ensureDirSync( 'dist' );


gulp.task('docs', [ 'lib', 'js' ], function () {
	return gulp.src( 'dist/lib/git.js' ) // have to parse the compiled version
		.pipe( gulpJsdoc2md( { template: fs.readFileSync('./readme.hbs', 'utf8') } ) )
		.on('error', function (err) {
			gutil.log(gutil.colors.red('jsdoc2md failed'), err.message);
		})
		.pipe(rename( "README.md" ) )
		.pipe(gulp.dest( path.join( 'dist' ) ) );
});


gulp.task('js', function () {
    return gulp.src( [ './index.js' ] )
        .pipe( babel() )
        .pipe( gulp.dest( path.join( 'dist' ) ) );
});

gulp.task('lib', function () {
	fs.ensureDirSync( path.join( 'dist', 'lib' ) );
    return gulp.src( [ './lib/**/*' ] )
        .pipe( babel() )
        .pipe( gulp.dest( path.join( 'dist', 'lib' ) ) );
}); 
 
gulp.task('copy', function () {
	var copyFiles = [ 'package.json', 'LICENSE' ];
    return gulp.src( copyFiles )
        .pipe( gulp.dest( 'dist' ));
});

gulp.task('default', [ 'js', 'lib', 'copy', 'docs' ] );

