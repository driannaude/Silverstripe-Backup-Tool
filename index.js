#!/usr/bin/env node

(function() {
  'use strict';
  var fs = require('fs.extra');
  var path = require('path');
  var readline = require('readline');
  var $q = require('q');
  var colors = require('colors');
  var emoji = require('node-emoji');
  var _ = require('lodash');
  var targz = require('tar.gz');
  var walk = require('walkdir');
  var exec = require('child_process').exec;
  var program = require('commander');
  var cwd, target;
  // var args = process.argv.slice(2, process.argv.length);
  // var directory = args[0];
  // var targetDirectory = args[1];
  // var cwd = directory || '.';
  // if (cwd.indexOf('/') === cwd.length - 1) {
  //   cwd = cwd.slice(0, cwd.length - 1);
  // }
  // var target = targetDirectory || '.';
  // if (target.indexOf('/') === target.length - 1) {
  //   target = target.slice(0, target.length - 1);
  // }
  program
    .version('0.1.0')
    .arguments('<source> [destination]')
    .action(function(source, destination) {
      cwd = source || '.';
      if (cwd.indexOf('/') === cwd.length - 1) {
        cwd = cwd.slice(0, cwd.length - 1);
      }
      target = destination || '.';
      if (target.indexOf('/') === target.length - 1) {
        target = target.slice(0, target.length - 1);
      }
    })
    .option('-f, --force', 'Force an Overwrite SSPak archive if exists')
    .parse(process.argv);
  if (typeof cwd === 'undefined') {
    console.log(colors.red('\nNo source directory specified! For help run backuptool --help\n'));
    process.exit(1);
  }
  if (typeof target === 'undefined') {
    console.log(colors.red('\nNo destination directory specified! For help run backuptool --help\n'));
    process.exit(1);
  }
  console.log(colors.yellow.underline('\nStarting Export of SilverStripe Configuration\n'));
  console.log(emoji.get('open_file_folder') + '  ' + emoji.get('arrow_right') + '  Using ' + cwd + ' as source directory.');
  console.log(emoji.get('open_file_folder') + '  ' + emoji.get('arrow_left') + '  Using ' + target + ' as destination directory.\n');
  var helpers = {};
  helpers.checkExists = function(path, successMessage, errorMessage) {
    var deferred = $q.defer();
    fs.access(path, fs.F_OK, function(err) {
      if (!err) {
        // Do something
        console.log(successMessage);
        deferred.resolve();
      } else {
        // It isn't accessible
        console.log(colors.red(errorMessage));
        deferred.reject(errorMessage);
      }
    });
    return deferred.promise;
  };
  helpers.exitSuccess = function(message) {
    message = message || "\n\nDone, without errors...\n\n";
    console.log(colors.green.underline(message));
  };
  helpers.exitError = function(error, message) {
    console.log('\n');
    var err = new Error(error);
    console.log(colors.red(err.stack));
    message = message || "\n\nFailed, see errors...\n\n";
    console.log(colors.red.underline(message));
  };
  helpers.commandExists = function(commandName, callback) {
    exec('command -v ' + commandName +
      ' 2>/dev/null' +
      ' && { echo >&1 \'' + commandName + ' found\'; exit 0; }',
      //can return stderr as 3rd arg
      function(error, stdout) {
        callback(null, !!stdout);
      });
  };

  function findMySiteDir() {
    var successMessage = emoji.get('white_check_mark') + '  Found Configuration Directory. Looking for _config.php...';
    var errorMessage = emoji.get('x') + '  Can\'t Find Configuration Directory, exiting...';
    var deferred = $q.defer();
    helpers.checkExists(cwd + '/mysite', successMessage, errorMessage).then(function() {
      deferred.resolve();
    }, function(err) {
      deferred.reject(err);
    });
    return deferred.promise;
  }

  function findConfigFile() {
    var successMessage = emoji.get('white_check_mark') + '  Found Configuration File, parsing/extracting configuration....';
    var errorMessage = emoji.get('x') + '  Can\'t Find Configuration File, exiting...';
    var deferred = $q.defer();
    helpers.checkExists(cwd + '/mysite/_config.php', successMessage, errorMessage).then(function() {
      deferred.resolve();
    }, function(err) {
      deferred.reject(err);
    });
    return deferred.promise;
  }

  function setupTarballDir() {
    var deferred = $q.defer();
    fs.mkdirp(target + '/ts_backup/plugins', function(err) {
      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve();
      }
    });
    return deferred.promise;
  }

  function readConfigFile() {
    var deferred = $q.defer();
    var rd = readline.createInterface({
      input: fs.createReadStream(cwd + '/mysite/_config.php'),
      output: process.stdout,
      terminal: false
    });
    var buffer = [];
    var active = true;
    rd.on('line', function(line) {
      if (active && line.indexOf('BackupTool:ignore end') !== -1) {
        active = true;
      }
      if (active) {
        buffer.push(line);
      }
      if (!active && line.indexOf('BackupTool:ignore start') !== -1) {
        active = false;
      }
    });
    rd.on('error', function(e) {
      // something went wrong
      deferred.reject(e);
    });
    rd.on('close', function() {
      var stream = fs.createWriteStream(target + "/ts_backup/_config.bk");
      stream.once('open', function() {
        var buf = buffer.join('\n');
        buf = new Buffer(buf);
        stream.write(buf);
        stream.end();
        deferred.resolve();
      });
    });
    return deferred.promise;
  }

  function copyMySite() {
    console.log('\nBacking Up Known Configuration Directories...\n'.underline);
    var deferred = $q.defer();
    var successMessage = emoji.get('white_check_mark') + '  Found mysite folder, copying and compressing ...';
    var errorMessage = emoji.get('x') + '  Can\'t Find mysite folder, exiting...\n';
    helpers.checkExists(cwd + '/mysite', successMessage, errorMessage).then(function() {
      targz().compress(cwd + '/mysite', target + '/ts_backup/mysite.tar.gz')
        .then(function() {
          console.log(emoji.get('white_check_mark') + '  Compressed mysite to mysite.tar.gz and moved to ../ts_backup/mysite.tar.gz...');
          deferred.resolve();
        })
        .catch(function(err) {
          deferred.reject(err);
        });
    }, function(err) {
      deferred.reject(err);
    });
    return deferred.promise;
  }

  function copyThemesDirectory() {
    var successMessage = emoji.get('white_check_mark') + '  Found Themes Directory. Compressing and copying contents to ../ts_backup/themes.tar.gz...';
    var errorMessage = emoji.get('x') + '  Can\'t Find Themes Directory, exiting...';
    var deferred = $q.defer();
    helpers.checkExists(cwd + '/themes', successMessage, errorMessage).then(function() {
      targz().compress(cwd + '/themes', target + '/ts_backup/themes.tar.gz')
        .then(function() {
          console.log(emoji.get('white_check_mark') + '  Compressed themes to themes.tar.gz and moved to ../ts_backup/themes.tar.gz...');
          deferred.resolve();
        })
        .catch(function(err) {
          deferred.reject(err);
        });
    }, function(err) {
      deferred.reject(err);
    });
    return deferred.promise;
  }

  function checkTreeForNonComposerPlugins(pluginsAlreadyCompressed) {
    var deferred = $q.defer();
    var pluginsFound = [];
    if (!pluginsAlreadyCompressed) {
      pluginsAlreadyCompressed = [];
    }
    console.log('\nChecking Tree for Non-Composer Plugins...\n'.underline);
    var opts = {
      max_depth: 2
    };
    var ignoredPaths = ['.git', 'assets', 'cms', 'framework', 'mysite'];
    var walker = walk(cwd, opts, function(p) {
      if (ignoredPaths.indexOf(path.basename(p)) > -1) {
        this.ignore(p);
      }
    });
    walker.on('file', function(file) {
      var filename = file.split('/').pop();
      var dirArray = file.split('/');
      var parentDir = dirArray[dirArray.length - 2];
      if (filename === '_config.php' && pluginsFound.indexOf(parentDir) === -1 &&
        pluginsAlreadyCompressed.indexOf(parentDir) === -1) {
        pluginsFound.push(parentDir);
        console.log(emoji.get('link') + '  Found plugin: ' + parentDir);
      }
    });
    walker.on('directory', function(dir) {
      var filename = dir.split('/').pop();
      var dirArray = dir.split('/');
      var parentDir = dirArray[dirArray.length - 2];
      if (filename === '_config' && pluginsFound.indexOf(parentDir) === -1 &&
        pluginsAlreadyCompressed.indexOf(parentDir) === -1) {
        pluginsFound.push(parentDir);
        console.log(emoji.get('link') + '  Found plugin: ' + parentDir);
      }
    });
    walker.on('end', function() {
      if (pluginsFound.length <= 0) {
        if(pluginsAlreadyCompressed.length <= 0){
            console.log(emoji.get('x') + '  No plugins found at all, are you sure you\'re in the right place?'.red);
        } else {
          console.log(emoji.get('white_check_mark') + '  No non-composer plugins found. Yay for proper dependency management. Go you!'.red);
        }

        deferred.resolve();
      } else {
        compressAndSavePlugins(pluginsFound).then(function() {
          deferred.resolve();
        }, function(err) {
          deferred.reject(err);
        });
      }
    });
    return deferred.promise;
  }

  function findAndBackupPlugins() {
    console.log('\nBackup Up Composer Managed Plugins\n'.underline);
    var deferred = $q.defer();
    var successMessage = emoji.get('white_check_mark') + '  Found Composer JSON file, parsing...';
    var errorMessage = emoji.get('x') + '  Missing Composer file, guess we skip that part then...';
    helpers.checkExists(cwd + '/composer.json', successMessage, errorMessage).then(function() {
      var composerFile = require(cwd + '/composer.json');
      var requirements = composerFile.require;
      var reqBuffer = [];
      _.each(requirements, function(version, req) {
        var item = req.split('/').pop();
        reqBuffer.push(item);
      });
      deferred.resolve(reqBuffer);
    }, function(err) {
      deferred.resolve();
    });
    return deferred.promise;
  }

  function compressAndSavePlugins(plugins) {
    var deferred = $q.defer();
    var done = plugins.length;
    plugins.map(function(plugin) {
      targz().compress(cwd + '/' + plugin, target + '/ts_backup/plugins/' + plugin + '.tar.gz')
        .then(function() {
          console.log(emoji.get('white_check_mark') + '  Compressing to ' + plugin + '.tar.gz...');
          done--;
        }, function(err) {
          console.log(colors.red(err));
        })
        .catch(function(err) {
          deferred.reject(err);
        })
        .finally(function() {
          if (done <= 0) {
            deferred.resolve();
          }
        });
    });
    return deferred.promise;
  }

  function checkIfRequirementsHaveRootLevelFolders(buffer) {
    var deferred = $q.defer();
    var reserved = ['php', 'simple', 'cms', 'framework', 'reports', 'siteconfig'];
    var plugins = [];
    if (!buffer) {
      deferred.resolve();
    } else {
      buffer.map(function(plugin, i) {
        if (reserved.indexOf(plugin) !== -1) {
          return false;
        }
        var successMessage = emoji.get('link') + '  Found plugin: ' + plugin;
        var errorMessage = emoji.get('fast_forward') + '  Skipping ' + plugin;
        helpers.checkExists(cwd + '/' + plugin, successMessage, errorMessage).then(function() {
          plugins.push(plugin);
          if (i >= buffer.length - 1) {
            compressAndSavePlugins(plugins).then(function() {
              deferred.resolve(plugins);
            }, function(err) {
              deferred.reject(err);
            });
          }
        });
      });
    }
    return deferred.promise;
  }

  function rimRaff(folder) {
    var deferred = $q.defer();
    fs.rmrf(target + '/' + folder, function(err) {
      if (err) {
        deferred.reject(err);
      } else {
        var lastOne = folder.split('/').pop();
        if (lastOne.indexOf('.') > -1) {
          console.log(emoji.get('white_check_mark') + '  Deleted ' + folder + '...');
        } else {
          console.log(emoji.get('white_check_mark') + '  Cleaned out ' + folder + ' directory...');
        }
        deferred.resolve();
      }
    });
    return deferred.promise;
  }

  function sspakMyBags() {
    var deferred = $q.defer();
    exec('sspak save ' + cwd + ' ' + target + '/ts_backup/backup.sspak',
      //can return stdout && stderr as 2nd and 3rd arg
      function(err, stdout) {
        if (err) {
          var lastlines = stdout.split('Output:').pop();
          lastlines = lastlines.split('.  ');
          console.log(colors.yellow(lastlines[0].trim()));
          console.log(colors.yellow(lastlines[1].trim()));
          deferred.reject(err);
        } else {
          console.log(emoji.get('white_check_mark') + '  Backed up DB and Assets as backup.sspak...');
          deferred.resolve();
        }
      });
    return deferred.promise;
  }

  function proceedWithPacking() {
    var deferred = $q.defer();
    console.log('\nBacking Up Database and Asset Directory with SSPak\n'.underline);
    if (program.force) {
      rimRaff('backup.sspak').then(function() {
        return sspakMyBags();
      }, function(err) {
        deferred.reject(err);
      }).then(function() {
        deferred.resolve();
      }, function(err) {
        deferred.reject(err);
      });
    } else {
      sspakMyBags().then(function() {
        deferred.resolve();
      }, function(err) {
        deferred.reject(err);
      });
    }
    return deferred.promise;
  }

  function sspakAllTheThings() {
    var deferred = $q.defer();
    helpers.commandExists('sspak', function(err, exists) {
      if (exists) {
        proceedWithPacking().then(function() {
          deferred.resolve();
        }, function(err) {
          deferred.reject(err);
        });
      } else {
        deferred.reject('SSPak is required to back up your database and assets. To install it, follow the instructions at https://github.com/silverstripe/sspak');
      }
    });
    return deferred.promise;
  }

  function compressEverything() {
    console.log('\nMaking Final Tarball...\n'.underline);
    var deferred = $q.defer();
    targz().compress(target + '/ts_backup', target + '/ss_backup.tar.gz')
      .then(function() {
        console.log(emoji.get('white_check_mark') + '  Compressed ts_backup and moved to ../ss_backup.tar.gz...');
        return rimRaff('ts_backup');
      })
      .catch(function(err) {
        deferred.reject(err);
      }).then(function() {
        deferred.resolve();
      }, function(err) {
        deferred.reject(err);
      });
    return deferred.promise;
  }
  console.log('Cleaning and Rebuilding Backup Directory\n'.underline);
  // Make a promise chain to check for instance files
  rimRaff('ts_backup/').then(findMySiteDir, function(err) {
    return $q.reject(err);
  }).then(findConfigFile, function(err) {
    return $q.reject(err);
  }).then(setupTarballDir, function(err) {
    return $q.reject(err);
  }).then(copyMySite, function(err) {
    return $q.reject(err);
  }).then(copyThemesDirectory, function(err) {
    return $q.reject(err);
  }).then(findAndBackupPlugins, function(err) {
    return $q.reject(err);
  }).then(function(reqBuffer) {
    return checkIfRequirementsHaveRootLevelFolders(reqBuffer);
  }, function(err) {
    return $q.reject(err);
  }).then(checkTreeForNonComposerPlugins, function(err) {
    return $q.reject(err);
  }).then(sspakAllTheThings, function(err) {
    return $q.reject(err);
  }).then(compressEverything, function(err) {
    return $q.reject(err);
  }).then(function() {
    helpers.exitSuccess();
  }, function(err) {
    helpers.exitError(err);
  });
}());
