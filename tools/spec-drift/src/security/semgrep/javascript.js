// Test fixture for javascript.yml (semgrep --test). Never scanned as code: it violates the rules on purpose.
const child_process = require('node:child_process');
const crypto = require('node:crypto');
const https = require('node:https');

function handlers(req, db, el) {
	// ruleid: security.js.command-injection
	child_process.exec(`git log ${req.query.ref}`);
	// ruleid: security.js.command-injection
	child_process.execSync('ls ' + req.query.dir);
	// ok: security.js.command-injection
	child_process.execFile('git', ['log', req.query.ref]);

	// ruleid: security.js.code-injection
	eval(req.body.expr);
	// ok: security.js.code-injection
	eval('1 + 1');

	// ruleid: security.js.dom-xss
	el.innerHTML = req.query.name;
	// ok: security.js.dom-xss
	el.innerHTML = '<b>static</b>';

	// ruleid: security.js.sql-injection
	db.query(`SELECT * FROM users WHERE id = ${req.params.id}`);
	// ok: security.js.sql-injection
	db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);

	// ruleid: security.js.weak-hash
	crypto.createHash('md5');
	// ok: security.js.weak-hash
	crypto.createHash('sha256');

	// ruleid: security.js.tls-verification-disabled
	https.request({ host: 'x', rejectUnauthorized: false });
	// ok: security.js.tls-verification-disabled
	https.request({ host: 'x', rejectUnauthorized: true });
}

module.exports = { handlers };
