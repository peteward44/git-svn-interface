'use strict';


var fs = require( 'fs-extra' );
var path = require( 'path' );
var gulp = require('gulp');
var babel = require('gulp-babel');

fs.ensureDirSync( 'dist' );


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
	var copyFiles = [ 'package.json', 'README.md' ];
    return gulp.src( copyFiles )
        .pipe( gulp.dest( 'dist' ));
});

gulp.task('default', [ 'js', 'lib', 'copy' ] );

