import { execSync } from "child_process";
import path = require('path');

interface VisualStudioInfo
{
	installationPath:string;
	displayName:string;
	version:number;

	DEPOT_TOOLS_WIN_TOOLCHAIN:number;
	GYP_MSVS_VERSION:number;
	vs2017_install:string;
	productPath:string;
}

function getVisualStudioPath():VisualStudioInfo
{
	const vspath = JSON.parse(execSync(`${path.join(__dirname, 'vswhere.exe')} -format json`).toString()) as VisualStudioInfo[];

	let selected:VisualStudioInfo|null = null;
	let version = 0;
	for (const v of vspath)
	{
		const name = v.displayName;
		v.version = +name.substr(name.length-4);
		if (v.version > version)
		{
			version = v.version;
			selected = v;
		}
	}
	if (!selected) throw Error('Visual studio does not installed');

	let GYP_MSVS_VERSION:number;
	if (selected.displayName.endsWith('2017'))
	{
		GYP_MSVS_VERSION = 2017;
	}
	else if(selected.displayName.endsWith('2019'))
	{
		GYP_MSVS_VERSION = 2019;
	}
	else
	{
		throw Error('Unknown version: '+ selected.displayName);
	}
	selected.DEPOT_TOOLS_WIN_TOOLCHAIN = 0;
	selected.GYP_MSVS_VERSION = GYP_MSVS_VERSION;
	selected.vs2017_install = selected.installationPath;
	return selected;
}

export = getVisualStudioPath();
