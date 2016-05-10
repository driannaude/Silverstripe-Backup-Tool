#!/usr/bin/env node

var fs = require('fs.extra');
var path = require('path');
var readline = require('readline');
var $q = require('q');
var colors = require('colors');
var emoji = require('node-emoji');
var _ = require('lodash');

console.log(colors.yellow.underline('\nStarting Export of SilverStripe Configuration\n'));

function _checkExists(path, successMessage, errorMessage) {
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
}

// Make a promise chain to check for config files
function findMySiteDir() {
    var successMessage = emoji.get('white_check_mark') + '  Found Configuration Directory. Looking for _config.php...';
    var errorMessage = emoji.get('x') + '  Can\'t Find Configuration Directory, exiting...';
    var deferred = $q.defer();
    _checkExists('./mysite', successMessage, errorMessage).then(function(res) {
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
    _checkExists('./mysite/_config.php', successMessage, errorMessage).then(function(res) {
        deferred.resolve();
    }, function(err) {
        deferred.reject(err);
    });
    return deferred.promise;
}

function setupTarballDir() {
    fs.mkdirp('ts_backup/code', function(err) {
        if (err) {
            exitError(err);
        } else {
            readConfigFile();
        }
    });
}

function copyAdminFiles() {
    var successMessage = emoji.get('white_check_mark') + '  Found Code Folder, copying to ts_backup/code/*.* ...\n';
    var errorMessage = emoji.get('x') + '  Can\'t Find Code Folder, exiting...\n';
    _checkExists('./mysite/code', successMessage, errorMessage).then(function() {
        var walker = fs.walk('./mysite/code');
        walker.on('file', function(root, file, next) {

            // _.each(stat, function(file) {
                var filepath = path.join(root, file.name);

                fs.copy(filepath, 'ts_backup/code/' + file.name, {replace: true}, function(err) {
                    if (err) {
                        // i.e. file already exists or can't write to directory
                        throw err;
                    }
                    console.log(emoji.get('page_facing_up') + '  Copied ' + colors.yellow(file.name) + ' to ' + colors.yellow('ts_backup/code/' + file.name));
                    next();
                });

        });
        walker.on('end', function() {
          exitSuccess();
        });
    }, function(err) {
        exitError(err);
    });

}

function readConfigFile() {
    var rd = readline.createInterface({
        input: fs.createReadStream('./mysite/_config.php'),
        output: process.stdout,
        terminal: false
    });
    var buffer = [];
    var active = false;
    rd.on('line', function(line) {
        if (active && line.indexOf('BackupTool:End') !== -1) {
            active = false;
        }
        if (active) {
            buffer.push(line);
        }
        if (!active && line.indexOf('BackupTool:Start') !== -1) {
            active = true;
        }

    });

    rd.on('close', function() {
        var stream = fs.createWriteStream("ts_backup/_config.bk");
        stream.once('open', function(fd) {
            var buf = buffer.join('\n');
            buf = new Buffer(buf);
            stream.write(buf);
            stream.end();
            copyAdminFiles();
        });

    });
}

function exitSuccess(message) {
    message = message || "\n\nDone, without errors...\n\n";
    console.log(colors.green.underline(message));
}

function exitError(error, message) {
    console.log('\n');
    var err = new Error(error);
    console.log(colors.red(err.stack));
    message = message || "\n\nDone, with errors...\n\n";
    console.log(colors.red.underline(message));
}

findMySiteDir().then(findConfigFile, function(err) {
    return $q.reject(err);
}).then(function(res) {
    setupTarballDir();

}, function(err) {
    exitError(err);
});
