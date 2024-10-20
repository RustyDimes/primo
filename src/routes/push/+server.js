import { PRIVATE_PIPE_URL, PRIVATE_PIPE_USER, PRIVATE_PIPE_PASSWORD } from '$env/static/private';
import { json } from '@sveltejs/kit';
import path from 'path';
import { vol } from 'memfs';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.cjs';

export async function POST({ request, cookies }) {
	const { site, files } = await request.json();
	// console.log(site);
	// Create a virtual file system
	const fs = vol.promises;

	const sailorConf = `
# pipe.yml
---
apps:
- name: ${site.name}
  runtime: static
  auto_restart: true
  enabled: true
  nginx:
    include_file: 'nginx.conf'
  process:
    web: 
      cmd: /
      server_name: ${site.name} www.${site.name}
      workers: 1`;
	const dir = '/';

	const nginxConf = `
location / {
	# For all files
	add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
	add_header Pragma "no-cache";
	add_header Expires "0";
	
	# Optionally force revalidation of the file by the browser
	etag off;
}`;


	await fs.rmdir(dir, { recursive: true });
	// Initialize the Git repository
	await git.init({ fs, dir, gitdir: dir, defaultBranch: 'main', bare: true });
	await git.setConfig({ fs, dir, path: 'user.name', value: 'Your Name' });
	await git.setConfig({ fs, dir, path: 'user.email', value: 'your.email@example.com' });

	for (const file of files) {
		await fs.mkdir(path.dirname(dir + file.path), { recursive: true });
		await fs.writeFile(dir + file.path, file.content);
		await git.add({ fs, force: true, dir, gitdir: dir, filepath: file.path });
	}
	await fs.writeFile('/pipe.yml', sailorConf);
	await fs.writeFile('/nginx.conf', nginxConf);
	await git.add({ fs, force: true, dir, gitdir: dir, filepath: "pipe.yml" });
	await git.add({ fs, force: true, dir, gitdir: dir, filepath: "nginx.conf" });

	await git.commit({ fs, dir, gitdir: dir, message: 'Initial commit', author: { name: 'Your Name', email: 'your.email@example.com' } });

	// Add remote
	const remoteUrl = `http://${PRIVATE_PIPE_USER}:${PRIVATE_PIPE_PASSWORD}@${PRIVATE_PIPE_URL}/${site.name}`;
	await git.deleteRemote({ fs, dir, remote: 'deploy' });
	await git.addRemote({ fs, dir, remote: 'deploy', url: remoteUrl });
	console.log(await git.listFiles({ fs, dir }));

	let pushResult = await git.push({
		fs,
		http,
		dir,
		gitdir: dir,
		remote: 'deploy',
		url: remoteUrl,
		ref: 'main',
		force: true,
		// onAuth: () => ({ username: PRIVATE_PIPE_USER, password: PRIVATE_PIPE_PASSWORD }),
	})
	console.log(pushResult);


	return json({}, { status: 200 });
}