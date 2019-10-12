#!/usr/bin/env node

import path = require('path');
import { hostPlatform, options, Target, publish } from ".";


function setOption(runs:string[]):void
{
	for (var i=0;i<runs.length;)
	{
		const cmd = runs[i];
		if (cmd.startsWith('-'))
		{
			runs.splice(i, 1);
			switch(cmd)
			{
			case '--nobuild': options.nobuild = true; break;
			case '--x86': options.x86Only = true; break;
			case '--x64': options.x64Only = true; break;
			case '--js': options.jsOnly = true; break;
			case '--ignore-not-found': options.ignoreNotFound = true;
			case '-m': 
				const value = runs.splice(i, 1)[0];
				options.commitMessage = value;
				break;
			}
		}
		else
		{
			i++;
		}
	}
}

const commands = {
	async publish()
	{
		try
		{	
			const target:Target = require(path.resolve('krbuild'));
			await publish(target);
		}
		catch (err)
		{
			throw err;
		}
	},
};

(async()=>{
	if (!hostPlatform)
	{
		console.log('Unsupported host platform');
		return;
	}
	const runs = process.argv.slice(2);
	setOption(runs);
	if (runs.length === 0)
	{
		console.error("no command found");
	}
	for (const cmd of runs)
	{
		if (cmd in commands)
		{
			await commands[cmd]();
		}
		else
		{
			console.log(`Not exists command ${cmd}`);
		}
	}
})().catch(console.error);