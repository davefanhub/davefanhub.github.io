'use strict';

var fs = require('fs');
var path = require('path');
var gulp = require('gulp');
var postcssAPI = require('postcss');
var postcss = require('gulp-postcss');
var less = require('gulp-less');
var sourcemaps = require('gulp-sourcemaps');
var autoprefixer = require('autoprefixer');
var plumber = require('gulp-plumber');
var filter = require('gulp-filter');
var browserSync = require('browser-sync').create();
var reload = browserSync.reload;
var fileExists = require('file-exists');
var i2r = require('gulp-image-to-rule');
var postcssSprites = require('postcss-sprites');
var changed = require('gulp-changed');
var watch = require('gulp-watch');
var rimraf = require('gulp-rimraf');
var SSI = require('node-ssi');
var foreach = require('gulp-foreach');
var copy = require('gulp-copy');

var config = {
  paths: {
    source: {
      css: './less',
      js: './js',
      sprite: './css/images/sprite'
    },
    dist: {
      css: './css',
      js: './js',
      images: './css/images'
    },
    build: {
      path: './build',
      images: './build/images'
    }
  },
  user: {},
  isBuilding: false
};

/**
 * Gets relative path to folder
 * @param  {string} path       Full path
 * @param  {string} relativeTo Folder name
 * @return {string}            Path relative to the folder
 */
var getRelativePath = function (path, relativeTo) {
  if (path.match(new RegExp(relativeTo, 'i'))) {
    return path.split(new RegExp(relativeTo, 'i')).pop().replace(/\//g, '\\');
  } else {
    return '';
  }
};

/**
 * Gets path before folder
 * @param  {string} path       Full path
 * @param  {string} folderName Folder name
 * @return {string}            Path before the folder + folder name
 */
var getPathToFolder = function (path, folderName) {
  var match = path.match(new RegExp(folderName, 'i'));

  if (match) {
    return path.split(new RegExp(folderName, 'i')).shift() + match[0];
  } else {
    return '';
  }
};


var configFileExist = fileExists(getPathToFolder(process.env.INIT_CWD, 'server') + '/2c-gulp-config.json');

/**
 * errorHandler - error handler for less task
 * @param  {Object} errorObj
 * @return {Undefined}
 */
var errorHandler = function (errorObj) {
  browserSync.notify('Error: ' + beautifyMessage(errorObj.message));

  console.log(errorObj.message);

  this.emit('end');
};

/**
 * lessTask
 * Process styles
 * @return task
 */
function lessTask () {
  var task = gulp.src('less/style.less')
    .pipe(less().on('error', errorHandler))
    .pipe(postcss([autoprefixer]))
    .pipe(gulp.dest('css'))
    .pipe(filter('**/*.css'))
    .pipe(reload({
      stream: true
    }));

  return task;
}

/**
 * lazyRulesTask
 * @return {Undefined}
 */
function lazyRulesTask () {
  return gulp.src(config.paths.source.sprite + '/*.png', {
      allowEmpty: true
    })
    .pipe(changed(config.paths.source.sprite + '/*.png'))
    .pipe(i2r(path.resolve(config.paths.source.css + '/_sprite.less'), {
      selectorWithPseudo: '.{base}-{pseudo}, a:{pseudo} .{base}, button:{pseudo} .{base}, a.{pseudo} .{base}, button.{pseudo} .{base}, .{base}.{pseudo}',
      templates: {
        REGULAR: '<% _.forEach(images, function (image) { %><%= image.selector %> { background: url(<%= image.url %>) no-repeat 0 0; background-size: 100% 100%; width: <%= image.dimensions.width %>px; height: <%= image.dimensions.height %>px; display: inline-block; vertical-align: middle; font-size: 0; }<%= \'\\n\' %><% }); %>',
        RETINA: '@media (-webkit-min-device-pixel-ratio: <%= ratio %>), (min-resolution: <%= dpi %>dpi) {<% _.forEach(images, function (image) { %><%= \'\\n\\t\' + image.selector %> { background: url(<%= image.url %>) no-repeat 0 0; width: <%= image.dimensions.width / image.ratio %>px; height: <%= image.dimensions.height / image.ratio %>px; background-size: 100% 100%; display: inline-block; vertical-align: middle; font-size: 0; }<% }); %>}'
      }
    }))
    .pipe(gulp.dest('.'));
}

/**
 * createSprite
 */
function createSprite () {
  var spriteOpts = {
    stylesheetPath: config.paths.dist.css,
    spritePath: config.paths.dist.images,
    retina: true,
    filterBy: function (image) {
      if (/sprite\//gi.test(image.url)) {
        return Promise.resolve();
      }

      return Promise.reject();
    },

    hooks: {
      onUpdateRule: function (rule, token, image) {
        var backgroundSizeX = (image.spriteWidth / image.coords.width) * 100;
        var backgroundSizeY = (image.spriteHeight / image.coords.height) * 100;
        var backgroundPositionX = (image.coords.x / (image.spriteWidth - image.coords.width)) * 100;
        var backgroundPositionY = (image.coords.y / (image.spriteHeight - image.coords.height)) * 100;

        backgroundSizeX = isNaN(backgroundSizeX) ? 0 : backgroundSizeX;
        backgroundSizeY = isNaN(backgroundSizeY) ? 0 : backgroundSizeY;
        backgroundPositionX = isNaN(backgroundPositionX) ? 0 : backgroundPositionX;
        backgroundPositionY = isNaN(backgroundPositionY) ? 0 : backgroundPositionY;

        var backgroundImage = postcssAPI.decl({
          prop: 'background-image',
          value: 'url(' + image.spriteUrl + ')'
        });

        var backgroundSize = postcssAPI.decl({
          prop: 'background-size',
          value: backgroundSizeX + '% ' + backgroundSizeY + '%'
        });

        var backgroundPosition = postcssAPI.decl({
          prop: 'background-position',
          value: backgroundPositionX + '% ' + backgroundPositionY + '%'
        });

        rule.insertAfter(token, backgroundImage);
        rule.insertAfter(backgroundImage, backgroundPosition);
        rule.insertAfter(backgroundPosition, backgroundSize);
      }
    },
    spritesmith: {
      padding: 4
    }
  };

  return gulp.src(config.paths.dist.css + '/style.css', {
      allowEmpty: true
    })
    .pipe(postcss([postcssSprites(spriteOpts)]))
    .pipe(gulp.dest(config.paths.dist.css));
}

/**
 * browserSyncTask
 * @param  {Function} cb
 */
function browserSyncTask(cb) {
  browserSync.init({
    proxy: config.user.path || ((config.user.hostname || 'localhost') + getRelativePath(process.env.INIT_CWD, 'server')),
    port: 3000,
    open: ('open' in config.user ? config.user.open : 'external'),
    host: config.user.hostname || 'localhost',
    notify: {
      styles: [
        'display: none;',
        'padding: 7px 15px;',
        'border-radius: 0 0 3px 3px;',
        'position: fixed;',
        'font-family: Arial, sans-serif',
        'font-size: 14px;',
        'font-weight: normal;',
        'z-index: 9999;',
        'right: 0px;',
        'top: 0px;',
        'background-color: rgba(30, 30, 30, .7);',
        'color: #fff',
        'pointer-events: none;'
      ]
    },
    ghostMode: {
      clicks: false,
      scroll: true,
      forms: {
        submit: true,
        inputs: true,
        toggles: true
      }
    },
    snippetOptions: {
      rule: {
        match: /<\/body>/i,
        fn: function (snippet, match) {
          if (configFileExist) {
            return snippet + match +
              '<script src="//cdn.jsdelivr.net/pouchdb/5.2.1/pouchdb.min.js"></script>' +
              '<script type="text/javascript" src="//stargate.2c-studio.com/pixelParallel/v2/pixelParallel.build.js"></script>';
          } else {
            return snippet + match;
          }
        }
      }
    }
  }, function (err, bs) {
    function getFromCollectionById(collection, id) {
      for (var i = 0; i < collection.length; i++) {
        if (collection[i].id === id) {
          return collection[i];
        };
      };

      return null;
    };

    function saveJSONToFile(filename, object) {
      fs.writeFile(filename, JSON.stringify(object, null, 4), function (err) {
        if (err) {
          console.log(err);
        };
      });
    }

    bs.io.sockets.on('connection', function (socket) {
      var settings = null;

      socket
        .on('pixelParallel:save', function (data) {

          fs.readFile('./~QA/html-vs-design/settings.json', 'utf8', function (err, response) {
            if (err) {
              console.log(err);
            };

            settings = JSON.parse(response);

            var base64string = data.base64string.split(',').pop();

            var imageObject = {
              id: data.id,
              location: data.location,
              windowSize: data.windowSize
            };

            if (getFromCollectionById(settings.savedImages, imageObject.id)) {
              imageObject = getFromCollectionById(settings.savedImages, imageObject.id);
            } else {
              settings.savedImages.push(imageObject);
            };

            imageObject.path = data.path;
            imageObject.properties = data.properties;
            imageObject.lastChange = data.timestamp;

            fs.writeFile(imageObject.path + imageObject.id, base64string, 'base64', function (err) {
              if (err) {
                console.log(err);
              };
            });

            saveJSONToFile('./~QA/html-vs-design/settings.json', settings);
          });
        })
        .on('pixelParallel:remove', function (data) {

          fs.readFile('./~QA/html-vs-design/settings.json', 'utf8', function (err, response) {
            if (err) {
              console.log(err);
            };

            settings = JSON.parse(response);

            var imageObject = getFromCollectionById(settings.savedImages, data.id);

            if (imageObject) {
              settings.savedImages.splice(settings.savedImages.indexOf(imageObject), 1);

              fs.unlink(imageObject.path + imageObject.id, function (err) {
                if (err) {
                  console.log(err);
                };
              });

              saveJSONToFile('./~QA/html-vs-design/settings.json', settings);
            };
          });
        });
    });

    cb()
  });
};

/**
 * cleanBuild
 */
function cleanBuild () {
  return gulp.src(['build', 'build.zip'], {
      allowEmpty: true
    })
    .pipe(rimraf({
      force: true
    }));
}

/**
 * copyBuild
 */
function copyBuild () {
  return gulp.src(['**', '!~html-vs-design/', '!ssi/**', '!package.json', '!settings.json', '!peon.json', '!README.md', '!gulpfile.js', '!css/images/sprite/*', '!css/_*.css', '!css/style.css.map', '!build', '!node_modules/**', '!less/**', '!*.html', '!~QA/**', '!drone.json'], {
      allowEmpty: true
    })
    .pipe(copy('build/'))
    .pipe(gulp.dest('.'));
}

/**
 * includeBuild
 */
function includeBuild () {
  var SSI = require('node-ssi');

  var ssi = new SSI({
    baseDir: '',
    encoding: 'utf-8',
    payload: {
      v: 5
    }
  });

  var task = gulp.src(['**/*.html', '!' + config.paths.build.path + '/**/*.html', '!node_modules/**/*.html'], {
      allowEmpty: true
    })
    .pipe(compileSSI({
      dest: config.paths.build.path
    }));

  return task;
}

/**
 * watchTask
 * @param  {Function} cb
 */
function watchTask(cb) {
  gulp.watch(['less/**/*.less'], gulp.series(lessTask));
  gulp.watch(['js/**/*.js'], reload);
  gulp.watch(['*.html', 'ssi/*.shtml']).on('change', reload);
  gulp.watch([config.paths.source.sprite + '/*.png'], gulp.series(lazyRulesTask));

  cb();
}

var serve = gulp.series(browserSyncTask, lazyRulesTask, lessTask, watchTask);
var build = gulp.series(cleanBuild, lazyRulesTask, lessTask, createSprite, copyBuild, includeBuild);

gulp.task('serve', serve);
gulp.task('default', serve);
gulp.task('build', build);


/**
 * Prepare message for browser notify.
 * @param  {string} message raw message
 * @return {string}         parsed message - new lines replaced by html elements.
 */
function beautifyMessage(message) {
  return '<p style="text-align: left">' + message.replace(/\n/g, '<br>') + '</p>';
};

/**
 * ssi
 */
var ssi = new SSI({
  baseDir: '',
  encoding: 'utf-8',
  payload: {
    v: 5
  }
});

/**
 * compileSSI
 * @param  {Object} opts
 */
function compileSSI(opts) {
  opts = opts || {};

  return foreach(function (stream, file) {

    var filePath = path.relative(file.base, file.path);

    ssi.compileFile(filePath, function (err, content) {
      fs.writeFileSync(opts.dest + '/' + filePath, content);
    });

    return stream;
  });
}
