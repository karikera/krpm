
import fs = require('fs');
import path = require('path');
import child_process = require('child_process');
import globby = require('globby');

export const unaccessedFileMap = new Set<string>();

export function wait<T>(fn:(cb:(arg?:T)=>void)=>void):Promise<T>
{
	return new Promise<T>((resolve, reject)=>fn((data)=>{
		resolve(data);
	}));
}

export function prom<T>(fn:(cb:(err:Error, arg?:T)=>void)=>void):Promise<T>
{
	return new Promise<T>((resolve, reject)=>fn((err, data)=>{
		if (err) reject(err);
		else resolve(data);
	}));
}

export function extFilter(ext:string):(str:string)=>boolean
{
	ext = '.'+ext;
	return function(file){
		return file.endsWith(ext);
	}
}

export function checkSame(output:string, input:string):boolean
{
	try
	{
		const stat = fs.statSync(output);
		var outsize = stat.size;
		var outmtime = +stat.mtime;
	}
	catch(err)
	{
		if (err.code !== 'ENOENT')
			throw err;
		return false;
	}
	const istat = fs.statSync(input);
	if (+istat.mtime != outmtime) return false;
	if (istat.size != outsize) return false;
	return true;
}

export function checkModified(output:string, inputs:string[]):boolean
{
	try
	{
		var outmtime = +fs.statSync(output).mtime;
	}
	catch(err)
	{
		if (err.code !== 'ENOENT')
			throw err;
		return true;
	}
	for(var input of inputs)
	{
		var mtime = +fs.statSync(input).mtime;
		if (mtime > outmtime) return true;
	}
	return false;
}

export function mkdir(dir:string):boolean
{
	access(dir);
	try
	{
		fs.mkdirSync(dir);
		console.log("mkdir " + dir);
		return true;
	}
	catch (err)
	{
		switch (err.code)
		{
			case 'EEXIST':
				return false;
			case 'ENOENT':
				if (!mkdir(path.dirname(dir)))
					throw err;
				fs.mkdirSync(dir);
				console.log("mkdir " + dir);
				return true;
			default: throw err;
		}
	}
}

export function copy(src:string, dest:string):void
{
	access(dest);
	if (checkSame(dest, src)) return;

	console.log("copy " + src + " " + dest);
	try
	{
		fs.copyFileSync(src, dest);
	}
	catch(err)
	{
		if (err.code === 'ENOENT')
		{
			mkdir(path.dirname(dest));
			fs.copyFileSync(src, dest);
		}
		else
		{
			throw err;
		}
	}
}

export async function unaccess(dir:string|string[]):Promise<void>
{
	const files = await globby(dir);
	for(const file of files)
	{
		unaccessedFileMap.add(path.resolve(file));
	}
}

export function access(file:string):void
{
	file = path.resolve(file);
	unaccessedFileMap.delete(file);

	var idx = file.length;
	while ((idx = file.lastIndexOf(path.sep, idx)) !== -1)
	{
		unaccessedFileMap.delete(file.substr(0, idx));
		idx --;
	}
}

export function accessChild(file:string):void
{
	file = path.resolve(file);
	unaccessedFileMap.delete(file);

	var idx = file.length;
	while ((idx = file.lastIndexOf(path.sep, idx)) !== -1)
	{
		unaccessedFileMap.delete(file.substr(0, idx));
		idx --;
	}

	file += path.sep;
	for (const item of unaccessedFileMap)
	{
		if (item.startsWith(file))
		{
			unaccessedFileMap.delete(item);
		}
	}
}

export function copyAll(src:string, dest:string, patterns:string[]|string):void
{
	console.log("copyall " + src + " " + dest);

	if (!(patterns instanceof Array)) patterns =[patterns];
	for (var i = 0; i < patterns.length; i++)
	{
		var pattern = patterns[i];
		if (pattern.charAt(0) === '!')
			pattern = '!' + src + '/' + pattern.substr(1);
		else
			pattern = src + '/' + pattern;
		patterns[i] = pattern;
	}
	
	const files = globby.sync(patterns);
	for (let file of files)
	{
		if (!file.startsWith(src)) continue;
		const destpath = dest + file.substr(src.length);
		access(destpath);
		const stat = fs.statSync(file);
		if (stat.isDirectory()) continue;
		copy(file, destpath);
	}
}

export function copyAuto(from:string, to:string, pattern?:string[]|string):void
{
	if (pattern) return copyAll(from ,to, pattern);
	return copy(from, to);
}
