import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { authorize } from '$lib/server/authorize';

const dataDir = process.env.DATA_DIR || '/app/data';
const allowedBase = join(dataDir, 'stacks');

export interface FileEntry {
	name: string;
	path: string;
	type: 'file' | 'directory' | 'symlink';
	size: number;
	mtime: string;
	mode: string;
}

/**
 * GET /api/system/files
 * Browse Dockhand's local filesystem (for mount browsing)
 *
 * Query params:
 * - path: Directory path to list
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const auth = await authorize(cookies);

	if (auth.authEnabled && !await auth.can('stacks', 'edit')) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	const requestedPath = url.searchParams.get('path') || '/';
	const path = resolve(requestedPath);

	if (!path.startsWith(allowedBase)) {
		return json({ error: 'Zugriff verweigert' }, { status: 403 });
	}

	try {
		if (!existsSync(path)) {
			return json({ error: `Path not found: ${path}` }, { status: 404 });
		}

		const stat = statSync(path);
		if (!stat.isDirectory()) {
			return json({ error: `Not a directory: ${path}` }, { status: 400 });
		}

		const entries: FileEntry[] = [];
		const dirEntries = readdirSync(path, { withFileTypes: true });

		for (const entry of dirEntries) {
			try {
				const fullPath = join(path, entry.name);
				const entryStat = statSync(fullPath);

				entries.push({
					name: entry.name,
					path: fullPath,
					type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
					size: entryStat.size,
					mtime: entryStat.mtime.toISOString(),
					mode: (entryStat.mode & 0o777).toString(8).padStart(3, '0')
				});
			} catch {
				// Skip entries we can't stat (permission issues, etc.)
			}
		}

		// Sort: directories first, then alphabetically
		entries.sort((a, b) => {
			if (a.type === 'directory' && b.type !== 'directory') return -1;
			if (a.type !== 'directory' && b.type === 'directory') return 1;
			return a.name.localeCompare(b.name);
		});

		const parent = resolve(join(path, '..'));
		return json({
			path,
			parent: parent.startsWith(allowedBase) ? parent : null,
			entries
		});
	} catch (error) {
		console.error('Error listing directory:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: `Failed to list directory: ${message}` }, { status: 500 });
	}
};
