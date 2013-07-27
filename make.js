#!/usr/bin/env node
/*jshint shelljs:true, lastsemic:true, -W101*/

"use strict";

require("shelljs/make");
var cli = require("cli");
var pkg = require("./package.json");

var TESTS = [
	"tests/",
	"tests/stable/unit/",
	"tests/stable/regression/",
];

var OPTIONS = JSON.parse(cat("./jshint.json"));

target.all = function () {
	target.lint();
	target.test();
};

target.lint = function () {
	var jshint = require("jshint").JSHINT;
	var files = find("src")
		.filter(function (file) {
			return file.match(/\.js$/);
		})
		.concat(
			ls(__dirname + "/*.js").filter(function (file) {
				return file !== __dirname + "/demo.js";
			})
		);

	TESTS.forEach(function (dir) {
		ls(dir + "*.js").forEach(function (file) {
			files.push(file);
		});
	});

	echo("Linting files...", "\n");

	var failures = {};
	files.forEach(function (file) {
		var passed = jshint(cat(file), OPTIONS);
		process.stdout.write(passed ? "." : "F");

		if (!passed) {
			failures[file] = jshint.data();
		}
	});

	echo("\n");

	if (Object.keys(failures).length === 0) {
		cli.ok("All files passed.");
		echo("\n");
		return;
	}

	var outputError = function (err) {
		if (!err) {
			return;
		}

		var line = "[L" + err.line + "]";
		while (line.length < 10) {
			line += " ";
		}

		echo(line, err.reason);
		echo("\n");
	};

	for (var key in failures) {
		cli.error(key);
		failures[key].errors.forEach(outputError);
	}

	exit(1);
};

target.test = function () {
	var nodeunit = require("nodeunit").reporters.minimal;
	var files = [];

	TESTS.forEach(function (dir) {
		ls(dir + "*.js").forEach(function (file) {
			files.push(file);
		});
	});

	echo("Running tests...", "\n");
	nodeunit.run(files, null, function (err) {
		exit(err ? 1 : 0);
	});
};

target.build = function () {
	var browserify = require("browserify");
	var bundle = browserify("./src/stable/jshint.js");

	if (!test("-e", "./dist")) {
		mkdir("./dist");
	}

	echo("Building into dist/...", "\n");

	bundle.require("./src/stable/jshint.js", { expose: "jshint" });
	bundle.bundle({}, function (err, src) {
		[
			"//" + pkg.version,
			"var JSHINT;",
			"(function () {",
			"var require;",
			src,
			"JSHINT = require('jshint').JSHINT;",
			"}());"
		].join("\n").to("./dist/jshint-" + pkg.version + ".js");

		cli.ok("Bundle");

		// Rhino
		var rhino = cat("./dist/jshint-" + pkg.version + ".js", "./src/platforms/rhino.js");
		rhino = "#!/usr/bin/env rhino\n\n" + "var window = {};" + rhino;
		rhino.to("./dist/jshint-rhino-" + pkg.version + ".js");
		chmod("+x", "dist/jshint-rhino-" + pkg.version + ".js");
		cli.ok("Rhino");
		echo("\n");
	});
};


target.changelog = function () {
	exec("git log --format='%H|%h|%an|%s' " + pkg.version + "..HEAD", { silent: true }, function (code, output) {
		if (code !== 0)
			return void console.log("git log return code is non-zero");

		var commits = output.split("\n")
			.filter(function (cmt) { return cmt.trim() !== "" })
			.map(function (cmt) { return cmt.split("|") });

		var html = "";
		var authors = {};

		commits.forEach(function (cmt) {
			var tr = "";
			tr += "<td class='commit'><a href='https://github.com/jshint/jshint/commit/" + cmt[0] + "'>" + cmt[1] + "</a></td>";
			tr += "<td class='desc'>" + cmt[3].replace(/(#(\d+))/, "<a href='https://github.com/jshint/jshint/issues/$2/'>$1</a>") + "</td>";
			html += "<tr>" + tr + "</tr>\n";

			if (cmt[2] !== "Anton Kovalyov")
				authors[cmt[2]] = true;
		});

		console.log("<!-- auto-generated -->");
		console.log("<table class='changelog'>\n" + html + "</table>\n");
		console.log("<p class='thx'><strong>Thanks</strong> to " + Object.keys(authors).join(", ") + " for sending patches!</p>");
	});
};