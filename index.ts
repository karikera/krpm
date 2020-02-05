
import { Build } from './build';

require('source-map-support').install();

const vcbin:string|undefined = process.env.vcbin;


export interface Platform
{
	name:string;
	lib:string;
	shortName:string;
	longName:string;
}

export interface Configuration
{
	name:string;
	postfix:string;
}

function makePlatform(args:{name:string, longName?:string, shortName?:string, bits?:number}):Platform
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
		longName: 'Win32'
	}),
	x64:makePlatform({
		name: 'x64'
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
	each:(config:Build)=>Promise<void>|void;
}

export interface Options
{
	nobuild?:boolean;
	x86Only?:boolean;
	x64Only?:boolean;
	jsOnly?:boolean;
	ignoreNotFound?:boolean;
	commitMessage?:string;
}

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

export const configuration:{[key:string]:Configuration} = {
	debug:{
		name: 'Debug',
		postfix: 'd',
	},
	release:{
		name: 'Release',
		postfix: '',
	},
};
