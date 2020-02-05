import { Configuration, Platform, BuildList, Options } from ".";
import { TargetResolved } from "./target";
import { execSync } from "child_process";
import vspath = require("./vspath");
import path = require("path");
import { mkdir, access, checkModified, copyAuto } from "./util";

export class Build
{
	public config:Configuration;
	public postfix:string;
	public libExportPath:string;

	public platform:Platform;
	public extensions:string[];
	public includeExportDir:string;
	public libExportDir:string;

	public readonly options:Options;

	constructor(public readonly target:TargetResolved)
	{
		this.options = this.target.options;
	}

	setPlatform(platform:Platform):void
	{
		this.platform = platform;
		if (this.target.platformBasedHeader)
		{
			this.includeExportDir = this.target.exportDir+'/'+platform.shortName+'/include';
			this.libExportDir = this.target.exportDir+'/'+platform.shortName+'/lib';
		}
		else
		{
			this.includeExportDir = this.target.exportDir+'/include';
			this.libExportDir = this.target.exportDir+'/lib/'+platform.shortName;
		}

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
		this.postfix = config.postfix;
		this.libExportPath = this.libExportDir+'/'+this.target.name+this.postfix+'.lib';
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

	exec(commandline:string):void
	{
		console.log(commandline);
		const cmd = `setlocal & call "${vspath.installationPath}\\VC\\Auxiliary\\Build\\vcvars${this.platform.shortName === 'x86' ? 32 : 64}.bat" & ${commandline} & endlocal`;
		execSync(cmd, { stdio: 'inherit' });
	}

	vsbuild(solution_path:string, configName?:string, platformName?:string):void
	{
		if (this.options.nobuild) return;
		if (!configName) configName = this.config.name;
		if (!platformName) platformName = this.platform.name;
		try
		{
			this.exec(`devenv "${solution_path}" /build "${configName}|${platformName}"`);
		}
		catch (e)
		{
			console.error(`Error in compile ${configName}|${platformName}`);
			throw e;
		}
	}

	copylib(name?:string, srcdir?:string, destdir?:string):void
	{
		this.copy(srcdir || `bin/${this.platform.longName}/${this.config.name}`, 
			destdir || this.libExportDir, 
			this.getOutputs(name));
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
				if (this.options.ignoreNotFound && err.code === 'ENOENT')
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
			this.exec(`cmd /c emcc -o out "${libs.join('" "')}"`);
		}
		else
		{
			// '/IGNORE:4006'
			var cmd = `${this.platform.lib} /NOLOGO /OUT:${out} /MACHINE: ${this.platform.shortName.toUpperCase()}`;
			if (this.config.name === 'Release') cmd += ' /LTCG';
			cmd += ' "';
			cmd += libs.join('" "');
			cmd += '" /IGNORE:4221'; // empty cpp link
			this.exec(cmd);
		}
	}
}