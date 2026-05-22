import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT || 8080);
const sitePassword = process.env.SITE_PASSWORD || 'GKCello';
const cookieName = 'cello_site_auth';
const cookieValue = createHash('sha256').update(sitePassword).digest('hex');

const mimeTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.ico': 'image/x-icon',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
};

function parseCookies(header = '') {
	return Object.fromEntries(
		header
			.split(';')
			.map((part) => part.trim().split('='))
			.filter(([key, value]) => key && value)
	);
}

function isAuthenticated(request) {
	return parseCookies(request.headers.cookie)[cookieName] === cookieValue;
}

function sendLogin(response, failed = false) {
	response.writeHead(failed ? 401 : 200, {
		'content-type': 'text/html; charset=utf-8',
		'cache-control': 'no-store',
	});
	response.end(`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Cello preview</title>
		<style>
			body{margin:0;min-height:100svh;display:grid;place-items:center;background:#140230;color:#fff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
			form{width:min(92vw,420px);padding:2rem;border:1px solid rgba(255,255,255,.18);border-radius:24px;background:rgba(255,255,255,.07)}
			img{width:140px;height:auto;filter:brightness(0) invert(1);margin-bottom:2rem}
			label,input,button{display:block;width:100%}
			label{font-weight:800;margin-bottom:.6rem}
			input{box-sizing:border-box;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:#fff;color:#140230;padding:.95rem 1rem;font:inherit}
			button{margin-top:1rem;border:0;border-radius:999px;background:#c9823b;color:#140230;padding:1rem;font-weight:900;font:inherit;cursor:pointer}
			p{color:rgba(255,255,255,.72);line-height:1.5}
			.error{color:#ffd2bd}
		</style>
	</head>
	<body>
		<form method="post" action="/login">
			<img src="/cello-logo.svg" alt="Cello" />
			<h1>Preview access</h1>
			<p>Enter the preview password to view the Cello site.</p>
			${failed ? '<p class="error">Password not recognised. Please try again.</p>' : ''}
			<label for="password">Password</label>
			<input id="password" name="password" type="password" autocomplete="current-password" autofocus />
			<button type="submit">Continue</button>
		</form>
	</body>
</html>`);
}

function readRequestBody(request) {
	return new Promise((resolve, reject) => {
		let body = '';
		request.on('data', (chunk) => {
			body += chunk;
			if (body.length > 10_000) {
				request.destroy();
				reject(new Error('Request body too large'));
			}
		});
		request.on('end', () => resolve(body));
		request.on('error', reject);
	});
}

async function resolveStaticPath(pathname) {
	const decodedPath = decodeURIComponent(pathname);
	const safePath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
	let filePath = join(root, safePath);
	const fileStat = await stat(filePath).catch(() => null);

	if (fileStat?.isDirectory()) {
		filePath = join(filePath, 'index.html');
	}

	if (!fileStat && !extname(filePath)) {
		filePath = join(filePath, 'index.html');
	}

	return filePath.startsWith(root) ? filePath : join(root, 'index.html');
}

async function serveStatic(request, response) {
	const url = new URL(request.url || '/', `http://${request.headers.host}`);
	const filePath = await resolveStaticPath(url.pathname);
	const fileStat = await stat(filePath).catch(() => null);

	if (!fileStat?.isFile()) {
		response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
		response.end('Not found');
		return;
	}

	response.writeHead(200, {
		'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream',
		'cache-control': filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
	});
	createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
	try {
		const url = new URL(request.url || '/', `http://${request.headers.host}`);

		if (url.pathname === '/login' && request.method === 'POST') {
			const body = await readRequestBody(request);
			const password = new URLSearchParams(body).get('password') || '';

			if (password === sitePassword) {
				const secure = request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
				response.writeHead(303, {
					location: '/',
					'set-cookie': `${cookieName}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=86400`,
				});
				response.end();
				return;
			}

			sendLogin(response, true);
			return;
		}

		if (!isAuthenticated(request)) {
			sendLogin(response);
			return;
		}

		await serveStatic(request, response);
	} catch (error) {
		console.error(error);
		response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
		response.end('Server error');
	}
});

server.listen(port, () => {
	console.log(`Cello preview listening on port ${port}`);
});
