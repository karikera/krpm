
import path = require('path');
import fs = require('fs');
import {access, unaccess, unaccessedFileMap, copy, copyAll, mkdir, checkModified, prom, exec} from './util';
import { Spawn } from 'krspawn';


interface VisualStudioInfo
{
	DEPOT_TOOLS_WIN_TOOLCHAIN:number;
	GYP_MSVS_VERSION:number;
	vsdir:string;
	vs2017_install:string;
}

function getVisualStudioPath(version?:number):VisualStudioInfo
{
	let vsdetail:string;
	let GYP_MSVS_VERSION:number;
	if (version === 2017)
	{
		vsdetail = "\\2017\\Community\\";
		GYP_MSVS_VERSION = 2017;
	}
	else
	{
		vsdetail = "\\2019\\Preview\\";
		GYP_MSVS_VERSION = 2019;
	}
	const vsdir = "D:\\Program Files (x86)\\Microsoft Visual Studio" + vsdetail;
	return {
		DEPOT_TOOLS_WIN_TOOLCHAIN:0,
		GYP_MSVS_VERSION,
		vsdir,
		vs2017_install:vsdir
	}
}
for /f "tokens=*" %%i in ('where cl') do set vcbin=%%~dpi
set vcbin=%vcbin:~0,-5%
new Spawn(`${vsdir}VC\\Auxiliary\\Build\\vcvars${VARS_BITS}.bat`);

const vcbin:string = process.env.vcbin;

const openGitRepo:(path:string)=>any = require('simple-git');

function copyAuto(from:string, to:string, pattern?:string[]|string):void
{
	if (pattern) return copyAll(from ,to, pattern);
	return copy(from, to);
}

interface Platform
{
	name:string;
	dirname:string;
	lib:string;
	shortName:string;
	longName:string;
}

interface Configuration
{
	name:string;
	postfix:string;
}

function makePlatform(args:{name:string, longName?:string, shortName?:string}):Platform
{
	const platform:Platform = <Platform>args;
	if (!platform.shortName) platform.shortName = platform.name;
	if (!platform.longName) platform.longName = platform.name;
	if (!platform.lib) platform.lib = vcbin + '/' + platform.shortName + '/lib';
	return platform;
}

export const Platform = {
	x86:makePlatform({
		name: 'x86',
		longName: 'Win32',
	}),
	x64:makePlatform({
		name: 'x64',
	}),
	js:makePlatform({
		name: 'Emscripten',
		shortName: 'js',
		longName: 'Emscripten'
	}),
};

export type PlatformName = keyof typeof Platform;

export interface Target
{
	configurations?:Configuration[];
	platforms?:PlatformName[];
	platformBasedHeader?:boolean;
	name?:string;
	libdir?:string;
	static?:boolean;
	noOwnGit?:boolean;
	noOwnGitRemote?:boolean;
	prebuild?:()=>Promise<void>|void;
	postbuild?:()=>Promise<void>|void;
	files:any[];
	each:(config:KRB)=>Promise<void>;
}

export var exportDir:string = '';
export const options = {
	nobuild:false,
	x86Only:false,
	x64Only:false,
	jsOnly:false,
	ignoreNotFound:false,
	commitMessage:'',
};

export function addext(list:any[], ext:string)
{
	ext = '.' + ext;
	for(var i=0;i<list.length;i++)
	{
		const comp = list[i];
		if (comp instanceof Array)
		{
			addext(comp, ext);
		}
		else
		{
			list[i] = comp + ext;
		}
	}
}

export type BuildList = (string|[string]|[string[], string]|[string, string, (string|string[])?])[];

export const hostPlatform = Platform[process.env['platform']];

export const debug:Configuration = {
	name: 'Debug',
	postfix: 'd',
};
export const release:Configuration = {
	name: 'Release',
	postfix: '',
};

export class KRB
{
	public platform:Platform;
	public config:Configuration;
	
	public postfix:string;
	public extensions:string[];

	public includeExportDir:string;
	public libExportDir:string;
	public libExportPath:string;

	constructor(public readonly target:Target)
	{
	}

	setPlatform(platform:Platform):void
	{
		this.platform = platform;
		if (this.target.platformBasedHeader)
		{
			this.includeExportDir = exportDir+'/'+platform.shortName+'/include';
			this.libExportDir = exportDir+'/'+platform.shortName+'/lib';
		}
		else
		{
			this.includeExportDir = exportDir+'/include';
			this.libExportDir = exportDir+'/lib/'+platform.shortName;
		}
		this.libExportPath = this.libExportDir+'/'+this.target.name+this.postfix+'.lib';

		if (platform === Platform.js)
		{
			this.extensions = ['bc'];
		}
		else
		{
			if (this.target.static)
			{
				this.extensions = ['lib'];
			}
			else
			{
				this.extensions = ['dll', 'lib'];
			}
		}
	}
	

	setConfig(config:Configuration):void
	{
		this.config = config;
	}


	get curl():{lib:string, include:string}
	{
		const path = `../curl/winbuild/lib/${this.platform.shortName}/${this.config.name}`;
		const lib = `${path}/lib`;
		const include = `${path}/include`;
		return {lib, include};
	}

	getOutputs(name?:string):string[]
	{
		if (!name) name = this.target.name;
		if (this.config.name === 'Debug') name += this.postfix;
		return this.extensions.map(ext=>name+'.'+ext);
	}

	exec(program:string, args:string[])
	{
		return exec(program, args);
	}

	
	vsbuild(solution_path:string, configName:string, platformName:string):void
	{
		if (options.nobuild) return;
		try
		{
			this.exec('devenv', [solution_path, '/build', configName+'|'+platformName]);
		}
		catch (e)
		{
			console.error(`Error in compile ${configName}|${platformName}`);
			throw e;
		}
	}

	copy(srcdir:string, destdir:string, list:BuildList):void
	{
		for(var item of list)
		{
			let src:string|string[];
			let dest:string;
			let pattern:string[]|string|undefined;
			if (item instanceof Array)
			{
				pattern = item[2];
				src = item[0];
				if (item[1] !== undefined)
				{
					dest = item[1];
				}
				else
				{
					const todest = item[0];
					if (todest instanceof Array) throw Error('Must set dest when with multi source');
					dest = todest;
				}
			}
			else
			{
				src = item;
				dest = item;
			}

			dest = destdir + '/' + dest;
			try
			{
				if (src instanceof Array)
				{
					this._libsum(src.map(s=>srcdir+'/'+s), dest);
				}
				else
				{
					copyAuto(srcdir + '/' + src, dest, pattern);
				}
			}
			catch(err)
			{
				if (options.ignoreNotFound && err.code === 'ENOENT')
				{
				}
				else throw err;
			}
		}
	}

	private _libsum(libs:string[], out:string):void
	{
		mkdir(path.dirname(out));
		access(out);
		if (!checkModified(out, libs))
			return;
		
		if (this.platform == Platform.js)
		{
			this.exec('cmd', ['/c', 'emcc', '-o', out, ...libs]);
		}
		else
		{
			// '/IGNORE:4006'
			var params = ['/NOLOGO', '/OUT:' + out, '/MACHINE:' + this.platform.shortName.toUpperCase()];
			if (this.config.name === 'Release') params.push('/LTCG');
			params.push(...libs);
			params.push('/IGNORE:4221'); // empty cpp link
			this.exec(this.platform.lib, params);
		}
	}
	
	async gitCommitPush(commitmsg:string)
	{
		function handler(command:string, stdout:NodeJS.ReadableStream, stderr:NodeJS.ReadableStream)
		{
			console.log(`git ${command}`);
			stdout.pipe(process.stdout);
			stderr.pipe(process.stderr);
		}

		const srcrepo = openGitRepo('.');
		srcrepo.outputHandler(handler);
		
		if (!this.target.noOwnGit)
		{
			await prom(cb=>srcrepo.raw(['add', '-A', '.'], cb));
			await prom(cb=>srcrepo.commit(commitmsg,cb));
			if (!this.target.noOwnGitRemote)
			{
				await prom(cb=>srcrepo.push('origin','master',cb));
			}
		}

		const pubrepo = openGitRepo(exportDir);
		pubrepo.outputHandler(handler);

		await prom(cb=>pubrepo.raw(['add', '-A', '.'], cb));
		await prom(cb=>pubrepo.commit(commitmsg,cb));
		await prom(cb=>pubrepo.push('origin','master',cb));
	}


}

export async function install(name:string):Promise<void>
{
}

export async function publish(target:Target):Promise<void>
{
	try
	{
		if (!target.name)
		{
			target.name = path.basename(process.cwd());
		}
		console.log(`publish ${target.name}`);
		
		exportDir = '../' + target.name + '-bin';
			
		await unaccess([exportDir+"/**","!"+exportDir+'/lib/**']);
		
		await mkdir(exportDir);
		await mkdir(exportDir + '/lib');

		if (options.x86Only || options.x64Only || options.jsOnly)
		{		
			target.platforms = [];
			if (options.x86Only) target.platforms.push('x86');
			if (options.x64Only) target.platforms.push('x64');
			if (options.jsOnly) target.platforms.push('js');
		}
		else
		{
			if (!target.platforms)
			{
				target.platforms = ['x86', 'x64','js'];
			}
		}
		if (!target.configurations)
		{
			target.configurations = [debug, release];
		}

		if (target.prebuild) await target.prebuild();

		const krb = new KRB(target);
		for (const _platform of target.platforms)
		{
			krb.setPlatform(Platform[_platform]);

			const platformDir = exportDir+'/lib/'+krb.platform.shortName;
			await unaccess(platformDir);
			await mkdir(platformDir);
			for (const config of target.configurations)
			{
				// setConfig
				krb.setConfig(config);
				await target.each(krb);
			}
		}
		await krb.copy('.', exportDir, target.files);
		if (target.postbuild) await target.postbuild();
		if (options.commitMessage) await krb.gitCommitPush(options.commitMessage);
		const unaccessedList = [...unaccessedFileMap.values()];
		unaccessedFileMap.clear();
		for (var i=unaccessedList.length-1; i >= 0 ;i--)
		{
			const file = unaccessedList[i];
			console.log('delete '+file);
			try
			{
				await prom(cb=>fs.unlink(file, cb));
			}
			catch(err)
			{
				if ((<NodeJS.ErrnoException>err).code === 'EPERM')
				{
					await prom(cb=>fs.rmdir(file, cb));
				}
			}
		}
	}
	catch (e)
	{
		console.error(e);
	}
}
