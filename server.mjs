import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const publicRoot = fileURLToPath(new URL('./public', import.meta.url));
const port = Number(process.env.PORT || 8080);
const sitePassword = process.env.SITE_PASSWORD || 'GKCello';
const cookieName = 'cello_site_auth';
const cookieValue = createHash('sha256').update(sitePassword).digest('hex');
const visitNotifyWebhook = process.env.VISIT_NOTIFY_WEBHOOK || '';

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

const publicPaths = new Set(['/cello-logo.svg', '/favicon.svg', '/favicon.ico']);

const assetExtensions = new Set([
	'.css',
	'.js',
	'.svg',
	'.ico',
	'.png',
	'.webp',
	'.avif',
	'.jpg',
	'.jpeg',
	'.gif',
	'.woff',
	'.woff2',
]);

let loginLogoSvg = '';

async function loadLoginLogo() {
	const candidates = [join(root, 'cello-logo.svg'), join(publicRoot, 'cello-logo.svg')];

	for (const logoPath of candidates) {
		try {
			const raw = await readFile(logoPath, 'utf8');
			loginLogoSvg = raw.replace(/fill="#140230"/g, 'fill="#ffffff"');
			return;
		} catch {
			// try next path
		}
	}

	loginLogoSvg = '';
}

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

function isPageView(pathname, method) {
	if (method !== 'GET') return false;
	const ext = extname(pathname);
	return !ext || ext === '.html';
}

function clientIp(request) {
	const forwarded = request.headers['x-forwarded-for']?.split(',')[0]?.trim();
	const raw = forwarded || request.socket.remoteAddress || 'unknown';
	return raw.replace(/^::ffff:/, '');
}

function isPrivateIp(ip) {
	return (
		ip === 'unknown' ||
		ip === '127.0.0.1' ||
		ip === '::1' ||
		ip.startsWith('10.') ||
		ip.startsWith('192.168.') ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
		ip.startsWith('169.254.')
	);
}

async function lookupGeo(ip) {
	if (isPrivateIp(ip)) return null;

	try {
		const response = await fetch(
			`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city`,
			{ signal: AbortSignal.timeout(2500) }
		);
		const data = await response.json();
		if (data.status !== 'success') return null;

		return {
			country: data.countryCode,
			countryName: data.country,
			region: data.regionName || '',
			city: data.city || '',
		};
	} catch {
		return null;
	}
}

function formatVisitLocation(geo) {
	if (!geo) return 'Location unknown';

	const { country, countryName, region, city } = geo;

	if (country !== 'NZ') {
		const place = [city, region].filter(Boolean).join(', ');
		return place
			? `Outside New Zealand — ${place}, ${countryName || country}`
			: `Outside New Zealand — ${countryName || country}`;
	}

	const cityLower = city.toLowerCase();
	if (cityLower.includes('auckland')) return 'Auckland, New Zealand';
	if (cityLower.includes('wellington')) return 'Wellington, New Zealand';
	if (cityLower.includes('christchurch')) return 'Christchurch, New Zealand';

	if (city) return `${city}, New Zealand`;
	if (region) return `${region}, New Zealand`;
	return 'New Zealand (city not identified)';
}

async function logAuthenticatedVisit(event, request, pathname = '/') {
	const ip = clientIp(request);
	const geo = event === 'login_success' ? await lookupGeo(ip) : null;

	const entry = {
		event,
		path: pathname,
		time: new Date().toISOString(),
		ip,
		userAgent: request.headers['user-agent'] || 'unknown',
		referer: request.headers.referer || '',
	};

	if (geo) {
		entry.city = geo.city;
		entry.region = geo.region;
		entry.country = geo.countryName;
		entry.countryCode = geo.country;
		entry.location = formatVisitLocation(geo);
	}

	console.log(`AUTH_VISIT ${JSON.stringify(entry)}`);

	if (!visitNotifyWebhook) return;

	const locationLine = entry.location ? ` — ${entry.location}` : '';
	fetch(visitNotifyWebhook, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			text: `Cello preview: ${event} — ${pathname}${locationLine} (${entry.time})`,
		}),
	}).catch((error) => {
		console.error('VISIT_NOTIFY_WEBHOOK failed', error.message);
	});
}

function sendLogin(response, failed = false) {
	const logoMarkup = loginLogoSvg
		? `<div class="logo" aria-hidden="true">${loginLogoSvg}</div>`
		: '<div class="logo-fallback" aria-hidden="true">Cello</div>';

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
			.logo,.logo-fallback{margin-bottom:2rem}
			.logo svg{display:block;width:140px;height:auto}
			.logo-fallback{font-size:2rem;font-weight:900;letter-spacing:.08em}
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
			${logoMarkup}
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

async function resolveStaticPath(pathname, baseDir = root) {
	const decodedPath = decodeURIComponent(pathname);
	const safePath = normalize(decodedPath)
		.replace(/^(\.\.[/\\])+/, '')
		.replace(/^[/\\]+/, '');
	let filePath = join(baseDir, safePath || '.');
	const fileStat = await stat(filePath).catch(() => null);

	if (fileStat?.isDirectory()) {
		filePath = join(filePath, 'index.html');
	}

	if (!fileStat && !extname(filePath)) {
		filePath = join(filePath, 'index.html');
	}

	return filePath.startsWith(baseDir) ? filePath : join(baseDir, 'index.html');
}

async function serveFile(filePath, response) {
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

async function serveStatic(request, response) {
	const url = new URL(request.url || '/', `http://${request.headers.host}`);
	const filePath = await resolveStaticPath(url.pathname, root);
	await serveFile(filePath, response);
}

async function servePublic(request, response) {
	const url = new URL(request.url || '/', `http://${request.headers.host}`);
	const filePath = await resolveStaticPath(url.pathname, publicRoot);
	await serveFile(filePath, response);
}

const server = http.createServer(async (request, response) => {
	try {
		const url = new URL(request.url || '/', `http://${request.headers.host}`);

		if (publicPaths.has(url.pathname)) {
			await servePublic(request, response);
			return;
		}

		if (url.pathname === '/login' && request.method === 'POST') {
			const body = await readRequestBody(request);
			const password = new URLSearchParams(body).get('password') || '';

			if (password === sitePassword) {
				await logAuthenticatedVisit('login_success', request, '/');
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

		if (isPageView(url.pathname, request.method)) {
			void logAuthenticatedVisit('page_view', request, url.pathname);
		}

		await serveStatic(request, response);
	} catch (error) {
		console.error(error);
		response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
		response.end('Server error');
	}
});

await loadLoginLogo();

server.listen(port, () => {
	console.log(`Cello preview listening on port ${port}`);
	if (visitNotifyWebhook) {
		console.log('Visit notifications enabled via VISIT_NOTIFY_WEBHOOK');
	}
});
